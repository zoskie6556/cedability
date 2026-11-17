import { inject, Injectable } from '@angular/core';
import { doc, Firestore, onSnapshot, type Unsubscribe } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { IDEA_STATUSES, type IdeaStatus } from '../../shared/workflow/idea-workflow';
import type { ChatAnalyticsSummary, ChatStatus } from '../../shared/models/chat.model';

export interface ReportingOverview {
  totalIdeas: number;
  totalUsers: number;
  byStatus: Record<IdeaStatus, number>;
  byCategory: Record<string, number>;
  avgDaysPerStage: Record<IdeaStatus, number>;
  evaluationOutcomes: Record<string, number>;
  chatAnalytics: ChatAnalyticsSummary | null;
  updatedAt: string | null;
}

export interface DownloadableIdeaReport {
  ideaId: string;
  title: string;
  category: string | null;
  status: string;
  automatedReview: Record<string, unknown> | null;
  feedback: Array<{
    stageId: string;
    message: string;
    requiresResubmission: boolean;
    reply: { message: string; at: string | null } | null;
    createdAt: string | null;
  }>;
  statusHistory: Array<{
    from: string;
    to: string;
    stageId: string | null;
    byRole: string;
    note: string | null;
    at: string | null;
  }>;
}

const CHAT_STATUSES: readonly ChatStatus[] = ['waiting', 'active', 'closed', 'offline_message'];

@Injectable({ providedIn: 'root' })
export class ReportingService {
  private readonly firestore = inject(Firestore);
  private readonly functions = inject(Functions);
  private readonly overviewRef = doc(this.firestore, 'stats', 'overview');

  listenToOverview(
    onNext: (overview: ReportingOverview) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    return onSnapshot(
      this.overviewRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          onError(new Error('The reporting summary has not been initialized.'));
          return;
        }
        try {
          onNext(parseOverview(snapshot.data()));
        } catch (error: unknown) {
          onError(error instanceof Error ? error : new Error('The reporting summary is invalid.'));
        }
      },
      onError,
    );
  }

  async getIdeaReport(ideaId: string): Promise<DownloadableIdeaReport> {
    const getReport = httpsCallable<{ ideaId: string }, DownloadableIdeaReport>(
      this.functions,
      'getIdeaReport',
    );
    const result = await getReport({ ideaId });
    return result.data;
  }
}

function parseOverview(value: Record<string, unknown>): ReportingOverview {
  const byStatus = emptyStatusCounts();
  const rawStatusCounts = value['byStatus'] ?? value['ideasByStatus'];
  if (isRecord(rawStatusCounts)) {
    for (const [rawStatus, count] of Object.entries(rawStatusCounts)) {
      const status = normalizeStatus(rawStatus);
      if (status) byStatus[status] += readCount(count);
    }
  }

  const avgDaysPerStage = emptyStatusCounts();
  if (isRecord(value['avgDaysPerStage'])) {
    for (const [rawStatus, days] of Object.entries(value['avgDaysPerStage'])) {
      const status = normalizeStatus(rawStatus);
      if (status) avgDaysPerStage[status] = readCount(days);
    }
  }

  return {
    totalIdeas: readCount(value['totalIdeas']),
    totalUsers: readCount(value['totalUsers']),
    byStatus,
    byCategory: readNumberMap(value['byCategory'] ?? value['ideasByCategory']),
    avgDaysPerStage,
    evaluationOutcomes: readNumberMap(value['evaluationOutcomes']),
    chatAnalytics: parseChatSummary(value['chatAnalytics']),
    updatedAt: toIsoString(value['updatedAt']),
  };
}

function parseChatSummary(value: unknown): ChatAnalyticsSummary | null {
  if (!isRecord(value)) return null;

  const byStatus = Object.fromEntries(CHAT_STATUSES.map((status) => [status, 0])) as Record<
    ChatStatus,
    number
  >;
  if (isRecord(value['byStatus'])) {
    for (const status of CHAT_STATUSES) {
      byStatus[status] = readCount(value['byStatus'][status]);
    }
  }

  const sourceHours = Array.isArray(value['chatsByHour']) ? value['chatsByHour'] : [];
  const chatsByHour = Array.from({ length: 24 }, (_, hour) => readCount(sourceHours[hour]));

  return {
    totalChats: readCount(value['totalChats']),
    byStatus,
    resolutionRate: readCount(value['resolutionRate']),
    avgFirstResponseSeconds:
      typeof value['avgFirstResponseSeconds'] === 'number' &&
      Number.isFinite(value['avgFirstResponseSeconds'])
        ? value['avgFirstResponseSeconds']
        : null,
    chatsPerDay: readNumberMap(value['chatsPerDay']),
    chatsByHour,
  };
}

function emptyStatusCounts(): Record<IdeaStatus, number> {
  return Object.fromEntries(IDEA_STATUSES.map((status) => [status, 0])) as Record<
    IdeaStatus,
    number
  >;
}

function normalizeStatus(value: string): IdeaStatus | null {
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

function readNumberMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, count]) => [key, readCount(count)]));
}

function readCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function toIsoString(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (isRecord(value) && typeof value['toDate'] === 'function') {
    const date: unknown = value['toDate']();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
