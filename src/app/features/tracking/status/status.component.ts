import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Idea, IdeaFeedback } from '../../../shared/models/idea.model';
import { IdeaLoaderComponent } from '../../../shared/components/idea-loader/idea-loader.component';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserDataService } from '../../../core/services/user-data.service';
import { STAGES, type HealthColour } from '../../../shared/workflow/idea-workflow';

const HEALTH_LABELS: Readonly<Record<HealthColour, string>> = {
  green: 'On track',
  yellow: 'Attention needed',
  red: 'Closed',
};

@Component({
  selector: 'app-status',
  imports: [DatePipe, IdeaLoaderComponent, RouterLink],
  templateUrl: './status.component.html',
  styleUrl: './status.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly userDataService = inject(UserDataService);
  private stopWatchingIdeas: (() => void) | null = null;

  protected readonly stages = STAGES;
  protected readonly healthLabels = HEALTH_LABELS;
  protected readonly ideas = signal<Idea[]>([]);
  protected readonly feedbackByIdea = signal<Record<string, IdeaFeedback[] | undefined>>({});
  protected readonly feedbackLoading = signal<Record<string, boolean | undefined>>({});
  protected readonly feedbackErrors = signal<Record<string, string | undefined>>({});
  protected readonly replyDrafts = signal<Record<string, string | undefined>>({});
  protected readonly replyingTo = signal<string | null>(null);
  protected readonly replyErrors = signal<Record<string, string>>({});
  protected readonly isLoading = signal(true);
  protected readonly hasSignedInUser = signal(false);
  protected readonly loadError = signal<string | null>(null);
  private feedbackLoadSequence = 0;

  ngOnInit(): void {
    void this.loadSubmissions();
  }

  ngOnDestroy(): void {
    this.stopWatchingIdeas?.();
  }

  protected async loadSubmissions(): Promise<void> {
    this.stopWatchingIdeas?.();
    this.stopWatchingIdeas = null;
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const authUser = await this.authService.getCurrentUser();
      if (!authUser) {
        this.hasSignedInUser.set(false);
        this.ideas.set([]);
        this.isLoading.set(false);
        return;
      }

      this.hasSignedInUser.set(true);
      this.stopWatchingIdeas = this.userDataService.watchIdeasForUser(
        authUser.uid,
        (ideas) => {
          this.ideas.set(ideas);
          void this.loadFeedback(ideas);
          this.isLoading.set(false);
        },
        (error: unknown) => this.handleLoadError(error),
      );
    } catch (error: unknown) {
      this.handleLoadError(error);
    }
  }

  private handleLoadError(error: unknown): void {
    console.error('[StatusComponent] could not load submissions', error);
    const message = 'We could not load your submissions. Check your connection and try again.';
    this.loadError.set(message);
    this.isLoading.set(false);
    this.toastService.error(message);
  }

  protected onReplyInput(ideaId: string, feedbackId: string, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) return;
    const key = this.replyKey(ideaId, feedbackId);
    this.replyDrafts.update((drafts) => ({ ...drafts, [key]: target.value }));
  }

  protected async sendReply(ideaId: string, feedbackId: string): Promise<void> {
    const key = this.replyKey(ideaId, feedbackId);
    const message = (this.replyDrafts()[key] ?? '').trim();
    if (!message || message.length > 2000 || this.replyingTo()) return;

    this.replyingTo.set(key);
    this.replyErrors.update((errors) => ({ ...errors, [key]: '' }));
    try {
      await this.userDataService.replyToFeedback(ideaId, feedbackId, message);
      const feedback = await this.userDataService.getFeedbackForIdea(ideaId);
      this.feedbackByIdea.update((current) => ({ ...current, [ideaId]: feedback }));
      this.replyDrafts.update((drafts) => ({ ...drafts, [key]: '' }));
      this.toastService.success('Your reply was sent.');
    } catch (error: unknown) {
      console.error('[StatusComponent] could not send feedback reply', error);
      const message = 'We could not send your reply. Check your connection and try again.';
      this.replyErrors.update((errors) => ({ ...errors, [key]: message }));
      this.toastService.error(message);
    } finally {
      this.replyingTo.set(null);
    }
  }

  private async loadFeedback(ideas: Idea[]): Promise<void> {
    const sequence = ++this.feedbackLoadSequence;
    this.feedbackLoading.set(
      Object.fromEntries(ideas.map((idea) => [idea.id, true])),
    );
    this.feedbackErrors.set({});

    const results = await Promise.all(
      ideas.map(async (idea) => {
        try {
          return {
            ideaId: idea.id,
            feedback: await this.userDataService.getFeedbackForIdea(idea.id),
            error: null,
          };
        } catch (error: unknown) {
          console.error('[StatusComponent] could not load idea feedback', { ideaId: idea.id, error });
          return {
            ideaId: idea.id,
            feedback: [] as IdeaFeedback[],
            error: 'Feedback could not be loaded. Please try again later.',
          };
        }
      }),
    );

    if (sequence !== this.feedbackLoadSequence) return;
    this.feedbackByIdea.set(
      Object.fromEntries(results.map(({ ideaId, feedback }) => [ideaId, feedback])),
    );
    this.feedbackLoading.set(Object.fromEntries(ideas.map((idea) => [idea.id, false])));
    const feedbackErrors: Record<string, string | undefined> = {};
    for (const result of results) {
      if (result.error !== null) {
        feedbackErrors[result.ideaId] = result.error;
      }
    }
    this.feedbackErrors.set(feedbackErrors);
    if (results.some((result) => result.error !== null)) {
      this.toastService.error('Some feedback could not be loaded. Please try again later.');
    }
  }

  protected replyKey(ideaId: string, feedbackId: string): string {
    return `${ideaId}:${feedbackId}`;
  }
}
