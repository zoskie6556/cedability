export interface ChatAnalyticsSummary {
  totalChats: number;
  byStatus: Record<'waiting' | 'active' | 'closed' | 'offline_message', number>;
  resolutionRate: number;
  avgFirstResponseSeconds: number | null;
  chatsPerDay: Record<string, number>;
  chatsByHour: number[];
}

export function summarizeChats(
  chats: readonly Record<string, unknown>[],
  now: Date = new Date(),
): ChatAnalyticsSummary {
  const statuses = ['waiting', 'active', 'closed', 'offline_message'] as const;
  const byStatus = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<
    (typeof statuses)[number],
    number
  >;
  const chatsByHour = new Array<number>(24).fill(0);
  const chatsPerDay: Record<string, number> = {};
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cutoff.setUTCDate(cutoff.getUTCDate() - 29);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  let firstResponseSecondsTotal = 0;
  let firstResponseCount = 0;

  for (const chat of chats) {
    const status = chat['status'];
    if (typeof status === 'string' && isChatStatus(status)) {
      byStatus[status] += 1;
    }

    const startedAt = timestampDate(chat['startedAt']);
    if (!startedAt) continue;

    chatsByHour[startedAt.getUTCHours()] += 1;
    const day = startedAt.toISOString().slice(0, 10);
    if (day >= cutoffKey) chatsPerDay[day] = (chatsPerDay[day] ?? 0) + 1;

    const firstResponseAt = timestampDate(chat['firstResponseAt']);
    if (firstResponseAt && firstResponseAt >= startedAt) {
      firstResponseSecondsTotal += (firstResponseAt.getTime() - startedAt.getTime()) / 1000;
      firstResponseCount += 1;
    }
  }

  const totalChats = chats.length;
  return {
    totalChats,
    byStatus,
    resolutionRate: totalChats === 0 ? 0 : byStatus.closed / totalChats,
    avgFirstResponseSeconds:
      firstResponseCount === 0 ? null : firstResponseSecondsTotal / firstResponseCount,
    chatsPerDay,
    chatsByHour,
  };
}

export function summarizeStageDurations(
  ideas: readonly { id: string; createdAt: unknown; submittedAt: unknown }[],
  history: readonly {
    ideaId: string;
    from: unknown;
    to: unknown;
    at: unknown;
  }[],
): {
  avgDaysPerStage: Record<string, number>;
  stageDurationDaysTotal: Record<string, number>;
  stageVisitCounts: Record<string, number>;
} {
  const ideaById = new Map(ideas.map((idea) => [idea.id, idea]));
  const historyByIdea = new Map<string, typeof history[number][]>();
  for (const event of history) {
    if (!ideaById.has(event.ideaId)) continue;
    const entries = historyByIdea.get(event.ideaId) ?? [];
    entries.push(event);
    historyByIdea.set(event.ideaId, entries);
  }

  const stageDurationDaysTotal: Record<string, number> = {};
  const stageVisitCounts: Record<string, number> = {};
  for (const [ideaId, events] of historyByIdea) {
    events.sort((left, right) => (timestampMillis(left.at) ?? 0) - (timestampMillis(right.at) ?? 0));
    const idea = ideaById.get(ideaId);
    if (!idea) continue;

    events.forEach((event, index) => {
      if (typeof event.from !== 'string') return;
      const start =
        index === 0
          ? timestampMillis(idea.submittedAt) ?? timestampMillis(idea.createdAt)
          : timestampMillis(events[index - 1].at);
      const end = timestampMillis(event.at);
      if (start === null || end === null || end < start) return;
      stageDurationDaysTotal[event.from] =
        (stageDurationDaysTotal[event.from] ?? 0) + (end - start) / 86_400_000;
      stageVisitCounts[event.from] = (stageVisitCounts[event.from] ?? 0) + 1;
    });
  }

  const avgDaysPerStage = Object.fromEntries(
    Object.entries(stageDurationDaysTotal).map(([stage, total]) => [
      stage,
      total / stageVisitCounts[stage],
    ]),
  );
  return { avgDaysPerStage, stageDurationDaysTotal, stageVisitCounts };
}

export function timestampMillis(value: unknown): number | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!isRecord(value) || typeof value['toMillis'] !== 'function') return null;
  const millis: unknown = value['toMillis']();
  return typeof millis === 'number' && Number.isFinite(millis) ? millis : null;
}

function timestampDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (!isRecord(value) || typeof value['toDate'] !== 'function') return null;
  const date: unknown = value['toDate']();
  return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
}

function isChatStatus(
  value: string,
): value is 'waiting' | 'active' | 'closed' | 'offline_message' {
  return ['waiting', 'active', 'closed', 'offline_message'].includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
