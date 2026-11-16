import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  onSnapshot,
  type DocumentData,
  type FirestoreError,
  type QuerySnapshot,
  type Unsubscribe,
} from '@angular/fire/firestore';
import { requireIdeaStatus } from '../../shared/models/status-parse';
import { IDEA_STATUSES, STAGES, type HealthColour, type IdeaStatus } from '../../shared/workflow/idea-workflow';

export type AdminDeltaStatus = 'up' | 'down';

export interface AdminOverviewStat {
  label: string;
  value: string;
  delta: string;
  status: AdminDeltaStatus;
  route: string;
}

export interface AdminOverviewSummary {
  totalUsers: number;
  usersByRole: Record<string, number>;
  activeUsers: number;
  totalIdeas: number;
  ideasByStatus: Record<string, number>;
  ideasByCategory: Record<string, number>;
  ideasPerDay: Record<string, number>;
  openTickets: number;
  resolvedTickets: number;
  activeChats: number;
  evaluatorsCount: number;
  supportCount: number;
  pendingAssignments: number;
  updatedAt: unknown;
}

export interface AdminAuditEntry {
  actor: string;
  action: string;
  target: string;
  timestamp: string;
  status: 'success' | 'warning' | 'info';
}

export interface AdminTicket {
  id: string;
  title: string;
  user: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'Open' | 'In progress' | 'Resolved';
}

export interface AdminIdeaSummary {
  title: string;
  owner: string;
  stage: string;
  score: number;
}

export interface AdminContentItem {
  title: string;
  type: 'Announcement' | 'FAQ' | 'Policy';
  updated: string;
  status: 'Published' | 'Draft';
}

/** One Firestore collection that feeds the overview, and how to summarise it. */
interface OverviewSource {
  name: string;
  summarize: (snap: QuerySnapshot<DocumentData>) => Partial<AdminOverviewSummary>;
}

@Injectable({ providedIn: 'root' })
export class AdminDashboardService {
  private readonly firestore = inject(Firestore);
  private readonly overviewDocRef = doc(this.firestore, 'stats', 'overview');

  /**
   * Set to true once the Cloud Functions that maintain `stats/overview` exist.
   * Until then the overview is computed directly from the real collections.
   */
  private readonly useStatsDocument = false;

  readonly fallbackOverview: AdminOverviewSummary = {
    totalUsers: 0,
    usersByRole: { admin: 0, evaluator: 0, adjudicator: 0, agent: 0, submitter: 0 },
    activeUsers: 0,
    totalIdeas: 0,
    ideasByStatus: Object.fromEntries(IDEA_STATUSES.map(status => [status, 0])),
    ideasByCategory: {},
    ideasPerDay: {},
    openTickets: 0,
    resolvedTickets: 0,
    activeChats: 0,
    evaluatorsCount: 0,
    supportCount: 0,
    pendingAssignments: 0,
    updatedAt: null,
  };

  // ---- Optional reactive state (new; existing callers can ignore it) ----

  /** Latest overview, updated by loadOverviewSummary() and startLiveOverview(). */
  readonly overview = signal<AdminOverviewSummary>(this.cloneFallback());
  /** Human-readable problem (for example permission-denied), or null when all is well. */
  readonly overviewError = signal<string | null>(null);
  readonly overviewLoading = signal(true);

  readonly defaultOverviewStats: AdminOverviewStat[] = [
    { label: 'Total users', value: '0', delta: '+0%', status: 'up', route: '/admin/users' },
    { label: 'Total ideas', value: '0', delta: '+0%', status: 'up', route: '/admin/ideas' },
    { label: 'Open tickets', value: '0', delta: '+0%', status: 'up', route: '/admin/tickets' },
    { label: 'Active chats', value: '0', delta: '+0%', status: 'up', route: '/admin/staff-activity' },
  ];

  readonly auditEntries: AdminAuditEntry[] = [
    {
      actor: 'System',
      action: 'Dashboard synced',
      target: 'Overview metrics',
      timestamp: 'Now',
      status: 'success',
    },
  ];

  readonly ticketQueue: AdminTicket[] = [];

  readonly ideaPipeline: AdminIdeaSummary[] = [];

  readonly staffActivity: Array<{ name: string; rating: string; tasks: number; focus: string }> = [];

  readonly stageProgress: Array<{ name: string; percent: number; tone: string }> = [
    { name: 'Submission intake', percent: 0, tone: 'primary' },
    { name: 'Evaluation', percent: 0, tone: 'warning' },
    { name: 'Adjudication', percent: 0, tone: 'success' },
    { name: 'Awarding', percent: 0, tone: 'neutral' },
  ];

