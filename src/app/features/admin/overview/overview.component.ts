import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  AdminDashboardService,
  AdminOverviewSummary,
} from '../../../core/services/admin-dashboard.service';

@Component({
  selector: 'app-admin-overview',
  imports: [RouterLink],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewComponent implements OnInit {
  private readonly dashboard = inject(AdminDashboardService);

  // The single source of truth. Setting a signal tells Angular to re-render,
  // even with OnPush or a zoneless app.
  private readonly summary = signal<AdminOverviewSummary>(this.dashboard.fallbackOverview);

  readonly loading = signal(true);
  readonly error = this.dashboard.overviewError;

  // Everything the template needs is derived from the summary.
  readonly stats = computed(() => this.dashboard.buildOverviewStats(this.summary()));
  readonly roleBreakdown = computed(() => this.dashboard.buildRoleBreakdown(this.summary()));
  readonly statusBreakdown = computed(() => this.dashboard.buildStatusBreakdown(this.summary()));
  readonly topStaff = computed(() => this.dashboard.buildTopStaff(this.summary()));
  readonly ideasTrendPath = computed(() => this.dashboard.buildIdeasPerDayPath(this.summary()));
  readonly totalUsers = computed(() => this.summary().totalUsers);

  readonly donutGradient = computed(() => {
    const items = this.roleBreakdown();
    const total = items.reduce((sum, item) => sum + item.value, 0) || 1;

    let offset = 0;
    const segments = items.map((item) => {
      const percent = (item.value / total) * 100;
      const start = offset;
      offset += percent;
      return `${item.color} ${start}% ${offset}%`;
    });

    return `conic-gradient(${segments.join(', ') || 'var(--admin-primary) 0 100%'})`;
  });

  async ngOnInit(): Promise<void> {
    try {
      const result = await this.dashboard.loadOverviewSummary();
      this.summary.set(result); // this line triggers the re-render
    } catch (error) {
      console.error('[OverviewComponent] failed to load overview', error);
    } finally {
      this.loading.set(false);
    }
  }
}
