import {
  FieldValue,
  getFirestore,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type DocumentReference,
  type Transaction,
} from 'firebase-admin/firestore';
import {
  canTransition,
  isIdeaStatus,
  NOTE_REQUIRED,
  STAGES,
  type IdeaStatus,
  type WorkflowActor,
} from '../shared/idea-workflow';
import type {
  AutomatedReviewReport,
  IdeaCategory,
  SimilarityCheckResult,
} from '../shared/automated-review.model';
import { createAuditLogRecord } from './audit';
import { HttpsError } from 'firebase-functions/v2/https';
import { maintainOverviewOnTransition, type EvaluationOutcome } from '../stats/overview';

export interface IdeaTransitionUpdates {
  category?: IdeaCategory | null;
  similarityCheck?: SimilarityCheckResult | null;
  automatedReview?: AutomatedReviewReport | null;
}

export interface IdeaTransitionOptions {
  actor?: { uid: string; role: WorkflowActor };
  stageId?: string;
  ideaFields?: DocumentData;
  auditAction?: string;
  auditSummary?: string;
  isNewIdea?: boolean;
  evaluationOutcome?: EvaluationOutcome;
  validate?: (transaction: Transaction, current: DocumentSnapshot) => Promise<void>;
  write?: (transaction: Transaction, current: DocumentSnapshot) => void;
}

export async function transitionIdea(
  ideaRef: DocumentReference,
  to: IdeaStatus,
  note: string | null = null,
  updates: IdeaTransitionUpdates = {},
  options: IdeaTransitionOptions = {},
): Promise<boolean> {
  const cleanNote = note?.trim() || null;
  const actor = options.actor ?? { uid: 'system', role: 'system' };
  if (cleanNote && cleanNote.length > 500) {
    throw new HttpsError('invalid-argument', 'The idea status note is too long.');
  }
  if (NOTE_REQUIRED.includes(to) && !cleanNote) {
    throw new HttpsError('invalid-argument', `The ${to} transition requires a note.`);
  }

  const db = getFirestore();
  const historyRef = ideaRef.collection('statusHistory').doc();
  const auditRef = db.collection('auditLogs').doc();

  return db.runTransaction(async (transaction) => {
    const current = await transaction.get(ideaRef);
    if (!current.exists) {
      return false;
    }

    const from = current.get('status');
    if (!isIdeaStatus(from)) {
      throw new HttpsError('failed-precondition', 'The idea has an invalid workflow status.');
    }
    if (from === to) {
      return false;
    }
    if (!canTransition(from, to, actor.role)) {
      throw new HttpsError(
        'failed-precondition',
        `A ${actor.role} actor cannot move an idea from ${from} to ${to}.`,
      );
    }
    if (actor.role !== 'system' && actor.uid.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'A workflow actor must have a valid UID.');
    }

    const ownerId = current.get('ownerId');
    if (typeof ownerId !== 'string' || ownerId.trim().length === 0) {
      throw new HttpsError(
        'failed-precondition',
        'The idea has no valid owner for its status notification.',
      );
    }

    const notificationRef = db.collection('users').doc(ownerId).collection('notifications').doc();
    const changedAt = Timestamp.now();
    await options.validate?.(transaction, current);
    let statusEnteredAt = current.get('statusEnteredAt');
    if (statusEnteredAt === null || statusEnteredAt === undefined) {
      const history = await transaction.get(
        ideaRef.collection('statusHistory').orderBy('at', 'desc').limit(1),
      );
      const latestChange = history.docs[0];
      statusEnteredAt =
        latestChange?.get('to') === from
          ? latestChange.get('at')
          : current.get('submittedAt') ?? current.get('createdAt');
    }
    await maintainOverviewOnTransition(transaction, db.doc('stats/overview'), {
      from,
      to,
      oldCategory: current.get('category'),
      newCategory: updates.category === undefined ? current.get('category') : updates.category,
      enteredAt: statusEnteredAt,
      changedAt,
      isNewIdea: options.isNewIdea ?? false,
      evaluationOutcome: options.evaluationOutcome,
    });
    const update: DocumentData = {
      ...options.ideaFields,
      status: to,
      statusEnteredAt: changedAt,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (updates.category !== undefined) update['category'] = updates.category;
    if (updates.similarityCheck !== undefined) {
      update['similarityCheck'] = updates.similarityCheck;
    }
    if (updates.automatedReview !== undefined) {
      update['automatedReview'] = updates.automatedReview;
    }

    transaction.update(ideaRef, update);
    transaction.create(historyRef, {
      from,
      to,
      ...(options.stageId === undefined ? {} : { stageId: options.stageId }),
      byUid: actor.uid,
      byRole: actor.role,
      note: cleanNote,
      at: FieldValue.serverTimestamp(),
    });
    options.write?.(transaction, current);
    transaction.create(notificationRef, {
      type: 'idea_status_changed',
      title: `Idea update: ${STAGES[to].label}`,
      body: cleanNote ?? STAGES[to].help,
      ideaId: ideaRef.id,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(
      auditRef,
      createAuditLogRecord({
        actorUid: actor.uid,
        actorRole: actor.role,
        action: options.auditAction ?? 'idea.status_changed',
        entityType: 'idea',
        entityId: ideaRef.id,
        summary: options.auditSummary ?? `Idea status moved from ${from} to ${to}.`,
      }),
    );

    return true;
  });
}