  readonly contentItems: AdminContentItem[] = [];

  readonly settings: Array<{ name: string; value: string; description: string }> = [];

  // ---- Internals for the live overview ----

  private readonly sources: ReadonlyArray<OverviewSource> = [
    { name: 'users', summarize: snap => this.summarizeUsers(snap) },
    { name: 'ideas', summarize: snap => this.summarizeIdeas(snap) },
    { name: 'tickets', summarize: snap => this.summarizeTickets(snap) },
    { name: 'chats', summarize: snap => this.summarizeChats(snap) },
    { name: 'assignments', summarize: snap => this.summarizeAssignments(snap) },
  ];

  private unsubscribers: Unsubscribe[] = [];
  private readonly sourceErrors = new Map<string, string>();

  // ---- Public API (unchanged signatures) ----

  /**
   * One-time load of the overview. Same signature as before.
   * Reads the real collections (or `stats/overview` once useStatsDocument is true).
   * Problems are logged and exposed through `overviewError` instead of being hidden.
   */
  async loadOverviewSummary(): Promise<AdminOverviewSummary> {
    this.overviewLoading.set(true);
    this.sourceErrors.clear();
    this.publishErrors();

    if (this.useStatsDocument) {
      try {
        const snapshot = await getDoc(this.overviewDocRef);
        if (snapshot.exists()) {
          const summary = this.fromStatsDocument(snapshot.data() as Record<string, unknown>);
          this.overview.set(summary);
          this.overviewLoading.set(false);
          return summary;
        }
        console.warn('[AdminDashboardService] stats/overview is missing, computing from collections');
      } catch (error) {
        this.recordError('stats/overview', error);
      }
    }

    const results = await Promise.allSettled(
      this.sources.map(source => getDocs(collection(this.firestore, source.name))),
    );

    let summary = this.cloneFallback();
    results.forEach((result, index) => {
      const source = this.sources[index];
      if (result.status === 'fulfilled') {
        summary = { ...summary, ...source.summarize(result.value) };
      } else {
        this.recordError(source.name, result.reason);
      }
    });
    summary.updatedAt = new Date();

    this.publishErrors();
    this.overview.set(summary);
    this.overviewLoading.set(false);
    return summary;
  }

  /**
   * Optional: keep `overview` up to date in real time.
   * Pass a DestroyRef (inject(DestroyRef)) to stop listening automatically.
   */
  startLiveOverview(destroyRef?: DestroyRef): void {
    this.stopLiveOverview();
    this.sourceErrors.clear();
    this.overviewLoading.set(true);

    for (const source of this.sources) {
      const unsubscribe = onSnapshot(
        collection(this.firestore, source.name),
        snap => {
          this.sourceErrors.delete(source.name);
          this.publishErrors();
          this.patchOverview(source.summarize(snap));
        },
        (error: FirestoreError) => {
          this.recordError(source.name, error);
          this.publishErrors();
          this.overviewLoading.set(false);
        },
      );
      this.unsubscribers.push(unsubscribe);
    }

    destroyRef?.onDestroy(() => this.stopLiveOverview());
  }

  stopLiveOverview(): void {
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.unsubscribers = [];
  }

  buildOverviewStats(summary: AdminOverviewSummary): AdminOverviewStat[] {
    return [
      {
        label: 'Total users',
        value: this.formatNumber(summary.totalUsers),
        delta: '+0%',
        status: 'up',
        route: '/admin/users',
      },
      {
        label: 'Total ideas',
        value: this.formatNumber(summary.totalIdeas),
        delta: '+0%',
        status: 'up',
        route: '/admin/ideas',
      },
      {
        label: `${STAGES.human_review.label} ideas`,
        value: this.formatNumber(summary.ideasByStatus['human_review'] ?? 0),
        delta: '+0%',
        status: 'up',
        route: '/admin/ideas',
      },
      {
        label: 'Awarded',
        value: this.formatNumber(summary.ideasByStatus['awarded'] ?? 0),
        delta: '+0%',
        status: 'up',
        route: '/admin/ideas',
      },
      {
        label: 'Open tickets',
        value: this.formatNumber(summary.openTickets),
        delta: '+0%',
        status: 'down',
        route: '/admin/tickets',
      },
      {
        label: 'Active chats',
        value: this.formatNumber(summary.activeChats),
        delta: '+0%',
        status: 'up',
        route: '/admin/staff-activity',
      },
      {
        label: 'Evaluators',
        value: this.formatNumber(summary.evaluatorsCount),
        delta: '+0%',
        status: 'up',
        route: '/admin/staff-activity',
      },
      {
        label: 'Support team',
        value: this.formatNumber(summary.supportCount),
        delta: '+0%',
        status: 'up',
        route: '/admin/staff-activity',
      },
      {
        label: 'Pending evaluations',
        value: this.formatNumber(summary.pendingAssignments),
        delta: '+0%',
        status: 'up',
        route: '/admin/ideas',
      },
    ];
  }

