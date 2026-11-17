import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Transaction,
} from 'firebase-admin/firestore';
import { IDEA_STATUSES, type IdeaStatus } from '../shared/idea-workflow';
import { timestampMillis } from './reporting-metrics';

export { summarizeChats, summarizeStageDurations } from './reporting-metrics';

export type EvaluationOutcome = 'advance' | 'revise' | 'reject';

export interface OverviewTransition {
  from: IdeaStatus;
  to: IdeaStatus;
  oldCategory: unknown;
  newCategory: unknown;
  enteredAt: unknown;
  changedAt: Timestamp;
  isNewIdea: boolean;
  evaluationOutcome?: EvaluationOutcome;
}

export async function maintainOverviewOnTransition(
  transaction: Transaction,
  overviewRef: DocumentReference,
  change: OverviewTransition,
): Promise<void> {
  const overviewSnapshot = await transaction.get(overviewRef);
  const overview = overviewSnapshot.data() ?? {};
  const byStatus = normalizeStatusCounts(overview['byStatus'] ?? overview['ideasByStatus']);
  const byCategory = normalizeCounts(overview['byCategory'] ?? overview['ideasByCategory']);
  const durationTotals = normalizeCounts(overview['stageDurationDaysTotal']);
  const durationCounts = normalizeCounts(overview['stageVisitCounts']);
  const averages = normalizeCounts(overview['avgDaysPerStage']);

  if (Object.keys(durationCounts).length === 0) {
    for (const [status, average] of Object.entries(averages)) {
      if (Number.isFinite(average)) {
        durationTotals[status] = average;
        durationCounts[status] = 1;
      }
    }
  }

  if (change.isNewIdea) {
    overview['totalIdeas'] = readCount(overview['totalIdeas']) + 1;
  } else {
    byStatus[change.from] = Math.max(0, byStatus[change.from] - 1);
  }
  byStatus[change.to] += 1;

  const oldCategory = categoryKey(change.oldCategory);
  const newCategory = categoryKey(change.newCategory);
  if (change.isNewIdea) {
    byCategory[newCategory] = (byCategory[newCategory] ?? 0) + 1;
  } else if (oldCategory !== newCategory) {
    byCategory[oldCategory] = Math.max(0, (byCategory[oldCategory] ?? 0) - 1);
    byCategory[newCategory] = (byCategory[newCategory] ?? 0) + 1;
  }

  const enteredAt = timestampMillis(change.enteredAt);
  if (enteredAt !== null) {
    const elapsedDays = Math.max(0, change.changedAt.toMillis() - enteredAt) / 86_400_000;
    durationTotals[change.from] = (durationTotals[change.from] ?? 0) + elapsedDays;
    durationCounts[change.from] = (durationCounts[change.from] ?? 0) + 1;
    averages[change.from] = durationTotals[change.from] / durationCounts[change.from];
  }

  const update: Record<string, unknown> = {
    byStatus,
    byCategory,
    avgDaysPerStage: averages,
    stageDurationDaysTotal: durationTotals,
    stageVisitCounts: durationCounts,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (change.evaluationOutcome) {
    const outcomes = normalizeCounts(overview['evaluationOutcomes']);
    outcomes[change.evaluationOutcome] = (outcomes[change.evaluationOutcome] ?? 0) + 1;
    update['evaluationOutcomes'] = outcomes;
  }

  transaction.set(overviewRef, update, { merge: true });
}

function normalizeStatusCounts(value: unknown): Record<IdeaStatus, number> {
  const counts = Object.fromEntries(IDEA_STATUSES.map((status) => [status, 0])) as Record<
    IdeaStatus,
    number
  >;
  if (!isRecord(value)) return counts;

  for (const [rawStatus, rawCount] of Object.entries(value)) {
    const status = normalizeLegacyStatus(rawStatus);
    if (status) counts[status] += readCount(rawCount);
  }
  return counts;
}

function normalizeLegacyStatus(value: string): IdeaStatus | null {
  if ((IDEA_STATUSES as readonly string[]).includes(value)) return value as IdeaStatus;
  if (value === 'draft') return 'submitted';
  if (['under-review', 'under_review'].includes(value)) return 'human_review';
  if (['needs-revision', 'needs_revision', 'feedback_requested'].includes(value)) {
    return 'needs_amendment';
  }
  if (value === 'revised') return 'ai_screening';
  if (value === 'accepted') return 'approved';
  if (value === 'declined') return 'rejected';
  return null;
}

function normalizeCounts(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, count]) => [key, readCount(count)]),
  );
}

function categoryKey(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : 'uncategorised';
}

function readCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
