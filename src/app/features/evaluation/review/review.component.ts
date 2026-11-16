import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserDataService } from '../../../core/services/user-data.service';
import type { IdeaQuestion } from '../../../shared/models/idea-evaluation.model';
import type { AutomatedReviewCriterion, Idea } from '../../../shared/models/idea.model';
import { STAGES } from '../../../shared/workflow/idea-workflow';

@Component({
  selector: 'app-review',
  imports: [],
  templateUrl: './review.component.html',
  styleUrl: './review.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly userDataService = inject(UserDataService);

  protected readonly ideas = signal<Idea[]>([]);
  protected readonly stages = STAGES;
  protected readonly questions = signal<Record<string, IdeaQuestion[] | undefined>>({});
  protected readonly questionDrafts = signal<Partial<Record<string, string>>>({});
  protected readonly isLoading = signal(true);
  protected readonly isEvaluator = signal(false);
  protected readonly isPostingQuestion = signal<string | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly questionErrors = signal<Record<string, string>>({});
  protected readonly criteria: { key: AutomatedReviewCriterion; label: string }[] = [
    { key: 'market', label: 'Market' },
    { key: 'technical', label: 'Technical feasibility' },
    { key: 'operations', label: 'Operations' },
    { key: 'financial', label: 'Financial plan' },
    { key: 'delivery', label: 'Milestones and delivery' },
    { key: 'impact', label: 'Intended impact' },
  ];

  ngOnInit(): void {
    void this.loadReview();
  }

  protected async loadReview(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const authUser = await this.authService.getCurrentUser();
      if (!authUser) {
        this.isEvaluator.set(false);
        return;
      }

      const user = await this.userDataService.getOrCreateUser(authUser);
      if (user.role !== 'evaluator' && user.role !== 'admin') {
        this.isEvaluator.set(false);
        return;
      }

      this.isEvaluator.set(true);
      const ideas = await this.userDataService.getIdeasForEvaluator();
      this.ideas.set(ideas);

      const loadedQuestions: Record<string, IdeaQuestion[] | undefined> = {};
      await Promise.all(
        ideas.map(async (idea) => {
          loadedQuestions[idea.id] = await this.userDataService.getQuestionsForIdea(idea.id);
        }),
      );
      this.questions.set(loadedQuestions);
    } catch {
      this.loadError.set('We could not load the evaluator workspace. Check your access and try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  protected setQuestionDraft(ideaId: string, event: Event): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement) {
      const value = target.value;
      this.questionDrafts.update((drafts) => ({
        ...drafts,
        [ideaId]: value,
      }));
    }
  }

  protected async askQuestion(idea: Idea): Promise<void> {
    const question = this.questionDrafts()[idea.id]?.trim() ?? '';
    if (!question || this.isPostingQuestion()) {
      return;
    }

    this.isPostingQuestion.set(idea.id);
    this.questionErrors.update((errors) => ({ ...errors, [idea.id]: '' }));
    try {
      const authUser = await this.authService.getCurrentUser();
      if (!authUser) {
        throw new Error('You must be signed in to send an evaluator question.');
      }
      await this.userDataService.addEvaluatorQuestion(idea.id, authUser.uid, question);
      await this.refreshQuestions(idea.id);
      this.questionDrafts.update((drafts) => ({ ...drafts, [idea.id]: '' }));
      this.toastService.success('Your question was sent to the applicant.');
    } catch {
      this.questionErrors.update((errors) => ({
        ...errors,
        [idea.id]: 'We could not send the question. Please try again.',
      }));
      this.toastService.error('We could not send the question. Please try again.');
    } finally {
      this.isPostingQuestion.set(null);
    }
  }

  private async refreshQuestions(ideaId: string): Promise<void> {
    const questions = await this.userDataService.getQuestionsForIdea(ideaId);
    this.questions.update((current) => ({ ...current, [ideaId]: questions }));
  }
}
