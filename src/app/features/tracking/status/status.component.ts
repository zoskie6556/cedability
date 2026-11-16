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
import type { Idea } from '../../../shared/models/idea.model';
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
  protected readonly isLoading = signal(true);
  protected readonly hasSignedInUser = signal(false);
  protected readonly loadError = signal<string | null>(null);

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
}
