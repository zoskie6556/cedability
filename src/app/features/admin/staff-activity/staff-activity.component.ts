import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { IdeaLoaderComponent } from '../../../shared/components/idea-loader/idea-loader.component';
import { AdminStaffService, StaffActivityRow, StaffRole } from '../../../core/services/admin-staff.service';

type SortKey =
  | 'name'
  | 'evaluationsCompleted'
  | 'feedbackGiven'
  | 'pendingAssignments'
  | 'decisionsMade'
  | 'chatsHandled'
  | 'chatsResponded'
  | 'ticketsAssigned'
  | 'ticketsResolved'
  | 'avgFirstResponseSeconds'
  | 'lastActive';

interface MetricField {
  key: Exclude<SortKey, 'name'>;
  label: string;
}

const MAX_VISIBLE_STAFF = 5;

const ROLE_METRICS: Record<StaffRole, MetricField[]> = {
  evaluator: [
    { key: 'evaluationsCompleted', label: 'Evaluations completed' },
    { key: 'feedbackGiven', label: 'Feedback given' },
    { key: 'pendingAssignments', label: 'Pending' },
    { key: 'lastActive', label: 'Last active' },
  ],
  agent: [
    { key: 'chatsHandled', label: 'Chats handled' },
    { key: 'chatsResponded', label: 'Chats responded' },
    { key: 'ticketsAssigned', label: 'Tickets assigned' },
    { key: 'ticketsResolved', label: 'Tickets resolved' },
    { key: 'avgFirstResponseSeconds', label: 'Avg first response' },
    { key: 'lastActive', label: 'Last active' },
  ],
  adjudicator: [
    { key: 'decisionsMade', label: 'Decisions made' },
    { key: 'feedbackGiven', label: 'Feedback given' },
    { key: 'lastActive', label: 'Last active' },
  ],
};

@Component({
  selector: 'app-admin-staff-activity',
  imports: [IdeaLoaderComponent],
  templateUrl: './staff-activity.component.html',
  styleUrl: './staff-activity.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffActivityComponent implements OnInit {
  private readonly staffService = inject(AdminStaffService);

  readonly tabs: ReadonlyArray<{ role: StaffRole; label: string }> = [
    { role: 'evaluator', label: 'Evaluators' },
    { role: 'agent', label: 'Support Team' },
    { role: 'adjudicator', label: 'Adjudicators' },
  ];

  readonly maxVisible = MAX_VISIBLE_STAFF;
  readonly rows = signal<StaffActivityRow[]>([]);
  readonly loading = signal(true);
  readonly error = this.staffService.error;

  readonly activeTab = signal<StaffRole>('evaluator');
  readonly search = signal('');
  readonly sortKey = signal<SortKey>('name');
  readonly sortDirection = signal<'asc' | 'desc'>('asc');

  readonly metrics = computed(() => ROLE_METRICS[this.activeTab()]);

  readonly counts = computed(() => {
    const counts: Record<StaffRole, number> = { evaluator: 0, agent: 0, adjudicator: 0 };
    this.rows().forEach(row => counts[row.role]++);
    return counts;
  });

  readonly summaryCards = computed(() => {
    const rows = this.rows();
    const sum = (pick: (row: StaffActivityRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
    return [
      { label: 'Staff members', value: rows.length },
      { label: 'Evaluations completed', value: sum(row => row.evaluationsCompleted) },
      { label: 'Chats responded', value: sum(row => row.chatsResponded) },
      { label: 'Tickets resolved', value: sum(row => row.ticketsResolved) },
    ];
  });

  private readonly filteredAndSortedRows = computed(() => {
    const role = this.activeTab();
    const query = this.search().trim().toLowerCase();
    const key = this.sortKey();
    const direction = this.sortDirection() === 'asc' ? 1 : -1;

    return this.rows()
      .filter(row => row.role === role)
      .filter(row => !query || row.name.toLowerCase().includes(query) || row.email.toLowerCase().includes(query))
      .sort((left, right) => this.compare(left, right, key) * direction);
  });

  readonly totalMatchingCount = computed(() => this.filteredAndSortedRows().length);

  /** Capped at 5 unless the user is actively searching. */
  readonly visibleRows = computed(() => {
    const all = this.filteredAndSortedRows();
    const hasQuery = this.search().trim().length > 0;
    return hasQuery ? all : all.slice(0, MAX_VISIBLE_STAFF);
  });

  readonly hasMoreThanCap = computed(() => {
    const hasQuery = this.search().trim().length > 0;
    return !hasQuery && this.filteredAndSortedRows().length > MAX_VISIBLE_STAFF;
  });

  readonly activeTabLabel = computed(() => this.tabs.find(tab => tab.role === this.activeTab())?.label ?? '');

  async ngOnInit(): Promise<void> {
    try {
      const result = await this.staffService.loadStaffActivity();
      this.rows.set(result);
    } catch (error) {
      console.error('[StaffActivityComponent] failed to load staff activity', error);
    } finally {
      this.loading.set(false);
    }
  }

  selectTab(role: StaffRole): void {
    this.activeTab.set(role);
    this.sortKey.set('name');
    this.sortDirection.set('asc');
  }

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement | null)?.value ?? '');
  }

  clearSearch(): void {
    this.search.set('');
  }

  setSort(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDirection.update(direction => (direction === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortKey.set(key);
      this.sortDirection.set(key === 'name' ? 'asc' : 'desc');
    }
  }

  sortIcon(key: SortKey): string {
    if (this.sortKey() !== key) return '↕';
    return this.sortDirection() === 'asc' ? '↑' : '↓';
  }

  metricValue(row: StaffActivityRow, key: Exclude<SortKey, 'name'>): string {
    switch (key) {
      case 'avgFirstResponseSeconds':
        return this.formatDuration(row.avgFirstResponseSeconds);
      case 'lastActive':
        return this.formatDate(row.lastActive);
      default:
        return String(row[key]);
    }
  }

  private compare(left: StaffActivityRow, right: StaffActivityRow, key: SortKey): number {
    const a = this.sortValue(left, key);
    const b = this.sortValue(right, key);

    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;

    if (typeof a === 'string' && typeof b === 'string') {
      return a.localeCompare(b);
    }
    return Number(a) - Number(b);
  }

  private sortValue(row: StaffActivityRow, key: SortKey): string | number | null {
    if (key === 'lastActive') {
      return row.lastActive ? row.lastActive.getTime() : null;
    }
    return row[key] ?? null;
  }

  private formatDuration(seconds: number | null): string {
    if (seconds === null) return '—';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    return `${(seconds / 3600).toFixed(1)} h`;
  }

  private formatDate(date: Date | null): string {
    return date
      ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
      : '—';
  }
}