  buildRoleBreakdown(summary: AdminOverviewSummary): Array<{ label: string; value: number; color: string }> {
    return this.roleItems(summary);
  }

  buildStatusBreakdown(
    summary: AdminOverviewSummary,
  ): Array<{ status: IdeaStatus; label: string; value: number; percent: number; health: HealthColour }> {
    const total = Math.max(summary.totalIdeas, 1);

    return IDEA_STATUSES.map(status => ({
      status,
      label: STAGES[status].label,
      value: Number(summary.ideasByStatus[status] ?? 0),
      percent: Math.round(((summary.ideasByStatus[status] ?? 0) / total) * 100),
      health: STAGES[status].health,
    }));
  }

  buildTopStaff(summary: AdminOverviewSummary): Array<{ label: string; value: number; color: string }> {
    return this.roleItems(summary)
      .sort((left, right) => right.value - left.value)
      .slice(0, 4);
  }

  buildIdeasPerDayPath(summary: AdminOverviewSummary): string {
    const entries = Object.entries(summary.ideasPerDay ?? {}).sort(([left], [right]) => left.localeCompare(right));
    if (entries.length === 0) {
      return '';
    }

    const values = entries.map(([, value]) => Number(value ?? 0));
    const maxValue = Math.max(...values, 1);
    const points = entries.map(([, value], index) => {
      const x = entries.length === 1 ? 50 : (index / (entries.length - 1)) * 100;
      const y = 100 - (Number(value ?? 0) / maxValue) * 80 - 10;
      return `${x},${y}`;
    });

    return `M ${points.join(' L ')}`;
  }

  // ---- Summaries: one per collection (shared by one-time load and live listeners) ----

  private summarizeUsers(snap: QuerySnapshot<DocumentData>): Partial<AdminOverviewSummary> {
    const byRole: Record<string, number> = {};
    let active = 0;

    snap.docs.forEach(document => {
      const data = document.data();
      const role = (data['role'] as string | undefined) ?? 'submitter';
      byRole[role] = (byRole[role] ?? 0) + 1;
      if (data['isActive'] !== false) {
        active++;
      }
    });

    return {
      totalUsers: snap.size,
      usersByRole: { ...this.fallbackOverview.usersByRole, ...byRole },
      activeUsers: active,
      evaluatorsCount: byRole['evaluator'] ?? 0,
      supportCount: byRole['agent'] ?? 0,
    };
  }

  private summarizeIdeas(snap: QuerySnapshot<DocumentData>): Partial<AdminOverviewSummary> {
    const byStatus: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const perDay: Record<string, number> = {};

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    cutoff.setHours(0, 0, 0, 0);

    snap.docs.forEach(document => {
      const data = document.data();

      let status: IdeaStatus;
      try {
        status = requireIdeaStatus(data['status']);
      } catch (error) {
        console.error(`[AdminDashboardService] idea ${document.id} has an invalid status`, error);
        return;
      }
      byStatus[status] = (byStatus[status] ?? 0) + 1;

      const category = data['category'] as string | undefined;
      if (category) {
        byCategory[category] = (byCategory[category] ?? 0) + 1;
      }

      const created = this.toDate(data['createdAt']);
      if (created && created >= cutoff) {
        const day = this.dayKey(created);
        perDay[day] = (perDay[day] ?? 0) + 1;
      }
    });

    return {
      totalIdeas: snap.size,
      ideasByStatus: { ...this.fallbackOverview.ideasByStatus, ...byStatus },
      ideasByCategory: byCategory,
      ideasPerDay: perDay,
    };
  }

  private summarizeTickets(snap: QuerySnapshot<DocumentData>): Partial<AdminOverviewSummary> {
    let open = 0;
    let resolved = 0;

    snap.docs.forEach(document => {
      const status = document.data()['status'];
      if (status === 'open' || status === 'in_progress') {
        open++;
      } else if (status === 'resolved' || status === 'closed') {
        resolved++;
      }
    });

    return { openTickets: open, resolvedTickets: resolved };
  }

  private summarizeChats(snap: QuerySnapshot<DocumentData>): Partial<AdminOverviewSummary> {
    return {
      activeChats: snap.docs.filter(document => document.data()['status'] === 'active').length,
    };
  }

