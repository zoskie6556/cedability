import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { Auth, authState, type User as FirebaseUser } from '@angular/fire/auth';
import { ChatService } from '../../../core/services/chat.service';
import { UserDataService } from '../../../core/services/user-data.service';
import { IdeaLoaderComponent } from '../../../shared/components/idea-loader/idea-loader.component';
import type { ChatAnalyticsSummary, ChatStatus } from '../../../shared/models/chat.model';

const STAFF_ROLES = new Set(['agent', 'admin']);
const EMPTY_SUMMARY: ChatAnalyticsSummary = {
  totalChats: 0,
  byStatus: { waiting: 0, active: 0, closed: 0, offline_message: 0 },
  resolutionRate: 0,
  avgFirstResponseSeconds: null,
  chatsPerDay: {},
  chatsByHour: new Array<number>(24).fill(0),
};

@Component({
  selector: 'app-reports',
  imports: [IdeaLoaderComponent],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsComponent implements OnInit {
  private readonly auth = inject(Auth);
  private readonly userDataService = inject(UserDataService);
  private readonly chatService = inject(ChatService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly authorized = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly summary = signal<ChatAnalyticsSummary>(EMPTY_SUMMARY);

  protected readonly statusRows = computed(() => {
    const summary = this.summary();
    const total = Math.max(summary.totalChats, 1);
    const labels: Record<ChatStatus, string> = {
      waiting: 'Waiting',
      active: 'Active',
      closed: 'Closed',
      offline_message: 'Offline messages',
    };

    return (Object.keys(labels) as ChatStatus[]).map((status) => ({
      status,
      label: labels[status],
      value: summary.byStatus[status],
      percent: Math.round((summary.byStatus[status] / total) * 100),
    }));
  });

  protected readonly busiestHour = computed(() => {
    const hours = this.summary().chatsByHour;
    const max = Math.max(...hours);
    return max > 0 ? hours.indexOf(max) : null;
  });

  protected readonly maxHourCount = computed(() => Math.max(...this.summary().chatsByHour, 1));

  protected readonly chatsPerDayRows = computed(() =>
    Object.entries(this.summary().chatsPerDay).sort(([left], [right]) => left.localeCompare(right)),
  );

  ngOnInit(): void {
    void this.initialize();
  }

  protected formatResponseTime(seconds: number | null): string {
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

  protected formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  protected formatHour(hour: number): string {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23' }).format(
      new Date(2000, 0, 1, hour),
    );
  }

  private async initialize(): Promise<void> {
    this.loading.set(true);

    const authUser = await this.getCurrentAuthUser();
    if (!authUser) {
      this.loading.set(false);
      return;
    }

    try {
      const user = await this.userDataService.getOrCreateUser(authUser);
      if (!STAFF_ROLES.has(user.role)) {
        this.authorized.set(false);
        return;
      }

      this.authorized.set(true);
      //this.summary.set(await this.chatService.loadAnalytics());
    } catch (loadError) {
      console.error('[ReportsComponent] could not load chat analytics.', loadError);
      this.error.set('Chat analytics could not be loaded. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  private getCurrentAuthUser(): Promise<FirebaseUser | null> {
    return new Promise((resolve) => {
      const subscription = authState(this.auth).subscribe((user) => {
        subscription.unsubscribe();
        resolve(user);
      });
      this.destroyRef.onDestroy(() => subscription.unsubscribe());
    });
  }
}
