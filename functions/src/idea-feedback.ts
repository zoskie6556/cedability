import { getApps, initializeApp } from 'firebase-admin/app';
import {
  FieldValue,
  getFirestore,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
} from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { createRunningReport } from './lib/automated-review';
import {
  parseRequestChangesInput,
  parseResubmissionInput,
  readIdeaVersion,
} from './lib/idea-resubmission';
import { transitionIdea } from './lib/idea-transition';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

export async function requestIdeaChanges(
  request: CallableRequest<Record<string, unknown>>,
): Promise<{ feedbackId: string }> {
  const actorUid = requireEvaluator(request);
  const input = parseRequestChangesInput(request.data);
  const ideaRef = db.collection('ideas').doc(input.ideaId);
  const assignmentRef = db.collection('assignments').doc(input.assignmentId);
  const feedbackRef = ideaRef.collection('feedback').doc();

  const transitioned = await transitionIdea(
    ideaRef,
    'needs_amendment',
    input.message,
    {},
    {
      actor: { uid: actorUid, role: 'evaluator' },
      stageId: input.stageId,
      auditAction: 'idea.changes_requested',
      auditSummary: `Evaluator requested changes at stage ${input.stageId}.`,
      validate: async (transaction, idea) => {
        const assignment = await transaction.get(assignmentRef);
        if (
          !assignment.exists ||
          assignment.get('ideaId') !== input.ideaId ||
          assignment.get('stageId') !== input.stageId ||
          assignment.get('evaluatorUid') !== actorUid ||
          !['pending', 'in_progress'].includes(assignment.get('status'))
        ) {
          throw new HttpsError(
            'permission-denied',
            'This evaluator assignment is not available for a change request.',
          );
        }
        if (typeof idea.get('ownerId') !== 'string') {
          throw new HttpsError('failed-precondition', 'The idea owner is unavailable.');
        }
      },
      write: (transaction) => {
        transaction.create(feedbackRef, {
          stageId: input.stageId,
          evaluatorUid: actorUid,
          evaluatorName: evaluatorName(request),
          message: input.message,
          requiresResubmission: true,
          reply: null,
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.update(assignmentRef, {
          status: 'done',
          updatedAt: FieldValue.serverTimestamp(),
        });
      },
    },
  );

  if (!transitioned) {
    throw new HttpsError(
      'failed-precondition',
      'This idea is no longer at a stage where changes can be requested.',
    );
  }
  return { feedbackId: feedbackRef.id };
}

export async function resubmitIdea(
  request: CallableRequest<Record<string, unknown>>,
): Promise<{ ideaId: string; version: number }> {
  const actorUid = requireAuthenticated(request);
  const input = parseResubmissionInput(request.data, actorUid);
  const ideaRef = db.collection('ideas').doc(input.ideaId);
  const startedAt = Timestamp.now();
  let archiveRef: DocumentReference | null = null;
  let archiveAlreadyExists = false;

  const transitioned = await transitionIdea(
    ideaRef,
    'ai_screening',
    'The submitter updated and resubmitted this idea.',
    {
      category: null,
      similarityCheck: null,
      automatedReview: createRunningReport(startedAt),
    },
    {
      actor: { uid: actorUid, role: 'owner' },
      auditAction: 'idea.resubmitted',
      auditSummary: 'The idea owner updated and resubmitted the idea.',
      ideaFields: {
        ...input.plan,
        version: input.expectedVersion + 1,
        submittedAt: FieldValue.serverTimestamp(),
        aiAnalysisConsentAt: FieldValue.serverTimestamp(),
      },
      validate: async (transaction, current) => {
        if (current.get('ownerId') !== actorUid) {
          throw new HttpsError('permission-denied', 'Only the idea owner can resubmit it.');
        }
        if (current.get('status') !== 'needs_amendment') {
          throw new HttpsError(
            'failed-precondition',
            'This idea is no longer waiting for an amendment.',
          );
        }
        const currentVersion = readIdeaVersion(current.get('version'));
        if (currentVersion !== input.expectedVersion) {
          throw new HttpsError(
            'aborted',
            'This idea changed after you opened the form. Reload it before resubmitting.',
          );
        }
        if (currentVersion >= Number.MAX_SAFE_INTEGER) {
          throw new HttpsError('failed-precondition', 'The idea version cannot be incremented.');
        }

        const versionRef = ideaRef.collection('versions').doc(String(currentVersion));
        archiveRef = versionRef;
        const archivedVersion = await transaction.get(versionRef);
        archiveAlreadyExists = archivedVersion.exists;
      },
      write: (transaction, current) => {
        if (archiveRef && !archiveAlreadyExists) {
          transaction.create(archiveRef, createVersionSnapshot(current));
        }
      },
    },
  );

  if (!transitioned) {
    throw new HttpsError(
      'failed-precondition',
      'This idea is no longer waiting for an amendment.',
    );
  }

  return { ideaId: input.ideaId, version: input.expectedVersion + 1 };
}

function createVersionSnapshot(current: DocumentSnapshot): DocumentData {
  return {
    version: readIdeaVersion(current.get('version')),
    title: current.get('title'),
    problem: current.get('problem'),
    proposedSolution: current.get('proposedSolution'),
    intendedBeneficiaries: current.get('intendedBeneficiaries'),
    plannedLocation: current.get('plannedLocation'),
    marketPlan: current.get('marketPlan'),
    feasibilityPlan: current.get('feasibilityPlan'),
    financingPlan: current.get('financingPlan'),
    milestones: current.get('milestones'),
    aiAnalysisConsent: current.get('aiAnalysisConsent'),
    submittedAt: current.get('submittedAt') ?? current.get('createdAt') ?? Timestamp.now(),
    archivedAt: FieldValue.serverTimestamp(),
  };
}

function requireAuthenticated(request: CallableRequest<unknown>): string {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
  return request.auth.uid;
}

function requireEvaluator(request: CallableRequest<unknown>): string {
  const uid = requireAuthenticated(request);
  if (request.auth?.token.role !== 'evaluator') {
    throw new HttpsError('permission-denied', 'Only evaluators can request changes.');
  }
  return uid;
}

function evaluatorName(request: CallableRequest<unknown>): string {
  const name = request.auth?.token.name;
  return typeof name === 'string' && name.trim().length > 0 && name.length <= 120
    ? name.trim()
    : 'Evaluator';
}