  private summarizeAssignments(snap: QuerySnapshot<DocumentData>): Partial<AdminOverviewSummary> {
    return {
      pendingAssignments: snap.docs.filter(document => document.data()['status'] !== 'done').length,
    };
  }

  // ---- Helpers ----

  private patchOverview(part: Partial<AdminOverviewSummary>): void {
    this.overview.update(current => ({ ...current, ...part, updatedAt: new Date() }));
    this.overviewLoading.set(false);
  }

  private recordError(sourceName: string, error: unknown): void {
    const code = (error as { code?: string } | null)?.code ?? String(error);
    console.error(`[AdminDashboardService] could not read "${sourceName}" (${code})`, error);
    this.sourceErrors.set(sourceName, code);
  }

  private publishErrors(): void {
    if (this.sourceErrors.size === 0) {
      this.overviewError.set(null);
      return;
    }
    const parts = [...this.sourceErrors.entries()].map(([name, code]) => `${name} (${code})`);
    this.overviewError.set(`Could not read: ${parts.join(', ')}`);
  }

  private cloneFallback(): AdminOverviewSummary {
    const base = this.fallbackOverview;
    return {
      ...base,
      usersByRole: { ...base.usersByRole },
      ideasByStatus: { ...base.ideasByStatus },
      ideasByCategory: { ...base.ideasByCategory },
      ideasPerDay: { ...base.ideasPerDay },
    };
  }

  private fromStatsDocument(source: Record<string, unknown>): AdminOverviewSummary {
    const fallback = this.fallbackOverview;
    return {
      totalUsers: this.toNumber(source['totalUsers'], fallback.totalUsers),
      usersByRole: this.toRecordMap(source['usersByRole'], fallback.usersByRole),
      activeUsers: this.toNumber(source['activeUsers'], fallback.activeUsers),
      totalIdeas: this.toNumber(source['totalIdeas'], fallback.totalIdeas),
      ideasByStatus: this.normalizeIdeaStatusCounts(source['ideasByStatus']),
      ideasByCategory: this.toRecordMap(source['ideasByCategory'], fallback.ideasByCategory),
      ideasPerDay: this.toRecordMap(source['ideasPerDay'], fallback.ideasPerDay),
      openTickets: this.toNumber(source['openTickets'], fallback.openTickets),
      resolvedTickets: this.toNumber(source['resolvedTickets'], fallback.resolvedTickets),
      activeChats: this.toNumber(source['activeChats'], fallback.activeChats),
      evaluatorsCount: this.toNumber(source['evaluatorsCount'], fallback.evaluatorsCount),
      supportCount: this.toNumber(source['supportCount'], fallback.supportCount),
      pendingAssignments: this.toNumber(source['pendingAssignments'], fallback.pendingAssignments),
      updatedAt: source['updatedAt'] ?? null,
    };
  }

  private roleItems(summary: AdminOverviewSummary): Array<{ label: string; value: number; color: string }> {
    const palette: Record<string, string> = {
      admin: 'var(--admin-primary)',
      evaluator: 'var(--admin-warning)',
      adjudicator: 'var(--admin-success)',
      agent: 'var(--admin-indigo)',
      submitter: 'var(--admin-surface-alt)',
    };

    return ['admin', 'evaluator', 'adjudicator', 'agent', 'submitter']
      .map(key => ({
        label: key === 'submitter' ? 'Users' : key.charAt(0).toUpperCase() + key.slice(1),
        value: Number(summary.usersByRole[key] ?? 0),
        color: palette[key] ?? 'var(--admin-border)',
      }))
      .filter(item => item.value > 0);
  }

  private toDate(value: unknown): Date | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return value;
    }
    const withToDate = value as { toDate?: () => Date };
    if (typeof withToDate.toDate === 'function') {
      return withToDate.toDate();
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }

  /** YYYY-MM-DD in the browser's local time zone. */
  private dayKey(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  private toNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private toRecordMap(value: unknown, fallback: Record<string, number>): Record<string, number> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return fallback;
    }

    const result: Record<string, number> = {};
    for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
      result[key] = this.toNumber(entryValue, 0);
    }
    return result;
  }

  private normalizeIdeaStatusCounts(value: unknown): Record<IdeaStatus, number> {
    const result = { ...this.fallbackOverview.ideasByStatus } as Record<IdeaStatus, number>;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return result;
    }

    for (const [legacyStatus, count] of Object.entries(value as Record<string, unknown>)) {
      try {
        const status = requireIdeaStatus(legacyStatus);
        result[status] += this.toNumber(count, 0);
      } catch (error) {
        console.error(`[AdminDashboardService] overview has an invalid idea status "${legacyStatus}"`, error);
      }
    }

    return result;
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('en-US').format(value ?? 0);
  }
}