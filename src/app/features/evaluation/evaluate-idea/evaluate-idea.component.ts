import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, FormRecord, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { IdeaLoaderComponent } from '../../../shared/components/idea-loader/idea-loader.component';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserDataService } from '../../../core/services/user-data.service';
import type {
  EvaluationContext,
  EvaluationRecommendation,
  IdeaQuestion,
} from '../../../shared/models/idea-evaluation.model';
import { summarisePanel, weightedScore } from '../../../shared/workflow/evaluation-scoring';
import type { PanelSummary } from '../../../shared/workflow/evaluation-scoring';

@Component({
  selector: 'app-evaluate-idea',
  imports: [IdeaLoaderComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './evaluate-idea.component.html',
  styleUrl: './evaluate-idea.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvaluateIdeaComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);
  private readonly userDataService = inject(UserDataService);

  protected readonly context = signal<EvaluationContext | null>(null);
  protected readonly questions = signal<IdeaQuestion[]>([]);
  protected readonly panelSummary = signal<PanelSummary | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly isPostingQuestion = signal(false);
  protected readonly isRequestingChanges = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);
  protected readonly questionError = signal<string | null>(null);
  protected readonly changesError = signal<string | null>(null);
  protected readonly questionDraft = signal('');
  protected readonly changesNote = signal('');

  protected readonly form = new FormGroup({
    scores: new FormRecord<FormControl<number | null>>({}),
    comments: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(5000)],
    }),
    recommendation: new FormControl<EvaluationRecommendation | null>(
      null,
      Validators.required,
    ),
  });
  private readonly formChanges = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  protected readonly totalScore = computed(() => {
    this.formChanges();
    const context = this.context();
    if (!context) {
      return null;
    }

    const values = this.form.controls.scores.getRawValue();
    const scores: Record<string, number> = {};
    for (const criterion of context.criteriaSet.criteria) {
      const score = values[criterion.id];
      if (typeof score !== 'number') {
        return null;
      }
      scores[criterion.id] = score;
    }

    return weightedScore(scores, context.criteriaSet.criteria);
  });

  ngOnInit(): void {
    void this.loadContext();
  }

  protected async loadContext(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const user = await this.authService.getCurrentUser();
      const assignmentId = this.route.snapshot.paramMap.get('assignmentId');
      if (!user || !assignmentId) {
        throw new Error('The requested evaluation assignment is unavailable.');
      }

      const context = await this.userDataService.getEvaluationContext(user.uid, assignmentId);
      if (context.assignment.status === 'done') {
        throw new Error('This evaluation has already been submitted.');
      }
      this.context.set(context);
      for (const criterion of context.criteriaSet.criteria) {
        this.form.controls.scores.addControl(
          criterion.id,
          new FormControl<number | null>(null, {
            validators: [
              Validators.required,
              Validators.min(0),
              Validators.max(criterion.maxScore),
            ],
          }),
        );
      }

      const questions = await this.userDataService.getQuestionsForIdea(
        context.assignment.ideaId,
        context.evaluatorType === 'external' ? context.assignment.stageId : undefined,
      );
      this.questions.set(questions);

      if (context.evaluatorType === 'internal') {
        const evaluations = await this.userDataService.getPanelEvaluations(
          context.assignment.ideaId,
          context.assignment.stageId,
          user.uid,
        );
        this.panelSummary.set(summarisePanel(evaluations.map((evaluation) => evaluation.total)));
      }
    } catch (error) {
      const message = this.messageFrom(error, 'We could not load this evaluation.');
      this.loadError.set(message);
      this.toastService.error(message);
    } finally {
      this.isLoading.set(false);
    }
  }

  protected onQuestionInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement) {
      this.questionDraft.set(target.value);
    }
  }

  protected onChangesNoteInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement) {
      this.changesNote.set(target.value);
    }
  }

  protected async requestChanges(): Promise<void> {
    const context = this.context();
    const message = this.changesNote().trim();
    if (!context || this.isRequestingChanges() || this.isSaving()) {
      return;
    }
    if (!message || message.length > 500) {
      this.changesError.set('Write a reason of no more than 500 characters.');
      return;
    }

    this.isRequestingChanges.set(true);
    this.changesError.set(null);
    try {
      const user = await this.authService.getCurrentUser();
      if (!user) {
        throw new Error('You must be signed in to request changes.');
      }
      await this.userDataService.requestIdeaChanges(
        context.assignment.ideaId,
        context.assignment.id,
        context.assignment.stageId,
        message,
      );
      this.toastService.success(
        'Your feedback was saved. The submitter can view it in tracking; email alerts are not configured yet.',
      );
      await this.router.navigate(['/evaluation/worklist']);
    } catch (error) {
      const message = this.messageFrom(error, 'We could not save the requested changes.');
      this.changesError.set(message);
      this.toastService.error(message);
    } finally {
      this.isRequestingChanges.set(false);
    }
  }

  protected async askQuestion(): Promise<void> {
    const context = this.context();
    const question = this.questionDraft().trim();
    if (!context || !question || this.isPostingQuestion()) {
      return;
    }

    this.isPostingQuestion.set(true);
    this.questionError.set(null);
    try {
      const user = await this.authService.getCurrentUser();
      if (!user) {
        throw new Error('You must be signed in to send a question.');
      }
      await this.userDataService.addEvaluatorQuestion(
        context.assignment.ideaId,
        user.uid,
        question,
        context.assignment.stageId,
      );
      this.questions.set(
        await this.userDataService.getQuestionsForIdea(
          context.assignment.ideaId,
          context.evaluatorType === 'external' ? context.assignment.stageId : undefined,
        ),
      );
      this.questionDraft.set('');
      this.toastService.success('Your clarification question was sent.');
    } catch (error) {
      const message = this.messageFrom(error, 'We could not send your question.');
      this.questionError.set(message);
      this.toastService.error(message);
    } finally {
      this.isPostingQuestion.set(false);
    }
  }

  protected async saveEvaluation(): Promise<void> {
    const context = this.context();
    const total = this.totalScore();
    if (!context || this.form.invalid || total === null) {
      this.form.markAllAsTouched();
      return;
    }

    const recommendation = this.form.controls.recommendation.value;
    if (!recommendation) {
      this.form.controls.recommendation.markAsTouched();
      return;
    }

    const scores: Record<string, number> = {};
    const values = this.form.controls.scores.getRawValue();
    for (const criterion of context.criteriaSet.criteria) {
      const score = values[criterion.id];
      if (typeof score !== 'number') {
        this.form.controls.scores.controls[criterion.id]?.markAsTouched();
        return;
      }
      scores[criterion.id] = score;
    }

    this.isSaving.set(true);
    this.saveError.set(null);
    try {
      const user = await this.authService.getCurrentUser();
      if (!user) {
        throw new Error('You must be signed in to submit an evaluation.');
      }
      await this.userDataService.saveEvaluation(
        context.assignment,
        user.uid,
        scores,
        this.form.controls.comments.value,
        recommendation,
        total,
      );
      this.toastService.success('Your evaluation was submitted.');
      await this.router.navigate(['/evaluation/worklist']);
    } catch (error) {
      const message = this.messageFrom(error, 'We could not submit your evaluation.');
      this.saveError.set(message);
      this.toastService.error(message);
    } finally {
      this.isSaving.set(false);
    }
  }

  protected formatDueDate(context: EvaluationContext): string {
    const date = context.assignment.dueAt?.toDate();
    return date
      ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(date)
      : 'No due date';
  }

  private messageFrom(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }
}
