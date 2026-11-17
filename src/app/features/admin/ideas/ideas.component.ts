import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { IdeaLoaderComponent } from '../../../shared/components/idea-loader/idea-loader.component';
import {
  AdminIdeaAssignment,
  AdminIdeaRow,
  AdminIdeaService,
  EvaluatorOption,
} from '../../../core/services/admin-idea.service';
import { ToastService } from '../../../core/services/toast.service';
import {
  allowedNextStatuses,
  IDEA_STATUSES,
  NOTE_REQUIRED,
  STAGES,
  type IdeaStatus,
} from '../../../shared/workflow/idea-workflow';

@Component({
  selector: 'app-admin-ideas',
  imports: [IdeaLoaderComponent, ReactiveFormsModule],
  templateUrl: './ideas.component.html',
  styleUrl: './ideas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IdeasComponent implements OnInit {
  private readonly service = inject(AdminIdeaService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly stages = STAGES;
  readonly statusOptions = IDEA_STATUSES.map(value => ({ value, label: STAGES[value].label }));

  readonly loading = this.service.loading;
  readonly error = this.service.error;
  readonly evaluators = signal<EvaluatorOption[]>([]);
  readonly stageNames = signal<Record<string, string>>({});

  readonly search = signal('');
  readonly statusFilter = signal<'all' | IdeaStatus>('all');
  readonly pendingStatusChange = signal<{ idea: AdminIdeaRow; status: IdeaStatus } | null>(null);
  readonly statusNoteControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(500), Validators.pattern(/\S/)],
  });
  private readonly statusNoteTextarea = viewChild<ElementRef<HTMLTextAreaElement>>('statusNoteTextarea');
  private readonly focusStatusNote = effect(() => {
    if (this.pendingStatusChange()) {
      this.statusNoteTextarea()?.nativeElement.focus();
    }
  });
  private statusSelectToRestore: HTMLSelectElement | null = null;

  readonly counts = computed(() => {
    const all = this.service.ideas();
    const count = (status: IdeaStatus) => all.filter(idea => idea.status === status).length;
    return {
      total: all.length,
      submitted: count('submitted'),
      humanReview: count('human_review'),
      approved: count('approved'),
      awarded: count('awarded'),
    };
  });

  readonly filteredIdeas = computed(() => {
    const query = this.search().trim().toLowerCase();
    const status = this.statusFilter();

    return this.service.ideas().filter(idea => {
      const matchesStatus = status === 'all' || idea.status === status;
      const matchesQuery =
        !query ||
        idea.title.toLowerCase().includes(query) ||
        idea.ownerName.toLowerCase().includes(query) ||
        idea.category.toLowerCase().includes(query) ||
        idea.id.toLowerCase().includes(query);
      return matchesStatus && matchesQuery;
    });
  });

  /** ideaId -> assignments, rebuilt whenever assignments change. */
  private readonly assignmentsByIdea = computed(() => {
    const map = new Map<string, AdminIdeaAssignment[]>();
    for (const assignment of this.service.assignments()) {
      const list = map.get(assignment.ideaId) ?? [];
      list.push(assignment);
      map.set(assignment.ideaId, list);
    }
    return map;
  });

  ngOnInit(): void {
    this.service.watch(this.destroyRef);
    void this.loadLookups();
  }

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement | null)?.value ?? '');
  }

  onStatusFilter(event: Event): void {
    this.statusFilter.set(((event.target as HTMLSelectElement | null)?.value ?? 'all') as 'all' | IdeaStatus);
  }

  async onStatusChange(event: Event, idea: AdminIdeaRow): Promise<void> {
    const select = event.target as HTMLSelectElement | null;
    const status = select?.value as IdeaStatus | undefined;
    if (!status || status === idea.status) {
      return;
    }

    if (!IDEA_STATUSES.includes(status)) {
      return;
    }

    if (NOTE_REQUIRED.includes(status)) {
      if (select) {
        select.value = idea.status;
        this.statusSelectToRestore = select;
      }
      this.statusNoteControl.setValue('');
      this.pendingStatusChange.set({ idea, status });
      return;
    }

    try {
      await this.service.setStatus(idea, status);
      this.toast.success(`"${idea.title}" is now ${this.statusLabel(status).toLowerCase()}.`);
    } catch (error) {
      this.toast.error(this.messageFrom(error, 'Unable to update the idea status.'));
    } finally {
      if (select) select.value = idea.status;
    }
  }

  async confirmStatusChange(): Promise<void> {
    const pending = this.pendingStatusChange();
    const note = this.statusNoteControl.value.trim();
    if (!pending || this.statusNoteControl.invalid || !note) {
      this.statusNoteControl.markAsTouched();
      return;
    }

    let updated = false;
    try {
      await this.service.setStatus(pending.idea, pending.status, note);
      this.toast.success(
        `"${pending.idea.title}" is now ${this.statusLabel(pending.status).toLowerCase()}.`,
      );
      this.pendingStatusChange.set(null);
      updated = true;
    } catch (error) {
      this.toast.error(this.messageFrom(error, 'Unable to update the idea status.'));
    } finally {
      if (updated) this.restoreStatusFocus();
    }
  }

  cancelStatusChange(): void {
    this.pendingStatusChange.set(null);
    this.restoreStatusFocus();
  }

  statusOptionsFor(idea: AdminIdeaRow): Array<{ value: IdeaStatus; label: string }> {
    if (idea.status === 'adjudication') {
      return [{ value: idea.status, label: STAGES[idea.status].label }];
    }
    return [idea.status, ...allowedNextStatuses(idea.status, 'admin')]
      .filter(status => status !== 'awarded')
      .map(status => ({ value: status, label: STAGES[status].label }));
  }

  async onAssign(event: Event, idea: AdminIdeaRow): Promise<void> {
    const select = event.target as HTMLSelectElement | null;
    const evaluator = this.evaluators().find(item => item.id === select?.value);
    if (select) {
      select.value = ''; // back to the placeholder
    }
    if (!evaluator) {
      return;
    }

    if (this.assignmentsFor(idea).some(assignment => assignment.evaluatorUid === evaluator.id)) {
      this.toast.error(`${evaluator.name} is already assigned to this idea.`);
      return;
    }

    try {
      await this.service.assignEvaluator(idea, evaluator);
      this.toast.success(`Assigned ${evaluator.name}.`);
    } catch (error) {
      this.toast.error(this.messageFrom(error, 'Unable to assign the evaluator.'));
    }
  }

  async onRemoveAssignment(assignment: AdminIdeaAssignment): Promise<void> {
    try {
      await this.service.removeAssignment(assignment.id);
      this.toast.success('Assignment removed.');
    } catch (error) {
      this.toast.error(this.messageFrom(error, 'Unable to remove the assignment.'));
    }
  }

  // ---- Helpers used by the template ----

  assignmentsFor(idea: AdminIdeaRow): AdminIdeaAssignment[] {
    return this.assignmentsByIdea().get(idea.id) ?? [];
  }

  evaluatorName(uid: string): string {
    return this.evaluators().find(item => item.id === uid)?.name ?? 'Evaluator';
  }

  stageLabel(idea: AdminIdeaRow): string {
    if (!idea.stageId) {
      return 'Not started';
    }
    return this.stageNames()[idea.stageId] ?? idea.stageId;
  }

  statusLabel(status: IdeaStatus): string {
    return STAGES[status].label;
  }

  statusClass(status: IdeaStatus): string {
    return `idea-status-${STAGES[status].health}`;
  }

  formatScore(score: number | null): string {
    return score === null ? '—' : String(score);
  }

  formatDate(date: Date | null): string {
    return date ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(date) : '—';
  }

  private async loadLookups(): Promise<void> {
    try {
      this.evaluators.set(await this.service.loadEvaluators());
    } catch (error) {
      console.error('[IdeasComponent] could not load evaluators', error);
    }

    try {
      this.stageNames.set(await this.service.loadStageNames());
    } catch (error) {
      console.error('[IdeasComponent] could not load stages', error);
    }
  }

  private messageFrom(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  private restoreStatusFocus(): void {
    const select = this.statusSelectToRestore;
    this.statusSelectToRestore = null;
    queueMicrotask(() => select?.focus());
  }
}