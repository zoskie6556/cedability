import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Auth, user } from '@angular/fire/auth';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, map } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import { UserDataService } from '../../../core/services/user-data.service';
import type { IdeaAttachment } from '../../../shared/models/idea-attachment.model';
import {
  MAX_IDEA_ATTACHMENT_BYTES,
  MAX_IDEA_ATTACHMENTS,
} from '../../../shared/models/idea-attachment.model';
import { IdeaLoaderComponent } from '../../../shared/components/idea-loader/idea-loader.component';
import {
  attachmentAcceptTypes,
  attachmentErrorFor,
  attachmentTypeFor,
} from '../../../shared/models/idea-attachment-policy';
import { IdeaDraftService } from './idea-draft.service';
import { IdeaFieldComponent } from './idea-field/idea-field.component';
import {
  LONG_MAX,
  SHORT_MAX,
  STEPS,
  TITLE_MAX,
  buildIdeaForm,
  completenessOf,
  newCostGroup,
  newMilestoneGroup,
  sumCosts,
  toIdeaFormValue,
  toNewIdea,
} from './idea-form';

const LANGUAGES = [
  { label: 'English', tag: 'en-ZA' },
  { label: 'Setswana (may not work on every device)', tag: 'tn-ZA' },
  { label: 'Afrikaans', tag: 'af-ZA' },
  { label: 'isiZulu', tag: 'zu-ZA' },
] as const;

const CURRENCIES = ['BWP', 'USD', 'ZAR'] as const;

interface SelectedAttachment {
  file: File;
  uploaded: IdeaAttachment | null;
}

/**
 * The idea submission page: a 6-step, accessible form.
 * Structure and validation live in idea-form.ts; each input is an <app-idea-field>.
 * This class only handles WHICH step we are on, saving drafts, and sending the idea.
 */
