import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

export interface IdeaReportFeedback {
  stageId: string;
  message: string;
  requiresResubmission: boolean;
  reply: { message: string; at: string | null } | null;
  createdAt: string | null;
}

export interface IdeaReportStatusChange {
  from: string;
  to: string;
  stageId: string | null;
  byRole: string;
  note: string | null;
  at: string | null;
}

export interface IdeaReport {
  ideaId: string;
  title: string;
  category: string | null;
  status: string;
  automatedReview: Record<string, unknown> | null;
  feedback: IdeaReportFeedback[];
  statusHistory: IdeaReportStatusChange[];
}

export async function getIdeaReport(
  request: CallableRequest<Record<string, unknown>>,
): Promise<IdeaReport> {
  requireReportingRole(request);
  const ideaId = request.data['ideaId'];
  if (
    typeof ideaId !== 'string' ||
    ideaId.trim().length === 0 ||
    ideaId.trim().length > 128 ||
    ideaId.includes('/')
  ) {
    throw new HttpsError('invalid-argument', 'Enter a valid idea ID.');
  }

  const ideaRef = db.collection('ideas').doc(ideaId.trim());
  const idea = await ideaRef.get();
  if (!idea.exists) {
    throw new HttpsError('not-found', 'The requested idea could not be found.');
  }

  const [feedback, statusHistory] = await Promise.all([
    ideaRef.collection('feedback').orderBy('createdAt', 'asc').get(),
    ideaRef.collection('statusHistory').orderBy('at', 'asc').get(),
  ]);
  const automatedReview = toPlainRecord(idea.get('automatedReview'));

  return {
    ideaId: idea.id,
    title: readString(idea.get('title'), 'Untitled idea'),
    category: readNullableString(idea.get('category')),
    status: readString(idea.get('status'), 'unknown'),
    automatedReview,
    feedback: feedback.docs.map((document) => {
      const reply = document.get('reply');
      return {
        stageId: readString(document.get('stageId'), ''),
        message: readString(document.get('message'), ''),
        requiresResubmission: document.get('requiresResubmission') === true,
        reply: isRecord(reply)
          ? {
              message: readString(reply['message'], ''),
              at: toIsoString(reply['at']),
            }
          : null,
        createdAt: toIsoString(document.get('createdAt')),
      };
    }),
    statusHistory: statusHistory.docs.map((document) => ({
      from: readString(document.get('from'), ''),
      to: readString(document.get('to'), ''),
      stageId: readNullableString(document.get('stageId')),
      byRole: readString(document.get('byRole'), ''),
      note: readNullableString(document.get('note')),
      at: toIsoString(document.get('at')),
    })),
  };
}

function requireReportingRole(request: CallableRequest<unknown>): void {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
  const role = request.auth.token['role'];
  if (role !== 'admin' && role !== 'adjudicator') {
    throw new HttpsError('permission-denied', 'Only admins and adjudicators can download reports.');
  }
}

function toPlainRecord(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, toPlainValue(entry)]),
  );
}

function toPlainValue(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toPlainValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toPlainValue(entry)]),
    );
  }
  return value;
}

function toIsoString(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  return null;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
