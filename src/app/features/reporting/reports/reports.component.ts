import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { IDEA_STATUSES, STAGES, type IdeaStatus } from '../../../shared/workflow/idea-workflow';
//import type { ChatAnalyticsSummary, ChatStatus } from '../../../shared/models/chat.model';
//import { ReportingService, type ReportingOverview } from '../../../core/services/reporting.service';
import { ToastService } from '../../../core/services/toast.service';
import { IdeaLoaderComponent } from '../../../shared/components/idea-loader/idea-loader.component';
import { ideaReportCsv, toCsv } from '../report-export';

//const EMPTY_CHAT_SUMMARY: ChatAnalyticsSummary = {
//  totalChats: 0,
//  byStatus: { waiting: 0, active: 0, closed: 0, offline_message: 0 },
//  resolutionRate: 0,
//  avgFirstResponseSeconds: null,
//  chatsPerDay: {},
//  chatsByHour: new Array<number>(24).fill(0),
//};

//const CHAT_STATUS_LABELS: Record<ChatStatus, string> = {
  // waiting: 'Waiting',
  // active: 'Active',
  // closed: 'Closed',
  // offline_message: 'Offline messages',
//    };

// const EVALUATION_OUTCOMES = [
//   { key: 'advance', label: 'Advance' },
//   { key: 'revise', label: 'Request changes' },
//   { key: 'reject', label: 'Reject' },
// ] as const;