@Component({
  selector: 'app-idea',
  imports: [ReactiveFormsModule, DecimalPipe, RouterLink, IdeaFieldComponent, IdeaLoaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './idea.component.html',
  styleUrl: './idea.component.scss',
})
export class IdeaComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(Auth);
  private readonly userData = inject(UserDataService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly drafts = inject(IdeaDraftService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly form = buildIdeaForm(this.fb);
  protected readonly costs = this.form.controls.financing.controls.costs;
  protected readonly milestones = this.form.controls.milestones;

  protected readonly steps = STEPS;
  protected readonly languages = LANGUAGES;
  protected readonly currencies = CURRENCIES;
  protected readonly limits = { title: TITLE_MAX, short: SHORT_MAX, long: LONG_MAX };

  protected readonly step = signal(0);
  protected readonly furthest = signal(0);
  protected readonly language = signal<string>(LANGUAGES[0].tag);
  protected readonly submitting = signal(false);
  protected readonly selectedAttachments = signal<SelectedAttachment[]>([]);
  protected readonly existingAttachments = signal<IdeaAttachment[]>([]);
  protected readonly attachmentError = signal<string | null>(null);
  protected readonly isDraggingFiles = signal(false);
  protected readonly removingAttachment = signal(false);
  protected readonly attachmentAccept = attachmentAcceptTypes();
  protected readonly attachmentLimits = {
    count: MAX_IDEA_ATTACHMENTS,
    sizeMb: MAX_IDEA_ATTACHMENT_BYTES / (1024 * 1024),
  };
  protected readonly draftRestored = signal(false);
  protected readonly loadingIdea = signal(
    this.route.snapshot.paramMap.get('ideaId') !== null,
  );
  protected readonly ideaLoadError = signal<string | null>(null);
  protected readonly submissionError = signal<string | null>(null);
  protected readonly loadedVersion = signal<number | null>(null);

  private readonly stepHeading = viewChild<ElementRef<HTMLElement>>('stepHeading');
  private readonly authUser = toSignal(user(this.auth), { initialValue: null });
  private readonly routeIdeaId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('ideaId'))),
    { initialValue: this.route.snapshot.paramMap.get('ideaId') },
  );
  // Form controls are not signals, so we mirror the form's value into one. Everything
  // below (meter, totals, step ticks) is `computed` from it and updates by itself.
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  protected readonly currentStep = computed(() => STEPS[this.step()]);
  protected readonly isResubmission = computed(() => this.routeIdeaId() !== null);
  protected readonly pageHeading = computed(() =>
    this.isResubmission() ? 'Update and resubmit your idea' : 'Submit your idea',
  );
  protected readonly pageLead = computed(() =>
    this.isResubmission()
      ? 'Review the evaluator feedback, update the prefilled plan, and resubmit it for screening.'
      : 'Answer in your own words. Short, honest answers are fine. You can stop at any time: we keep your answers on this device so you can come back.',
  );
  protected readonly isLastStep = computed(() => this.step() === STEPS.length - 1);
  protected readonly totalFunding = computed(() =>
    sumCosts(this.formValue().financing?.costs ?? []),
  );
  protected readonly completeness = computed(() => {
    this.formValue(); // re-run whenever any answer changes
    const { filled, total } = completenessOf(this.form);
    return total === 0 ? 0 : Math.round((filled / total) * 100);
  });
  protected readonly stepComplete = computed(() => {
    this.formValue();
    return STEPS.map((s) => this.form.controls[s.key].valid);
  });

  private loadedRouteKey = '';
  private submitted = false;

  constructor() {
    effect(() => {
      const uid = this.authUser()?.uid;
      const ideaId = this.routeIdeaId();
      if (!uid) return;
      const routeKey = `${uid}:${ideaId ?? 'new'}`;
      if (routeKey === this.loadedRouteKey) return;
      this.loadedRouteKey = routeKey;
      if (ideaId) {
        untracked(() => void this.loadIdeaForResubmission(uid, ideaId));
      } else {
        this.loadingIdea.set(false);
        this.ideaLoadError.set(null);
        untracked(() => this.restoreDraft(uid));
      }
    });

    // Autosave 1.5 s after the user stops typing. The consent tick is never saved.
    this.form.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed())
      .subscribe(() => {
        const uid = this.authUser()?.uid;
        if (!uid || this.submitted || this.routeIdeaId() !== null) return;
        const raw = this.form.getRawValue();
        this.drafts.save(
          uid,
          {
            basics: raw.basics,
            market: raw.market,
            feasibility: raw.feasibility,
            financing: raw.financing,
            milestones: raw.milestones,
          },
          Date.now(),
        );
      });
  }

  // ---- navigation ---------------------------------------------------------

  protected goTo(index: number): void {
    if (index > this.furthest()) return; // cannot skip ahead past unfinished steps
    this.step.set(index);
    this.focusHeading();
  }

  protected back(): void {
    if (this.step() === 0) return;
    this.step.update((n) => n - 1);
    this.focusHeading();
  }

  protected next(): void {
    const group = this.form.controls[this.currentStep().key];
    if (group.invalid) {
      group.markAllAsTouched();
      this.toast.info('Please fix the highlighted answers before continuing.');
      this.focusFirstError();
      return;
    }
    this.step.update((n) => n + 1);
    this.furthest.update((f) => Math.max(f, this.step()));
    this.focusHeading();
  }

  // ---- repeating rows -------------------------------------------------------

  protected addCost(): void {
    this.costs.push(newCostGroup(this.fb));
  }

  protected removeCost(index: number): void {
    if (this.costs.length > 1) this.costs.removeAt(index); // rules need at least 1 cost
  }

  protected addMilestone(): void {
    this.milestones.push(newMilestoneGroup(this.fb));
  }

  protected removeMilestone(index: number): void {
    if (this.milestones.length > 1) this.milestones.removeAt(index); // rules need at least 1
  }

  protected setLanguage(event: Event): void {
    this.language.set((event.target as HTMLSelectElement).value);
  }

  protected onAttachmentSelection(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addAttachments(Array.from(input.files ?? []));
    input.value = '';
  }

  protected onAttachmentDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingFiles.set(true);
  }

  protected onAttachmentDragLeave(event: DragEvent): void {
    const target = event.currentTarget;
    const related = event.relatedTarget;
    if (!(target instanceof Node) || !(related instanceof Node) || !target.contains(related)) {
      this.isDraggingFiles.set(false);
    }
  }

  protected onAttachmentDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingFiles.set(false);
    this.addAttachments(Array.from(event.dataTransfer?.files ?? []));
  }

  protected async removeSelectedAttachment(index: number): Promise<void> {
    if (this.removingAttachment()) return;
    const selected = this.selectedAttachments()[index];
    if (!selected) return;

    this.removingAttachment.set(true);
    try {
      if (selected.uploaded) {
        await this.userData.removeIdeaAttachments([selected.uploaded]);
      }
      this.selectedAttachments.update((items) => items.filter((_, itemIndex) => itemIndex !== index));
      this.attachmentError.set(null);
    } catch (error: unknown) {
      console.error('Could not remove the selected attachment', error);
      this.toast.error('We could not remove that file. Please try again.');
    } finally {
      this.removingAttachment.set(false);
    }
  }

  protected attachmentCategory(file: File): string {
    return attachmentTypeFor(file.name)?.category ?? 'File';
  }

  protected attachmentSize(file: File): string {
    return file.size < 1024 * 1024
      ? `${Math.max(1, Math.round(file.size / 1024))} KB`
      : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ---- drafts ---------------------------------------------------------------

  protected startFresh(): void {
    if (this.isResubmission()) return;
    const uid = this.authUser()?.uid;
    if (uid) this.drafts.clear(uid);
    this.resizeRows(1, 1);
    this.form.reset();
    this.step.set(0);
    this.furthest.set(0);
    this.draftRestored.set(false);
    this.selectedAttachments.set([]);
    this.existingAttachments.set([]);
    this.attachmentError.set(null);
  }

  private restoreDraft(uid: string): void {
    const draft = this.drafts.load(uid);
    if (!draft) return;
    try {
      const financing = draft.value['financing'] as { costs?: unknown } | undefined;
      const milestones = draft.value['milestones'];
      this.resizeRows(
        Array.isArray(financing?.costs) ? financing.costs.length : 1,
        Array.isArray(milestones) ? milestones.length : 1,
      );
      // patchValue ignores unknown keys; the try/catch covers a corrupted draft.
      this.form.patchValue(draft.value as unknown as Parameters<typeof this.form.patchValue>[0]);
      this.furthest.set(STEPS.length - 2); // let them review every step; validity is still enforced
      this.draftRestored.set(true);
    } catch (error) {
      console.error('Could not restore the saved draft', error);
      this.drafts.clear(uid);
    }
  }

  private async loadIdeaForResubmission(uid: string, ideaId: string): Promise<void> {
    this.loadingIdea.set(true);
    this.ideaLoadError.set(null);
    this.loadedVersion.set(null);
    try {
      const idea = await this.userData.getIdeaById(ideaId);
      if (!idea || idea.ownerId !== uid || idea.status !== 'needs_amendment') {
        throw new Error('This idea is not available for resubmission.');
      }

      this.resizeRows(idea.financingPlan.costs.length, idea.milestones.length);
      this.form.patchValue(toIdeaFormValue(idea));
      this.existingAttachments.set(idea.attachments);
      this.loadedVersion.set(idea.version);
      this.furthest.set(STEPS.length - 1);
    } catch (error: unknown) {
      console.error('Could not load idea for resubmission', error);
      const message = 'We could not load this idea for resubmission. Return to tracking and try again.';
      this.ideaLoadError.set(message);
      this.toast.error(message);
    } finally {
      this.loadingIdea.set(false);
    }
  }

  private resizeRows(costRows: number, milestoneRows: number): void {
    while (this.costs.length < Math.max(1, costRows)) this.costs.push(newCostGroup(this.fb));
    while (this.costs.length > Math.max(1, costRows)) this.costs.removeAt(this.costs.length - 1);
    while (this.milestones.length < Math.max(1, milestoneRows)) {
      this.milestones.push(newMilestoneGroup(this.fb));
    }
    while (this.milestones.length > Math.max(1, milestoneRows)) {
      this.milestones.removeAt(this.milestones.length - 1);
    }
  }

  private addAttachments(files: readonly File[]): void {
    const next = [...this.selectedAttachments()];
    const errors: string[] = [];
    for (const file of files) {
      const error = attachmentErrorFor(file);
      if (error) {
        errors.push(`${file.name}: ${error}`);
        continue;
      }
      if (this.existingAttachments().length + next.length >= MAX_IDEA_ATTACHMENTS) {
        errors.push(`You can attach up to ${MAX_IDEA_ATTACHMENTS} files.`);
        break;
      }
      if (next.some((item) =>
        item.file.name === file.name &&
        item.file.size === file.size &&
        item.file.lastModified === file.lastModified,
      )) {
        continue;
      }
      next.push({ file, uploaded: null });
    }

    this.selectedAttachments.set(next);
    this.attachmentError.set(errors.length ? errors.join(' ') : null);
  }

  private async uploadPendingAttachments(
    ideaId: string,
    ownerId: string,
    ownerName: string,
  ): Promise<void> {
    const pending = this.selectedAttachments().filter((item) => item.uploaded === null);
    if (pending.length === 0) return;

    const uploaded = await this.userData.uploadIdeaAttachments(
      ownerId,
      ownerName,
      ideaId,
      pending.map((item) => item.file),
    );
    const uploadedByFile = new Map(
      pending.map((item, index) => [item.file, uploaded[index]] as const),
    );
    this.selectedAttachments.update((items) =>
      items.map((item) =>
        item.uploaded ? item : { ...item, uploaded: uploadedByFile.get(item.file) ?? null },
      ),
    );
  }

  // ---- submit ---------------------------------------------------------------

  protected async submit(): Promise<void> {
    if (this.submitting()) return;
    this.submissionError.set(null);
    // Pressing Enter in a field must never send the idea early.
    if (!this.isLastStep()) {
      this.next();
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const firstBad = STEPS.findIndex((s) => this.form.controls[s.key].invalid);
      if (firstBad >= 0) {
        this.step.set(firstBad);
        this.furthest.update((f) => Math.max(f, firstBad));
      }
      this.toast.error('Some answers are missing. We opened the first step that needs attention.');
      this.focusFirstError();
      return;
    }

    const authUser = this.authUser();
    if (!authUser) {
      this.toast.error('Please sign in again to send your idea.');
      return;
    }

    this.submitting.set(true);
    try {
      const profile = await this.userData.getOrCreateUser(authUser);
      const ownerName = profile.fullName.trim() || 'Applicant';
      const ideaId = this.routeIdeaId();
      if (ideaId) {
        const version = this.loadedVersion();
        if (version === null) {
          throw new Error('The idea version is unavailable. Reload the form before resubmitting.');
        }
        await this.uploadPendingAttachments(ideaId, authUser.uid, ownerName);
        const attachments = [
          ...this.existingAttachments(),
          ...this.selectedAttachments().flatMap((item) => item.uploaded ? [item.uploaded] : []),
        ];
        const idea = toNewIdea(this.form, authUser.uid, ownerName, attachments);
        await this.userData.resubmitIdea(ideaId, version, idea);
      } else {
        const idea = toNewIdea(this.form, authUser.uid, ownerName);
        const files = this.selectedAttachments().map((item) => item.file);
        if (files.length > 0) {
          await this.userData.createIdea(idea, files);
        } else {
          await this.userData.createIdea(idea);
        }
      }
      this.submitted = true;
      if (!ideaId) this.drafts.clear(authUser.uid);
      this.toast.success(ideaId ? 'Your updated idea was resubmitted.' : 'Your idea was submitted.');
      await this.router.navigate(['/tracking/status']);
    } catch (error) {
      console.error('Idea submission failed', error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'We could not submit your idea. Your answers are saved, please try again.';
      this.submissionError.set(message);
      this.toast.error(message);
    } finally {
      this.submitting.set(false);
    }
  }

  // ---- focus management (WCAG) ---------------------------------------------

  /** After changing step, move keyboard and screen-reader focus to the new heading. */
  private focusHeading(): void {
    afterNextRender(() => this.stepHeading()?.nativeElement.focus(), { injector: this.injector });
  }

  private focusFirstError(): void {
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      { injector: this.injector },
    );
  }

  saveDraft(){
    console.log("Draft Saved");
    
  }
}
