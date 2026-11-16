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

interface Column {
  key: SortKey;
  label: string;
}

const COLUMNS: Record<StaffRole, Column[]> = {
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

  readonly rows = signal<StaffActivityRow[]>([]);
  readonly loading = signal(true);
  readonly error = this.staffService.error;

  readonly activeTab = signal<StaffRole>('evaluator');
  readonly search = signal('');
  readonly sortKey = signal<SortKey>('name');
  readonly sortDirection = signal<'asc' | 'desc'>('asc');

  readonly columns = computed(() => COLUMNS[this.activeTab()]);

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

  readonly visibleRows = computed(() => {
    const role = this.activeTab();
    const query = this.search().trim().toLowerCase();
    const key = this.sortKey();
    const direction = this.sortDirection() === 'asc' ? 1 : -1;

    return this.rows()
      .filter(row => row.role === role)
      .filter(row => !query || row.name.toLowerCase().includes(query) || row.email.toLowerCase().includes(query))
      .sort((left, right) => this.compare(left, right, key) * direction);
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

  setSort(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDirection.update(direction => (direction === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortKey.set(key);
      this.sortDirection.set(key === 'name' ? 'asc' : 'desc');
    }
  }

  ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) {
      return 'none';
    }
    return this.sortDirection() === 'asc' ? 'ascending' : 'descending';
  }

  cell(row: StaffActivityRow, key: SortKey): string {
    switch (key) {
      case 'avgFirstResponseSeconds':
        return this.formatDuration(row.avgFirstResponseSeconds);
      case 'lastActive':
        return this.formatDate(row.lastActive);
      case 'name':
        return row.name;
      default:
        return String(row[key]);
    }
  }

  private compare(left: StaffActivityRow, right: StaffActivityRow, key: SortKey): number {
    const a = this.sortValue(left, key);
    const b = this.sortValue(right, key);

    // Empty values always go last.
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
    return row[key];
  }

  private formatDuration(seconds: number | null): string {
    if (seconds === null) {
      return '—';
    }
    if (seconds < 60) {
      return `${seconds}s`;
    }
    if (seconds < 3600) {
      return `${Math.round(seconds / 60)} min`;
    }
    return `${(seconds / 3600).toFixed(1)} h`;
  }

  private formatDate(date: Date | null): string {
    return date ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—';
  }
}