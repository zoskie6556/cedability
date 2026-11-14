import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserDataService } from '../../../core/services/user-data.service';
import type { IdeaQuestion } from '../../../shared/models/idea-evaluation.model';
import type { Idea } from '../../../shared/models/idea.model';
import type { Profile, UserType } from '../../../shared/models/profile.model';
import type { User } from '../../../shared/models/user.model';

@Component({
  selector: 'app-profile',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly toastService = inject(ToastService);
  private readonly userDataService = inject(UserDataService);

  protected readonly user = signal<User | null>(null);
  protected readonly ideas = signal<Idea[]>([]);
  protected readonly ideaQuestions = signal<Record<string, IdeaQuestion[] | undefined>>({});
  protected readonly responseDrafts = signal<Partial<Record<string, string>>>({});
  protected readonly respondingToQuestion = signal<string | null>(null);
  protected readonly hasSignedInUser = signal(false);
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly ideasError = signal<string | null>(null);

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

  ngOnInit(): void {
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

  private async loadIdeas(uid: string): Promise<void> {
    try {
      const ideas = await this.userDataService.getIdeasForUser(uid);
      this.ideas.set(ideas);
      const loadedQuestions: Record<string, IdeaQuestion[] | undefined> = {};
      await Promise.all(
        ideas.map(async (idea) => {
          loadedQuestions[idea.id] = await this.userDataService.getQuestionsForIdea(idea.id);
        }),
      );
      this.ideaQuestions.set(loadedQuestions);
    } catch {
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
  }
}
