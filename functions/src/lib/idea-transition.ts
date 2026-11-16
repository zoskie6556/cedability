import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type DocumentReference,
} from 'firebase-admin/firestore';
import {
  canTransition,
  isIdeaStatus,
  NOTE_REQUIRED,
  STAGES,
  type IdeaStatus,
} from '../shared/idea-workflow';
import type {
  AutomatedReviewReport,
  IdeaCategory,
  SimilarityCheckResult,
} from '../shared/automated-review.model';
import { createAuditLogRecord } from './audit';

export interface IdeaTransitionUpdates {
  category?: IdeaCategory;
  similarityCheck?: SimilarityCheckResult;
  automatedReview?: AutomatedReviewReport;
}

export async function transitionIdea(
  ideaRef: DocumentReference,
  to: IdeaStatus,
  note: string | null = null,
  updates: IdeaTransitionUpdates = {},
): Promise<boolean> {
  const cleanNote = note?.trim() || null;
  if (cleanNote && cleanNote.length > 500) {
    throw new Error('The idea status note is too long.');
  }
  if (NOTE_REQUIRED.includes(to) && !cleanNote) {
    throw new Error(`The ${to} transition requires a note.`);
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
      throw new Error('The idea has an invalid workflow status.');
    }
    if (from === to) {
      return false;
    }
    if (!canTransition(from, to, 'system')) {
      throw new Error(`The system cannot move an idea from ${from} to ${to}.`);
    }

    const ownerId = current.get('ownerId');
    if (typeof ownerId !== 'string' || ownerId.trim().length === 0) {
      throw new Error('The idea has no valid owner for its status notification.');
    }

    const notificationRef = db
      .collection('users')
      .doc(ownerId)
      .collection('notifications')
      .doc();
    const update: DocumentData = {
      status: to,
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
      byUid: 'system',
      byRole: 'system',
      note: cleanNote,
      at: FieldValue.serverTimestamp(),
    });
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
        actorUid: 'system',
        actorRole: 'system',
        action: 'idea.status_changed',
        entityType: 'idea',
        entityId: ideaRef.id,
        summary: `Idea status moved from ${from} to ${to}.`,
      }),
    );

    return true;
  });
}
