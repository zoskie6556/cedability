import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IdeaLoaderComponent } from '../../../shared/components/idea-loader/idea-loader.component';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserDataService } from '../../../core/services/user-data.service';
import type { EvaluationWorklistItem } from '../../../shared/models/idea-evaluation.model';

@Component({
  selector: 'app-evaluator-worklist',
  imports: [IdeaLoaderComponent, RouterLink],
  templateUrl: './evaluator-worklist.component.html',
  styleUrl: './evaluator-worklist.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvaluatorWorklistComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly userDataService = inject(UserDataService);

  protected readonly assignments = signal<EvaluationWorklistItem[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  ngOnInit(): void {
    void this.loadAssignments();
  }

  protected async loadAssignments(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const user = await this.authService.getCurrentUser();
      if (!user) {
        throw new Error('You must be signed in to view evaluator assignments.');
      }
      this.assignments.set(await this.userDataService.getEvaluatorWorklist(user.uid));
    } catch (error) {
      const message = this.messageFrom(error);
      this.loadError.set(message);
      this.toastService.error(message);
    } finally {
      this.isLoading.set(false);
    }
  }

  protected formatDueDate(item: EvaluationWorklistItem): string {
    const date = item.assignment.dueAt?.toDate();
    return date
      ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(date)
      : 'No due date';
  }

  private messageFrom(error: unknown): string {
    return error instanceof Error && error.message
      ? error.message
      : 'We could not load evaluator assignments. Please try again.';
  }
}