@Component({
  selector: 'app-reports',
  imports: [ ReactiveFormsModule],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsComponent {
  // private readonly reportingService = inject(ReportingService);
  // private readonly toast = inject(ToastService);
  // private readonly destroyRef = inject(DestroyRef);

  // protected readonly loading = signal(true);
  // protected readonly overview = signal<ReportingOverview | null>(null);
  // protected readonly error = signal<string | null>(null);
  // protected readonly reportLoading = signal(false);
  // protected readonly reportError = signal<string | null>(null);
  // protected readonly ideaIdControl = new FormControl('', {
  //   nonNullable: true,
  //   validators: [Validators.required, Validators.maxLength(128), Validators.pattern(/^[^/]+$/)],
  // });

  // protected readonly chatSummary = computed(
  //   () => this.overview()?.chatAnalytics ?? EMPTY_CHAT_SUMMARY,
  // );
  // protected readonly chatAnalyticsAvailable = computed(
  //   () => this.overview()?.chatAnalytics !== null,
  // );

  // protected readonly statusRows = computed(() => {
  //   const data = this.overview();
  //   const total = Math.max(data?.totalIdeas ?? 0, 1);
  //   return IDEA_STATUSES.map((status) => ({
  //     status,
  //     label: STAGES[status].label,
  //     value: data?.byStatus[status] ?? 0,
  //     percent: Math.round(((data?.byStatus[status] ?? 0) / total) * 100),
  //   }));
  // });

  // protected readonly categoryRows = computed(() => {
  //   const data = this.overview();
  //   const entries = Object.entries(data?.byCategory ?? {}).sort(([left], [right]) =>
  //     left.localeCompare(right),
  //   );
  //   const total = Math.max(data?.totalIdeas ?? 0, 1);
  //   return entries.map(([category, value]) => ({
  //     category,
  //     label: category === 'uncategorised' ? 'Uncategorised' : this.titleCase(category),
  //     value,
  //     percent: Math.round((value / total) * 100),
  //   }));
  // });

  // protected readonly outcomeRows = computed(() =>
  //   EVALUATION_OUTCOMES.map(({ key, label }) => ({
  //     key,
  //     label,
  //     value: this.overview()?.evaluationOutcomes[key] ?? 0,
  //   })),
  // );

  // protected readonly stageRows = computed(() =>
  //   IDEA_STATUSES.map((status) => ({
  //     status,
  //     label: STAGES[status].label,
  //     days: this.overview()?.avgDaysPerStage[status] ?? 0,
  //   })),
  // );

  // protected readonly maxStatusCount = computed(() =>
  //   Math.max(...this.statusRows().map((row) => row.value), 1),
  // );

  // protected readonly maxCategoryCount = computed(() =>
  //   Math.max(...this.categoryRows().map((row) => row.value), 1),
  // );

  // protected readonly maxOutcomeCount = computed(() =>
  //   Math.max(...this.outcomeRows().map((row) => row.value), 1),
  // );

  // protected readonly maxStageDays = computed(() =>
  //   Math.max(...this.stageRows().map((row) => row.days), 1),
  // );

  // protected readonly statusChatRows = computed(() =>
  //   (Object.keys(CHAT_STATUS_LABELS) as ChatStatus[]).map((status) => ({
  //     status,
  //     label: CHAT_STATUS_LABELS[status],
  //     value: this.chatSummary().byStatus[status],
  //   })),
  // );

  // protected readonly busiestHour = computed(() => {
  //   const hours = this.chatSummary().chatsByHour;
  //   const busiest = Math.max(...hours);
  //   return busiest > 0 ? hours.indexOf(busiest) : null;
  // });

  // protected readonly maxHourCount = computed(() => Math.max(...this.chatSummary().chatsByHour, 1));

  // protected readonly chatsPerDayRows = computed(() => {
  //   const cutoff = new Date();
  //   cutoff.setUTCDate(cutoff.getUTCDate() - 29);
  //   const cutoffKey = cutoff.toISOString().slice(0, 10);
  //   return Object.entries(this.chatSummary().chatsPerDay)
  //     .filter(([day]) => day >= cutoffKey)
  //     .sort(([left], [right]) => left.localeCompare(right));
  // });

  // ngOnInit(): void {
  //   const unsubscribe = this.reportingService.listenToOverview(
  //     (overview) => {
  //       this.overview.set(overview);
  //       this.error.set(null);
  //       this.loading.set(false);
  //     },
  //     (error: Error) => {
  //       console.error('[ReportsComponent] could not load stats/overview.', error);
  //       this.error.set('Reporting data could not be loaded. Please try again later.');
  //       this.toast.error('Reporting data could not be loaded.');
  //       this.loading.set(false);
  //     },
  //   );
  //   this.destroyRef.onDestroy(unsubscribe);
  // }

  // protected async downloadIdeaReport(): Promise<void> {
  //   if (this.ideaIdControl.invalid) {
  //     this.ideaIdControl.markAsTouched();
  //     return;
  //   }

  //   this.reportLoading.set(true);
  //   this.reportError.set(null);
  //   try {
  //     const report = await this.reportingService.getIdeaReport(this.ideaIdControl.value.trim());
  //     this.downloadFile(`${this.safeFileName(report.ideaId)}-report.csv`, ideaReportCsv(report));
  //     this.toast.success('The idea report was downloaded.');
  //   } catch (error: unknown) {
  //     console.error('[ReportsComponent] could not download idea report.', error);
  //     this.reportError.set('The idea report could not be downloaded. Check the ID and try again.');
  //     this.toast.error('The idea report could not be downloaded.');
  //   } finally {
  //     this.reportLoading.set(false);
  //   }
  // }

  // protected downloadOverviewCsv(kind: 'participation' | 'outcomes' | 'timelines'): void {
  //   const data = this.overview();
  //   if (!data) return;

  //   const rows: unknown[][] =
  //     kind === 'participation'
  //       ? [
  //           ['Category', 'Ideas', 'Share of ideas (%)'],
  //           ...this.categoryRows().map((row) => [
  //             row.label,
  //             row.value,
  //             Math.round((row.value / Math.max(data.totalIdeas, 1)) * 100),
  //           ]),
  //         ]
  //       : kind === 'outcomes'
  //         ? [
  //             ['Evaluation outcome', 'Decisions'],
  //             ...this.outcomeRows().map((row) => [row.label, row.value]),
  //           ]
  //         : [
  //             ['Stage', 'Average days per completed stage visit'],
  //             ...this.stageRows().map((row) => [row.label, Number(row.days.toFixed(2))]),
  //           ];

  //   try {
  //     this.downloadFile(`cedability-${kind}.csv`, toCsv(rows));
  //     this.toast.success(`${this.titleCase(kind)} CSV downloaded.`);
  //   } catch (error: unknown) {
  //     console.error(`[ReportsComponent] could not export ${kind} data.`, error);
  //     this.toast.error(`The ${kind} CSV could not be downloaded.`);
  //   }
  // }

  // protected formatPercent(value: number): string {
  //   return `${Math.round(value * 100)}%`;
  // }

  // protected formatResponseTime(seconds: number | null): string {
  //   if (seconds === null) return '—';
  //   if (seconds < 60) return `${Math.round(seconds)}s`;
  //   if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  //   return `${(seconds / 3600).toFixed(1)} h`;
  // }

  // protected formatHour(hour: number): string {
  //   return new Intl.DateTimeFormat('en-GB', {
  //     hour: '2-digit',
  //     hourCycle: 'h23',
  //     timeZone: 'UTC',
  //   }).format(new Date(Date.UTC(2000, 0, 1, hour)));
  // }

  // protected formatDays(days: number): string {
  //   return `${days.toFixed(1)} days`;
  // }

  // private titleCase(value: string): string {
  //   return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  // }

  // private safeFileName(value: string): string {
  //   return value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'idea';
  // }

  // private downloadFile(fileName: string, contents: string): void {
  //   const blob = new Blob([contents], { type: 'text/csv;charset=utf-8' });
  //   const url = URL.createObjectURL(blob);
  //   const link = document.createElement('a');
  //   link.href = url;
  //   link.download = fileName;
  //   document.body.append(link);
  //   link.click();
  //   link.remove();
  //   window.setTimeout(() => URL.revokeObjectURL(url), 0);
  // }
}
