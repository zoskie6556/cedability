import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { IdeaLoaderComponent } from '../../../shared/components/idea-loader/idea-loader.component';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserDataService } from '../../../core/services/user-data.service';
import type {
  AdjudicationDecision,
  AwardCandidate,
} from '../../../shared/models/idea-evaluation.model';
import type { RankedAdjudicationIdea } from '../../../shared/workflow/adjudication-ranking';

@Component({
  selector: 'app-adjudication',
  imports: [IdeaLoaderComponent, ReactiveFormsModule],
  templateUrl: './adjudication.component.html',
  styleUrl: './adjudication.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdjudicationComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly userDataService = inject(UserDataService);

  protected readonly ideas = signal<RankedAdjudicationIdea[]>([]);
  protected readonly approvedIdeas = signal<AwardCandidate[]>([]);
  protected readonly activeIdeaId = signal<string | null>(null);
  protected readonly activeAwardIdea = signal<AwardCandidate | null>(null);
  protected readonly isAdmin = signal(false);
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly isAwarding = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly decisionError = signal<string | null>(null);
  protected readonly awardError = signal<string | null>(null);

  protected readonly decisionForm = new FormGroup({
    decision: new FormControl<AdjudicationDecision>('advance', { nonNullable: true }),
    note: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(500)],
    }),
  });
  protected readonly awardForm = new FormGroup({
    title: new FormControl('Community Innovation Award', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    type: new FormControl('grant', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    citation: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(2000)],
    }),
    isPublic: new FormControl(false, { nonNullable: true }),
  });

  ngOnInit(): void {
    void this.loadDashboard();
  }

  protected async loadDashboard(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      const user = await this.authService.getCurrentUser();
      if (!user) {
        throw new Error('You must be signed in to view adjudication.');
      }
      const access = await this.userDataService.getEvaluatorAccess(user.uid);
      if (access.role !== 'adjudicator' && access.role !== 'admin') {
        throw new Error('Adjudicator access is required to view this worklist.');
      }
      this.isAdmin.set(access.role === 'admin');
      this.ideas.set(await this.userDataService.getAdjudicationWorklist(user.uid));
      this.approvedIdeas.set(
        access.role === 'admin'
          ? await this.userDataService.getApprovedIdeasForAward(user.uid)
          : [],
      );
    } catch (error: unknown) {
      const message = this.messageFrom(error, 'We could not load the adjudication worklist.');
      this.loadError.set(message);
      this.toastService.error(message);
    } finally {
      this.isLoading.set(false);
    }
  }

  protected selectIdea(ideaId: string): void {
    this.activeIdeaId.set(this.activeIdeaId() === ideaId ? null : ideaId);
    this.decisionError.set(null);
    this.decisionForm.reset({ decision: 'advance', note: '' });
  }

  protected async recordDecision(idea: RankedAdjudicationIdea): Promise<void> {
    const note = this.decisionForm.controls.note.value.trim();
    if (this.isSaving() || this.decisionForm.invalid || !note) {
      this.decisionForm.markAllAsTouched();
      this.decisionError.set('Write a note of no more than 500 characters for this decision.');
      return;
    }

    this.isSaving.set(true);
    this.decisionError.set(null);
    try {
      const decision = this.decisionForm.controls.decision.value;
      await this.userDataService.recordAdjudication(idea.ideaId, decision, note);
      this.toastService.success('The adjudication decision was recorded.');
      this.activeIdeaId.set(null);
      await this.loadDashboard();
    } catch (error: unknown) {
      const message = this.messageFrom(error, 'We could not record the adjudication decision.');
      this.decisionError.set(message);
      this.toastService.error(message);
    } finally {
      this.isSaving.set(false);
    }
  }

  protected startAward(idea: AwardCandidate): void {
    this.activeAwardIdea.set(idea);
    this.awardError.set(null);
    this.awardForm.reset({
      title: 'Community Innovation Award',
      type: 'grant',
      citation: '',
      isPublic: false,
    });
  }

  protected async createAward(): Promise<void> {
    const idea = this.activeAwardIdea();
    if (!idea || this.isAwarding() || this.awardForm.invalid) {
      this.awardForm.markAllAsTouched();
      this.awardError.set('Complete each required award field before saving.');
      return;
    }

    this.isAwarding.set(true);
    this.awardError.set(null);
    try {
      const { title, type, citation, isPublic } = this.awardForm.getRawValue();
      await this.userDataService.awardIdea({
        ideaId: idea.ideaId,
        title: title.trim(),
        type: type.trim(),
        citation: citation.trim(),
        isPublic,
      });
      this.toastService.success('The award was created and the idea marked as awarded.');
      this.activeAwardIdea.set(null);
      await this.loadDashboard();
    } catch (error: unknown) {
      const message = this.messageFrom(error, 'We could not create the award.');
      this.awardError.set(message);
      this.toastService.error(message);
    } finally {
      this.isAwarding.set(false);
    }
  }

  protected formatScore(score: number | null): string {
    return score === null ? '—' : score.toFixed(2);
  }

  private messageFrom(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }
}
