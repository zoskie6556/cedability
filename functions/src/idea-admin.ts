import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { isIdeaStatus } from './shared/idea-workflow';
import { transitionIdea } from './lib/idea-transition';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

export async function setIdeaStatus(
  request: CallableRequest<Record<string, unknown>>,
): Promise<{ ideaId: string; status: string }> {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
  if (request.auth?.token['role'] !== 'admin') {
    throw new HttpsError('permission-denied', 'Only an admin can change an idea status.');
  }

  const ideaId = request.data['ideaId'];
  const status = request.data['status'];
  const rawStageId = request.data['stageId'];
  const rawNote = request.data['note'];
  if (
    typeof ideaId !== 'string' ||
    ideaId.trim().length === 0 ||
    ideaId.trim().length > 128 ||
    ideaId.includes('/') ||
    !isIdeaStatus(status)
  ) {
    throw new HttpsError('invalid-argument', 'The idea ID or status is invalid.');
  }
  if (status === 'awarded') {
    throw new HttpsError('failed-precondition', 'Use awardApprovedIdea to award an approved idea.');
  }
  if (rawNote !== undefined && rawNote !== null && typeof rawNote !== 'string') {
    throw new HttpsError('invalid-argument', 'The status note must be text.');
  }
  if (
    rawStageId !== undefined &&
    rawStageId !== null &&
    (typeof rawStageId !== 'string' || rawStageId.length > 128)
  ) {
    throw new HttpsError('invalid-argument', 'The workflow stage ID is invalid.');
  }

  const note = typeof rawNote === 'string' ? rawNote : null;
  const transitioned = await transitionIdea(
    db.collection('ideas').doc(ideaId.trim()),
    status,
    note,
    {},
    {
      actor: { uid, role: 'admin' },
      stageId: typeof rawStageId === 'string' ? rawStageId : undefined,
      auditAction: 'idea.admin_status_changed',
      auditSummary: `Admin moved the idea to ${status}.`,
      validate: async (_transaction, current) => {
        if (current.get('status') === 'adjudication') {
          throw new HttpsError(
            'failed-precondition',
            'Record the final decision through the adjudication workflow.',
          );
        }
      },
    },
  );
  if (!transitioned) {
    throw new HttpsError('failed-precondition', 'The idea could not be moved to that status.');
  }
  return { ideaId: ideaId.trim(), status };
}
