import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserDataService } from '../../../core/services/user-data.service';
import type { IdeaQuestion } from '../../../shared/models/idea-evaluation.model';
import type { Idea } from '../../../shared/models/idea.model';
import type { Profile, UserType } from '../../../shared/models/profile.model';
import type { User } from '../../../shared/models/user.model';
import { STAGES } from '../../../shared/workflow/idea-workflow';

@Component({
  selector: 'app-profile',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss', './profile-onboarding.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);
  private readonly userDataService = inject(UserDataService);

  protected readonly user = signal<User | null>(null);
  protected readonly ideas = signal<Idea[]>([]);
  protected readonly stages = STAGES;
  protected readonly ideaQuestions = signal<Record<string, IdeaQuestion[] | undefined>>({});
  protected readonly responseDrafts = signal<Partial<Record<string, string>>>({});
  protected readonly respondingToQuestion = signal<string | null>(null);
  protected readonly hasSignedInUser = signal(false);
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly isEditingProfile = signal(false);
  protected readonly isLoggingOut = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly ideasError = signal<string | null>(null);
  protected readonly profileSaveError = signal<string | null>(null);
  protected readonly profileSaveMessage = signal<string | null>(null);
  protected readonly logoutError = signal<string | null>(null);
  protected readonly deletionConfirmed = signal(false);
  protected readonly deletionUnavailableMessage = signal<string | null>(null);
  protected readonly deletionStatusMessage = signal<string | null>(null);
  protected readonly onboardingStepLabels = [
    'Your account type',
    'Your profession',
    'Your purpose',
    'Your location',
    'Your goals',
    'Optional details',
  ] as const;
  protected readonly activeOnboardingStep = signal(0);
  protected readonly onboardingCardPhase = signal<'entering' | 'idle' | 'exiting'>('entering');
  protected readonly showDashboardNotice = signal(false);

  @ViewChild('stepHeading') private stepHeading?: ElementRef<HTMLHeadingElement>;
  @ViewChild('editProfileButton') private editProfileButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('editProfileHeading') private editProfileHeading?: ElementRef<HTMLHeadingElement>;
  @ViewChild('deleteAccountButton') private deleteAccountButton?: ElementRef<HTMLButtonElement>;
  private deleteAccountDialogElement?: ElementRef<HTMLDialogElement>;
  private pendingDeleteAccountDialog = false;
  @ViewChild('deleteAccountDialog')
  set deleteAccountDialog(element: ElementRef<HTMLDialogElement> | undefined) {
    this.deleteAccountDialogElement = element;
    this.openPendingDeleteAccountDialog();
  }
  private pendingOnboardingStep: number | null = null;

  protected readonly form = this.formBuilder.nonNullable.group({
    userType: this.formBuilder.nonNullable.control<UserType>('individual', Validators.required),
    profession: ['', [Validators.required, Validators.pattern(/\S/)]],
    purpose: ['', [Validators.required, Validators.pattern(/\S/)]],
    plannedLocation: ['', [Validators.required, Validators.pattern(/\S/)]],
    goals: ['', [Validators.required, Validators.pattern(/\S/)]],
    phoneNumber: [''],
    plotNumber: [''],
    boxNumber: [''],
    addressLocation: [''],
  });

  private userID: any | undefined;

  ngOnInit(): void {
    this.activatedRoute.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.pendingDeleteAccountDialog = params.get('openDeleteAccount') === 'true';
        this.openPendingDeleteAccountDialog();
      });
    void this.loadProfile();
  }
  protected async loadProfile(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.ideasError.set(null);

    try {
      const authUser = await this.authService.getCurrentUser();
      if (!authUser) {
        this.hasSignedInUser.set(false);
        return;
      }

      this.hasSignedInUser.set(true);
      const user = await this.userDataService.getOrCreateUser(authUser);
      
      this.user.set(user);
      this.populateForm(user.profile);

      if (user.profile.onboardingCompleted) {
        await this.loadIdeas(user.uid);
        this.userID = user.uid;
      }
    } catch {
      this.loadError.set('We could not load your profile. Check your connection and try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  protected async saveOnboarding(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const user = this.user();
    if (!user || this.isSaving()) {
      return;
    }

    this.isSaving.set(true);
    this.loadError.set(null);

    try {
      const values = this.form.getRawValue();
      const profile: Profile = {
        ...user.profile,
        userType: values.userType,
        profession: values.profession.trim(),
        purpose: values.purpose.trim(),
        plannedLocation: values.plannedLocation.trim(),
        goals: values.goals.trim(),
        contacts: {
          phoneNumber: values.phoneNumber.trim(),
        },
        address: {
          plotNumber: values.plotNumber.trim(),
          boxNumber: values.boxNumber.trim(),
          location: values.addressLocation.trim(),
        },
        onboardingCompleted: true,
      };

      await this.userDataService.saveProfile(user.uid, profile);
      this.user.set({ ...user, profile });
      this.toastService.success('Your profile is ready. You can now submit ideas.');
      await this.loadIdeas(user.uid);
    } catch {
      this.loadError.set('We could not save your profile. Your answers are still here; please try again.');
      this.toastService.error('We could not save your profile. Please try again.');
    } finally {
      this.isSaving.set(false);
    }
  }

  protected startEditingProfile(): void {
    const user = this.user();
    if (!user || this.isSaving()) {
      return;
    }

    this.populateForm(user.profile);
    this.profileSaveError.set(null);
    this.profileSaveMessage.set(null);
    this.isEditingProfile.set(true);
    queueMicrotask(() => this.editProfileHeading?.nativeElement.focus());
  }

  protected cancelProfileEdit(): void {
    const user = this.user();
    if (!user || this.isSaving()) {
      return;
    }

    this.populateForm(user.profile);
    this.profileSaveError.set(null);
    this.isEditingProfile.set(false);
    queueMicrotask(() => this.editProfileButton?.nativeElement.focus());
  }

  protected async saveProfileChanges(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.profileSaveError.set('Please complete all required fields before saving.');
      return;
    }

    const user = this.user();
    if (!user || this.isSaving()) {
      return;
    }

    this.isSaving.set(true);
    this.profileSaveError.set(null);
    this.profileSaveMessage.set(null);

    try {
      const values = this.form.getRawValue();
      const profile: Profile = {
        ...user.profile,
        userType: values.userType,
        profession: values.profession.trim(),
        purpose: values.purpose.trim(),
        plannedLocation: values.plannedLocation.trim(),
        goals: values.goals.trim(),
        contacts: {
          ...user.profile.contacts,
          phoneNumber: values.phoneNumber.trim(),
        },
        address: {
          ...user.profile.address,
          plotNumber: values.plotNumber.trim(),
          boxNumber: values.boxNumber.trim(),
          location: values.addressLocation.trim(),
        },
      };

      await this.userDataService.saveProfile(user.uid, profile);
      this.user.set({ ...user, profile });
      this.populateForm(profile);
      this.isEditingProfile.set(false);
      this.profileSaveMessage.set('Your profile changes have been saved.');
      this.toastService.success('Your profile changes have been saved.');
      queueMicrotask(() => this.editProfileButton?.nativeElement.focus());
    } catch {
      const message = 'We could not save your profile changes. Please try again.';
      this.profileSaveError.set(message);
      this.toastService.error(message);
    } finally {
      this.isSaving.set(false);
    }
  }

  protected async logOut(): Promise<void> {
    if (this.isLoggingOut()) {
      return;
    }

    this.isLoggingOut.set(true);
    this.logoutError.set(null);
    try {
      await this.authService.signOut();
    } catch {
      const message = 'We could not log you out. Please try again.';
      this.logoutError.set(message);
      this.toastService.error(message);
      this.isLoggingOut.set(false);
      return;
    }

    this.user.set(null);
    this.hasSignedInUser.set(false);
    this.ideas.set([]);
    this.ideaQuestions.set({});
    this.responseDrafts.set({});
    this.isEditingProfile.set(false);
    this.isLoggingOut.set(false);

    try {
      const navigated = await this.router.navigateByUrl('/account/user/login');
      if (!navigated) {
        throw new Error('Login navigation was cancelled.');
      }
    } catch {
      const message = 'You are signed out. Use the login link to continue.';
      this.logoutError.set(message);
      this.toastService.error(message);
    }
  }

  protected openDeleteAccountDialog(): void {
    const dialog = this.deleteAccountDialogElement?.nativeElement;
    if (!dialog || dialog.open) {
      return;
    }

    this.deletionConfirmed.set(false);
    this.deletionUnavailableMessage.set(null);
    this.deletionStatusMessage.set(null);
    dialog.showModal();
  }

  protected setDeletionConfirmation(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.deletionConfirmed.set(event.target.checked);
      this.deletionUnavailableMessage.set(null);
    }
  }

  protected confirmDeletionIntent(): void {
    if (!this.deletionConfirmed()) {
      return;
    }

    const message =
      'Account deletion is unavailable until a data-retention policy is approved for evaluator activity, audit records, and any stored files. No data has been changed.';
    this.deletionUnavailableMessage.set(message);
    this.toastService.info(message);
  }

  protected cancelDeletion(): void {
    const dialog = this.deleteAccountDialogElement?.nativeElement;
    if (dialog?.open) {
      dialog.close();
    }

    const message = 'Account deletion cancelled. No changes were made.';
    this.deletionConfirmed.set(false);
    this.deletionUnavailableMessage.set(null);
    this.deletionStatusMessage.set(message);
    this.clearDeleteAccountQueryParameter();
    this.toastService.info(message);
    queueMicrotask(() => this.deleteAccountButton?.nativeElement.focus());
  }

  protected handleDeletionDialogCancel(event: Event): void {
    event.preventDefault();
    this.cancelDeletion();
  }

  private openPendingDeleteAccountDialog(): void {
    if (!this.pendingDeleteAccountDialog || !this.deleteAccountDialogElement) {
      return;
    }

    this.pendingDeleteAccountDialog = false;
    queueMicrotask(() => this.openDeleteAccountDialog());
  }

  private clearDeleteAccountQueryParameter(): void {
    if (!this.activatedRoute.snapshot.queryParamMap.has('openDeleteAccount')) {
      return;
    }

    void this.router
      .navigate([], {
        relativeTo: this.activatedRoute,
        queryParams: { openDeleteAccount: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      })
      .then((navigated) => {
        if (!navigated) {
          this.toastService.error('The account deletion dialog closed, but the page URL could not be updated.');
        }
      })
      .catch(() => {
        this.toastService.error('The account deletion dialog closed, but the page URL could not be updated.');
      });
  }

  protected continueOnboarding(): void {
    if (this.onboardingCardPhase() === 'exiting' || this.isSaving()) {
      return;
    }

    if (!this.validateCurrentOnboardingStep()) {
      return;
    }

    const currentStep = this.activeOnboardingStep();
    if (currentStep === this.onboardingStepLabels.length - 1) {
      void this.saveOnboarding();
      return;
    }

    this.transitionToOnboardingStep(currentStep + 1);
  }

  protected goBackOnboarding(): void {
    const currentStep = this.activeOnboardingStep();
    if (currentStep > 0 && this.onboardingCardPhase() !== 'exiting' && !this.isSaving()) {
      this.transitionToOnboardingStep(currentStep - 1);
    }
  }

  protected showDashboardUnavailableNotice(): void {
    this.showDashboardNotice.set(true);
  }

  protected handleOnboardingCardAnimationEnd(event: AnimationEvent): void {
    if (event.target !== event.currentTarget) {
      return;
    }

    const animationName = event.animationName;
    if (this.onboardingCardPhase() === 'exiting' && animationName.includes('card-exit')) {
      const nextStep = this.pendingOnboardingStep;
      if (nextStep === null) {
        return;
      }

      this.pendingOnboardingStep = null;
      this.activeOnboardingStep.set(nextStep);
      this.onboardingCardPhase.set('entering');
      queueMicrotask(() => this.stepHeading?.nativeElement.focus());
    } else if (
      this.onboardingCardPhase() === 'entering' &&
      animationName.includes('card-enter')
    ) {
      this.onboardingCardPhase.set('idle');
    }
  }

  protected setResponseDraft(questionId: string, event: Event): void {
    if (event.target instanceof HTMLTextAreaElement) {
      const value = event.target.value;
      this.responseDrafts.update((drafts) => ({ ...drafts, [questionId]: value }));
    }
  }

  protected async respondToQuestion(ideaId: string, questionId: string): Promise<void> {
    const user = this.user();
    const response = this.responseDrafts()[questionId]?.trim() ?? '';
    if (!user || !response || this.respondingToQuestion()) {
      return;
    }

    this.respondingToQuestion.set(questionId);
    try {
      await this.userDataService.respondToQuestion(ideaId, questionId, user.uid, response);
      const questions = await this.userDataService.getQuestionsForIdea(ideaId);
      this.ideaQuestions.update((current) => ({ ...current, [ideaId]: questions }));
      this.responseDrafts.update((drafts) => ({ ...drafts, [questionId]: '' }));
      this.toastService.success('Your response was sent to the evaluator.');
    } catch {
      this.ideasError.set('We could not send your response. Please try again.');
      this.toastService.error('We could not send your response. Please try again.');
    } finally {
      this.respondingToQuestion.set(null);
    }
  }

  // private async loadIdeas(uid: string): Promise<void> {
  //   this.userID = uid;
  //   console.log("Im clicked and the user is", this.userID);
    
  //   try {
  //     const ideas = await this.userDataService.getIdeasForUser(uid);
  //     this.ideas.set(ideas);
  //     const loadedQuestions: Record<string, IdeaQuestion[] | undefined> = {};
  //     await Promise.all(
  //       ideas.map(async (idea) => {
  //         loadedQuestions[idea.id] = await this.userDataService.getQuestionsForIdea(idea.id);
  //       }),
  //     );
  //     this.ideaQuestions.set(loadedQuestions);
  //   } catch {
  //     this.ideasError.set('Your profile loaded, but we could not load your ideas.');
  //   }
  // }
protected retryLoadIdeas(): void {
    const uid = this.user()?.uid ?? this.userID;
    console.log('[ProfileComponent] Retry clicked. Resolved UID:', uid);
    if (!uid) {
      this.ideasError.set('Unable to determine your user ID. Please refresh the page.');
      return;
    }
    void this.loadIdeas(uid);
  }

  private async loadIdeas(uid: string): Promise<void> {
    this.userID = uid;
    this.ideasError.set(null);
    console.log('[ProfileComponent] Starting loadIdeas for UID:', uid);

    try {
      const ideas = await this.userDataService.getIdeasForUser(uid);
      console.log('[ProfileComponent] Parsed ideas JSON:', JSON.stringify(ideas, null, 2));
      this.ideas.set(ideas);

      const loadedQuestions: Record<string, IdeaQuestion[] | undefined> = {};
      await Promise.all(
        ideas.map(async (idea) => {
          try {
            loadedQuestions[idea.id] = await this.userDataService.getQuestionsForIdea(idea.id);
          } catch (questionError) {
            console.error(`[ProfileComponent] Failed to load questions for idea ${idea.id}:`, questionError);
            loadedQuestions[idea.id] = [];
          }
        }),
      );
      this.ideaQuestions.set(loadedQuestions);
    } catch (error) {
      console.error('[ProfileComponent] loadIdeas failed:', error);
      this.ideasError.set('Your profile loaded, but we could not load your ideas.');
    }
  }
  private populateForm(profile: Profile): void {
    this.form.patchValue({
      userType: profile.userType,
      profession: profile.profession,
      purpose: profile.purpose,
      plannedLocation: profile.plannedLocation,
      goals: profile.goals,
      phoneNumber: profile.contacts.phoneNumber,
      plotNumber: profile.address.plotNumber,
      boxNumber: profile.address.boxNumber,
      addressLocation: profile.address.location,
    });
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  private validateCurrentOnboardingStep(): boolean {
    const control = [
      this.form.controls.userType,
      this.form.controls.profession,
      this.form.controls.purpose,
      this.form.controls.plannedLocation,
      this.form.controls.goals,
    ][this.activeOnboardingStep()];

    if (!control) {
      return true;
    }

    control.markAsTouched();
    return control.valid;
  }

  private transitionToOnboardingStep(step: number): void {
    this.pendingOnboardingStep = step;
    this.onboardingCardPhase.set('exiting');
  }
}
