import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { IdeaLoaderComponent } from '../../../shared/components/idea-loader/idea-loader.component';
import { AdminAuditService, AuditEntry } from '../../../core/services/admin-audit.service';
import { ToastService } from '../../../core/services/toast.service';

type Severity = 'success' | 'warning' | 'info';

const BATCH_SIZE = 200;
const PAGE_SIZE = 25;

@Component({
  selector: 'app-admin-audit-log',
  imports: [IdeaLoaderComponent],
  templateUrl: './audit-log.component.html',
  styleUrl: './audit-log.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditLogComponent implements OnInit {
  private readonly service = inject(AdminAuditService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = this.service.loading;
  readonly error = this.service.error;

  /** How many of the newest entries are loaded from Firestore. */
  readonly loadedLimit = signal(BATCH_SIZE);

  readonly search = signal('');
  readonly actionFilter = signal('all');
  readonly entityFilter = signal('all');
  readonly fromDate = signal('');
  readonly toDate = signal('');
  readonly page = signal(0);

  readonly pageSize = PAGE_SIZE;

  readonly actionOptions = computed(() => this.distinct(this.service.entries().map(entry => entry.action)));
  readonly entityOptions = computed(() => this.distinct(this.service.entries().map(entry => entry.entityType)));

  readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();
    const action = this.actionFilter();
    const entity = this.entityFilter();
    const from = this.fromDate() ? new Date(`${this.fromDate()}T00:00:00`) : null;
    const to = this.toDate() ? new Date(`${this.toDate()}T23:59:59.999`) : null;

    return this.service.entries().filter(entry => {
      if (action !== 'all' && entry.action !== action) return false;
      if (entity !== 'all' && entry.entityType !== entity) return false;
      if (from && (!entry.at || entry.at < from)) return false;
      if (to && (!entry.at || entry.at > to)) return false;
      if (query) {
        const haystack = `${entry.actorName} ${entry.action} ${entry.entityType} ${entry.entityId} ${entry.summary}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  });

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));

  readonly pageRows = computed(() => {
    const start = Math.min(this.page(), this.pageCount() - 1) * PAGE_SIZE;
    return this.filtered().slice(start, start + PAGE_SIZE);
  });

  /** True when the newest `loadedLimit` entries were all returned, so older ones probably exist. */
  readonly canLoadMore = computed(() => this.service.entries().length >= this.loadedLimit());

  readonly hasActiveFilters = computed(
    () =>
      !!this.search() ||
      this.actionFilter() !== 'all' ||
      this.entityFilter() !== 'all' ||
      !!this.fromDate() ||
      !!this.toDate(),
  );

  ngOnInit(): void {
    this.service.watch(this.loadedLimit(), this.destroyRef);
  }

  // ---- Filters ----

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement | null)?.value ?? '');
    this.page.set(0);
  }

  onActionFilter(event: Event): void {
    this.actionFilter.set((event.target as HTMLSelectElement | null)?.value ?? 'all');
    this.page.set(0);
  }

  onEntityFilter(event: Event): void {
    this.entityFilter.set((event.target as HTMLSelectElement | null)?.value ?? 'all');
    this.page.set(0);
  }

  onFromDate(event: Event): void {
    this.fromDate.set((event.target as HTMLInputElement | null)?.value ?? '');
    this.page.set(0);
  }

  onToDate(event: Event): void {
    this.toDate.set((event.target as HTMLInputElement | null)?.value ?? '');
    this.page.set(0);
  }

  clearFilters(): void {
    this.search.set('');
    this.actionFilter.set('all');
    this.entityFilter.set('all');
    this.fromDate.set('');
    this.toDate.set('');
    this.page.set(0);
  }

  // ---- Paging ----

  previousPage(): void {
    this.page.update(value => Math.max(0, value - 1));
  }

  nextPage(): void {
    this.page.update(value => Math.min(this.pageCount() - 1, value + 1));
  }

  loadMore(): void {
    this.loadedLimit.update(value => value + BATCH_SIZE);
    this.service.watch(this.loadedLimit(), this.destroyRef);
  }

  // ---- Export ----

  /** Downloads everything that matches the current filters (not just the visible page) as a CSV file. */
  exportCsv(): void {
    const rows = this.filtered();
    if (rows.length === 0) {
      this.toast.error('There are no entries to export.');
      return;
    }

    const header = ['When', 'Actor', 'Role', 'Action', 'Entity type', 'Entity ID', 'Details'];
    const lines = rows.map(entry =>
      [
        entry.at ? entry.at.toISOString() : '',
        entry.actorName,
        entry.actorRole,
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.summary,
      ]
        .map(value => this.csvCell(value))
        .join(','),
    );

    // The BOM makes Excel open the file as UTF-8.
    const blob = new Blob(['\uFEFF' + [header.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cedability-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    this.toast.success(`Exported ${rows.length} entries.`);
  }

  // ---- Template helpers ----

  actionLabel(action: string): string {
    const [group, ...rest] = action.split('.');
    const verb = rest.join('.').replace(/_/g, ' ');
    return verb ? `${this.capitalise(group)}: ${verb}` : this.capitalise(action.replace(/_/g, ' '));
  }

  severity(entry: AuditEntry): Severity {
    const action = entry.action.toLowerCase();
    if (/(delete|remove|disable|role|reject|unpublish)/.test(action)) {
      return 'warning';
    }
    if (/(creat|publish|approv|award|resolv|upload|assign)/.test(action)) {
      return 'success';
    }
    return 'info';
  }

  target(entry: AuditEntry): string {
    if (!entry.entityType && !entry.entityId) {
      return '—';
    }
    const shortId = entry.entityId.length > 10 ? `${entry.entityId.slice(0, 8)}…` : entry.entityId;
    return [this.capitalise(entry.entityType), shortId].filter(Boolean).join(' · ');
  }

  formatDate(date: Date | null): string {
    return date
      ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'medium' }).format(date)
      : 'Just now';
  }

  // ---- Internals ----

  private distinct(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
  }

  private capitalise(text: string): string {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  }

  /** Quotes a CSV value and neutralises spreadsheet formulas (cells starting with = + - @). */
  private csvCell(value: string): string {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  }
}