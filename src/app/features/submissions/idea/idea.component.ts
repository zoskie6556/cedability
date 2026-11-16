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
import { Router } from '@angular/router';
import { debounceTime } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import { UserDataService } from '../../../core/services/user-data.service';
import { IdeaLoaderComponent } from '../../../shared/components/idea-loader/idea-loader.component';
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
  toNewIdea,
} from './idea-form';

const LANGUAGES = [
  { label: 'English', tag: 'en-ZA' },
  { label: 'Setswana (may not work on every device)', tag: 'tn-ZA' },
  { label: 'Afrikaans', tag: 'af-ZA' },
  { label: 'isiZulu', tag: 'zu-ZA' },
] as const;

const CURRENCIES = ['BWP', 'USD', 'ZAR'] as const;

/**
 * The idea submission page: a 6-step, accessible form.
 * Structure and validation live in idea-form.ts; each input is an <app-idea-field>.
 * This class only handles WHICH step we are on, saving drafts, and sending the idea.
 */
@Component({
  selector: 'app-idea',
  imports: [ReactiveFormsModule, DecimalPipe, IdeaFieldComponent, IdeaLoaderComponent],
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
  protected readonly draftRestored = signal(false);

  private readonly stepHeading = viewChild<ElementRef<HTMLElement>>('stepHeading');
  private readonly authUser = toSignal(user(this.auth), { initialValue: null });
  // Form controls are not signals, so we mirror the form's value into one. Everything
  // below (meter, totals, step ticks) is `computed` from it and updates by itself.
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  protected readonly currentStep = computed(() => STEPS[this.step()]);
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

  private restoredFor: string | null = null;
  private submitted = false;

  constructor() {
    // Restore an unfinished draft once we know who the user is.
    effect(() => {
      const uid = this.authUser()?.uid;
      if (!uid || uid === this.restoredFor) return;
      this.restoredFor = uid;
      untracked(() => this.restoreDraft(uid));
    });

    // Autosave 1.5 s after the user stops typing. The consent tick is never saved.
    this.form.valueChanges
      .pipe(debounceTime(1500), takeUntilDestroyed())
      .subscribe(() => {
        const uid = this.authUser()?.uid;
        if (!uid || this.submitted) return;
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

  // ---- drafts ---------------------------------------------------------------

  protected startFresh(): void {
    const uid = this.authUser()?.uid;
    if (uid) this.drafts.clear(uid);
    this.resizeRows(1, 1);
    this.form.reset();
    this.step.set(0);
    this.furthest.set(0);
    this.draftRestored.set(false);
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

  // ---- submit ---------------------------------------------------------------

  protected async submit(): Promise<void> {
    if (this.submitting()) return;
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
      await this.userData.createIdea(toNewIdea(this.form, authUser.uid, ownerName));
      this.submitted = true;
      this.drafts.clear(authUser.uid);
      this.toast.success('Your idea was submitted.');
      await this.router.navigate(['/tracking/status']);
    } catch (error) {
      console.error('Idea submission failed', error);
      this.toast.error('We could not submit your idea. Your answers are saved, please try again.');
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
}
