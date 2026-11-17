import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import {
  adjudicationTargetStatus,
  isAdjudicationRole,
  parseAwardIdeaInput,
  parseRecordAdjudicationInput,
} from './lib/idea-adjudication';
import { transitionIdea } from './lib/idea-transition';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

export async function recordAdjudication(
  request: CallableRequest<Record<string, unknown>>,
): Promise<{ ideaId: string; status: string }> {
  const actor = requireAdjudicationActor(request);
  const input = parseInput(parseRecordAdjudicationInput, request.data);
  const ideaRef = db.collection('ideas').doc(input.ideaId);
  const adjudicationRef = ideaRef.collection('adjudications').doc('adjudication');
  let finalScore: number | null = null;
  let ideaVersion = 1;
  let decisionExists = false;

  const transitioned = await transitionIdea(
    ideaRef,
    adjudicationTargetStatus(input.decision),
    input.note,
    {},
    {
      actor,
      stageId: 'adjudication',
      auditAction: `idea.adjudication_${input.decision}`,
      auditSummary: `Adjudicator recorded the ${input.decision} decision.`,
      validate: async (transaction, idea) => {
        if (idea.get('status') !== 'adjudication') {
          throw new HttpsError(
            'failed-precondition',
            'This idea is no longer waiting for adjudication.',
          );
        }

        const [existingDecision, evaluations] = await Promise.all([
          transaction.get(adjudicationRef),
          transaction.get(ideaRef.collection('evaluations')),
        ]);
        const storedVersion = idea.get('version');
        ideaVersion =
          typeof storedVersion === 'number' && Number.isInteger(storedVersion) && storedVersion >= 1
            ? storedVersion
            : 1;
        decisionExists = existingDecision.exists;
        if (decisionExists && existingDecision.get('ideaVersion') === ideaVersion) {
          throw new HttpsError(
            'already-exists',
            'An adjudication decision has already been recorded for this submission version.',
          );
        }
        finalScore = calculateFinalScore(
          evaluations.docs.map((evaluation) => evaluation.get('total')),
        );
      },
      write: (transaction) => {
        const decisionRecord = {
          stageId: 'adjudication',
          ideaVersion,
          adjudicatorUid: actor.uid,
          decision: input.decision,
          finalScore,
          note: input.note,
          decidedAt: FieldValue.serverTimestamp(),
        };
        if (decisionExists) {
          transaction.set(adjudicationRef, decisionRecord);
        } else {
          transaction.create(adjudicationRef, decisionRecord);
        }
      },
    },
  );

  if (!transitioned) {
    throw new HttpsError('failed-precondition', 'This idea is no longer waiting for adjudication.');
  }

  return { ideaId: input.ideaId, status: adjudicationTargetStatus(input.decision) };
}

export async function awardApprovedIdea(
  request: CallableRequest<Record<string, unknown>>,
): Promise<{ ideaId: string; awardId: string }> {
  const actor = requireAuthenticated(request);
  if (request.auth?.token.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only an admin can award an idea.');
  }
  const input = parseInput(parseAwardIdeaInput, request.data);
  const ideaRef = db.collection('ideas').doc(input.ideaId);
  const awardRef = db.collection('awards').doc();
  let ownerId = '';

  const transitioned = await transitionIdea(
    ideaRef,
    'awarded',
    null,
    {},
    {
      actor: { uid: actor, role: 'admin' },
      auditAction: 'idea.awarded',
      auditSummary: `Admin created the ${input.type} award for the idea.`,
      validate: async (_transaction, idea) => {
        if (idea.get('status') !== 'approved') {
          throw new HttpsError('failed-precondition', 'Only approved ideas can be awarded.');
        }
        const ideaOwner = idea.get('ownerId');
        if (typeof ideaOwner !== 'string' || !ideaOwner.trim()) {
          throw new HttpsError('failed-precondition', 'The idea owner is unavailable.');
        }
        ownerId = ideaOwner;
      },
      write: (transaction) => {
        transaction.create(awardRef, {
          ideaId: input.ideaId,
          ownerId,
          title: input.title,
          type: input.type,
          citation: input.citation,
          awardedBy: actor,
          awardedAt: FieldValue.serverTimestamp(),
          isPublic: input.isPublic,
        });
      },
    },
  );

  if (!transitioned) {
    throw new HttpsError('failed-precondition', 'Only approved ideas can be awarded.');
  }

  return { ideaId: input.ideaId, awardId: awardRef.id };
}

function requireAuthenticated(request: CallableRequest<unknown>): string {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
  return request.auth.uid;
}

function requireAdjudicationActor(request: CallableRequest<unknown>): {
  uid: string;
  role: 'adjudicator' | 'admin';
} {
  const uid = requireAuthenticated(request);
  const role = request.auth?.token.role;
  if (!isAdjudicationRole(role)) {
    throw new HttpsError(
      'permission-denied',
      'Only adjudicators and admins can record a decision.',
    );
  }
  return { uid, role };
}

function parseInput<T>(parser: (value: unknown) => T, value: unknown): T {
  try {
    return parser(value);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'The request is invalid.';
    throw new HttpsError('invalid-argument', message);
  }
}

function calculateFinalScore(totals: unknown[]): number | null {
  if (totals.length === 0) return null;
  if (
    totals.some(
      (total) => typeof total !== 'number' || !Number.isFinite(total) || total < 0 || total > 100,
    )
  ) {
    throw new HttpsError('failed-precondition', 'An evaluator total is invalid.');
  }
  const mean = (totals as number[]).reduce((sum, total) => sum + total, 0) / totals.length;
  return Math.round(mean * 100) / 100;
}
