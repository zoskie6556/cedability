import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserDataService } from '../../../core/services/user-data.service';
import type { User } from '../../../shared/models/user.model';
import { ProfileComponent } from './profile.component';

describe('ProfileComponent', () => {
  let queryParamMap: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const authService = {
    getCurrentUser: vi.fn(),
    signOut: vi.fn(),
  };
  const toastService = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  };
  const userDataService = {
    getOrCreateUser: vi.fn(),
    getIdeasForUser: vi.fn(),
    saveProfile: vi.fn(),
  };
  const user: User = {
    uid: 'user-123',
    email: 'casey@example.com',
    fullName: 'Casey Example',
    emailVerified: false,
    phoneNumberVerified: false,
    role: 'user',
    profile: {
      userType: 'individual',
      profession: '',
      purpose: '',
      plannedLocation: '',
      goals: '',
      address: {
        plotNumber: '',
        boxNumber: '',
        location: '',
      },
      contacts: {
        phoneNumber: '',
      },
      passwordLastSetAt: null,
      onboardingCompleted: false,
      onboardingCompletedAt: null,
    },
    createdAt: null,
    updatedAt: null,
  };

  beforeEach(async () => {
    queryParamMap = new BehaviorSubject(convertToParamMap({}));
    authService.getCurrentUser.mockReset();
    toastService.success.mockReset();
    toastService.error.mockReset();
    toastService.info.mockReset();
    authService.signOut.mockReset();
    userDataService.getOrCreateUser.mockReset();
    userDataService.getIdeasForUser.mockReset();
    userDataService.saveProfile.mockReset();
    userDataService.saveProfile.mockResolvedValue(undefined);
    authService.getCurrentUser.mockResolvedValue({
      uid: user.uid,
      email: user.email,
      displayName: user.fullName,
      emailVerified: false,
    });
    userDataService.getOrCreateUser.mockResolvedValue(user);
    userDataService.getIdeasForUser.mockResolvedValue([]);

    await TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: queryParamMap.asObservable(),
            snapshot: { queryParamMap: convertToParamMap({}) },
          },
        },
        { provide: AuthService, useValue: authService },
        { provide: ToastService, useValue: toastService },
        { provide: UserDataService, useValue: userDataService },
      ],
    }).compileComponents();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(ProfileComponent);
    fixture.detectChanges();
    return fixture;
  }

  async function createLoadedFixture() {
    const fixture = createFixture();
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('#profile-user-type')).not.toBeNull();
    });
    return fixture;
  }

  function createCompletedUser(): User {
    return {
      ...user,
      profile: {
        ...user.profile,
        userType: 'organization',
        profession: 'Community organizer',
        purpose: 'Build a local food network',
        plannedLocation: 'Gaborone',
        goals: 'Connect growers with families',
        contacts: { phoneNumber: '+267 7000 0000' },
        address: {
          plotNumber: 'Plot 12',
          boxNumber: 'P.O. Box 42',
          location: 'Gaborone',
        },
        onboardingCompleted: true,
      },
    };
  }

  async function createCompletedFixture() {
    userDataService.getOrCreateUser.mockResolvedValue(createCompletedUser());
    const fixture = createFixture();
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.edit-profile-button')).not.toBeNull();
    });
    return fixture;
  }

  function setInput(
    fixture: ReturnType<typeof createFixture>,
    selector: string,
    value: string,
  ): void {
    const input = fixture.nativeElement.querySelector(selector) as
      | HTMLInputElement
      | HTMLTextAreaElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function setSelect(
    fixture: ReturnType<typeof createFixture>,
    selector: string,
    value: string,
  ): void {
    const select = fixture.nativeElement.querySelector(selector) as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
  }

  function finishCardAnimation(
    fixture: ReturnType<typeof createFixture>,
    animationName: 'onboarding-card-enter' | 'onboarding-card-exit',
  ): void {
    const card = fixture.nativeElement.querySelector('.onboarding-step-card') as HTMLElement;
    const event = new Event('animationend');
    Object.defineProperty(event, 'animationName', { value: animationName });
    card.dispatchEvent(event);
    fixture.detectChanges();
  }

  function submitCurrentStep(fixture: ReturnType<typeof createFixture>): void {
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  function advanceStep(fixture: ReturnType<typeof createFixture>): void {
    submitCurrentStep(fixture);
    finishCardAnimation(fixture, 'onboarding-card-exit');
    finishCardAnimation(fixture, 'onboarding-card-enter');
  }

  function goBackOneStep(fixture: ReturnType<typeof createFixture>): void {
    const backButton = fixture.nativeElement.querySelector('.back-button') as HTMLButtonElement;
    backButton.click();
    fixture.detectChanges();
    finishCardAnimation(fixture, 'onboarding-card-exit');
    finishCardAnimation(fixture, 'onboarding-card-enter');
  }

  function prepareDeleteDialog(fixture: ReturnType<typeof createFixture>): HTMLDialogElement {
    const dialog = fixture.nativeElement.querySelector(
      '#delete-account-dialog',
    ) as HTMLDialogElement;
    Object.defineProperty(dialog, 'showModal', {
      configurable: true,
      value: () => dialog.setAttribute('open', ''),
    });
    Object.defineProperty(dialog, 'close', {
      configurable: true,
      value: () => dialog.removeAttribute('open'),
    });
    return dialog;
  }

  it('shows only one question card and swaps it only after its exit animation', async () => {
    const fixture = await createLoadedFixture();

    expect(fixture.nativeElement.querySelectorAll('.onboarding-step-card')).toHaveLength(1);
    submitCurrentStep(fixture);
    expect(fixture.nativeElement.querySelector('h2').textContent).toContain(
      'How are you joining?',
    );

    finishCardAnimation(fixture, 'onboarding-card-exit');
    expect(fixture.nativeElement.querySelectorAll('.onboarding-step-card')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('h2').textContent).toContain('What do you do?');
    finishCardAnimation(fixture, 'onboarding-card-enter');
  });

  it('validates each required step, preserves answers, and saves all fields at the end', async () => {
    const fixture = await createLoadedFixture();

    advanceStep(fixture);
    expect(fixture.nativeElement.querySelector('#profile-profession')).not.toBeNull();
    submitCurrentStep(fixture);
    expect(fixture.nativeElement.querySelector('#profile-profession-error')).not.toBeNull();
    expect(userDataService.saveProfile).not.toHaveBeenCalled();

    setInput(fixture, '#profile-profession', 'Community organizer');
    advanceStep(fixture);
    goBackOneStep(fixture);
    expect(
      (fixture.nativeElement.querySelector('#profile-profession') as HTMLInputElement).value,
    ).toBe('Community organizer');

    advanceStep(fixture);
    setInput(fixture, '#profile-purpose', 'Build a local food network');
    advanceStep(fixture);
    setInput(fixture, '#profile-location', 'Gaborone');
    advanceStep(fixture);
    setInput(fixture, '#profile-goals', 'Connect growers with families');
    advanceStep(fixture);
    setInput(fixture, '#profile-phone', '+267 7000 0000');
    setInput(fixture, '#profile-plot-number', 'Plot 12');
    setInput(fixture, '#profile-box-number', 'P.O. Box 42');
    setInput(fixture, '#profile-address-location', 'Gaborone');

    submitCurrentStep(fixture);
    await fixture.whenStable();

    expect(userDataService.saveProfile).toHaveBeenCalledWith(
      user.uid,
      expect.objectContaining({
        userType: 'individual',
        profession: 'Community organizer',
        purpose: 'Build a local food network',
        plannedLocation: 'Gaborone',
        goals: 'Connect growers with families',
        onboardingCompleted: true,
        contacts: { phoneNumber: '+267 7000 0000' },
        address: {
          plotNumber: 'Plot 12',
          boxNumber: 'P.O. Box 42',
          location: 'Gaborone',
        },
      }),
    );
    expect(toastService.success).toHaveBeenCalledWith(
      'Your profile is ready. You can now submit ideas.',
    );
  });

  it('does not navigate or save when dashboard skipping is unavailable', async () => {
    const fixture = await createLoadedFixture();
    const skipButton = fixture.nativeElement.querySelector('.skip-button') as HTMLButtonElement;

    skipButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.skip-notice').textContent).toContain(
      'no secure user dashboard route or persisted skip status',
    );
    expect(userDataService.saveProfile).not.toHaveBeenCalled();
    expect(user.profile.onboardingCompleted).toBe(false);
  });

  it('prepopulates existing profile fields while keeping account identity read-only', async () => {
    const fixture = await createCompletedFixture();
    (fixture.nativeElement.querySelector('.edit-profile-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect((fixture.nativeElement.querySelector('#profile-user-type') as HTMLSelectElement).value).toBe(
      'organization',
    );
    expect((fixture.nativeElement.querySelector('#profile-profession') as HTMLInputElement).value).toBe(
      'Community organizer',
    );
    expect((fixture.nativeElement.querySelector('#profile-purpose') as HTMLTextAreaElement).value).toBe(
      'Build a local food network',
    );
    expect((fixture.nativeElement.querySelector('#profile-location') as HTMLInputElement).value).toBe(
      'Gaborone',
    );
    expect((fixture.nativeElement.querySelector('#profile-goals') as HTMLTextAreaElement).value).toBe(
      'Connect growers with families',
    );
    expect((fixture.nativeElement.querySelector('#profile-phone') as HTMLInputElement).value).toBe(
      '+267 7000 0000',
    );
    expect((fixture.nativeElement.querySelector('#profile-plot-number') as HTMLInputElement).value).toBe(
      'Plot 12',
    );
    expect((fixture.nativeElement.querySelector('#profile-box-number') as HTMLInputElement).value).toBe(
      'P.O. Box 42',
    );
    expect(
      (fixture.nativeElement.querySelector('#profile-address-location') as HTMLInputElement).value,
    ).toBe('Gaborone');
    expect(fixture.nativeElement.querySelector('input[type="email"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('#profile-edit-form').textContent).toContain(
      'casey@example.com',
    );
    expect(fixture.nativeElement.querySelector('#profile-edit-form').textContent).toContain(
      'Casey Example',
    );
  });

  it('saves edited profile fields and retains onboarding completion', async () => {
    const fixture = await createCompletedFixture();
    (fixture.nativeElement.querySelector('.edit-profile-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    setSelect(fixture, '#profile-user-type', 'individual');
    setInput(fixture, '#profile-profession', 'Updated organizer');
    setInput(fixture, '#profile-phone', '+267 7111 1111');
    (fixture.nativeElement.querySelector('.save-profile-button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(userDataService.saveProfile).toHaveBeenCalledWith(
      user.uid,
      expect.objectContaining({
        userType: 'individual',
        profession: 'Updated organizer',
        purpose: 'Build a local food network',
        plannedLocation: 'Gaborone',
        goals: 'Connect growers with families',
        contacts: { phoneNumber: '+267 7111 1111' },
        address: {
          plotNumber: 'Plot 12',
          boxNumber: 'P.O. Box 42',
          location: 'Gaborone',
        },
        onboardingCompleted: true,
      }),
    );
    expect(fixture.nativeElement.querySelector('#profile-edit-form')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Your profile changes have been saved.');
    expect(fixture.nativeElement.textContent).toContain('casey@example.com');
    expect(toastService.success).toHaveBeenCalledWith('Your profile changes have been saved.');
  });

  it('discards unsaved edits when Cancel is clicked', async () => {
    const fixture = await createCompletedFixture();
    (fixture.nativeElement.querySelector('.edit-profile-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    setInput(fixture, '#profile-profession', 'Unsaved change');
    (fixture.nativeElement.querySelector('.cancel-profile-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(userDataService.saveProfile).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#profile-edit-form')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Community organizer');
    expect(fixture.nativeElement.textContent).not.toContain('Unsaved change');
  });

  it('validates required profile fields before saving', async () => {
    const fixture = await createCompletedFixture();
    (fixture.nativeElement.querySelector('.edit-profile-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    setInput(fixture, '#profile-profession', '');
    (fixture.nativeElement.querySelector('.save-profile-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(userDataService.saveProfile).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#profile-profession-error')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'complete all required fields',
    );
    expect(fixture.nativeElement.querySelector('#profile-edit-form')).not.toBeNull();
  });

  it('keeps edits open and reports an error when saving fails', async () => {
    userDataService.saveProfile.mockRejectedValue(new Error('Firestore unavailable'));
    const fixture = await createCompletedFixture();
    (fixture.nativeElement.querySelector('.edit-profile-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    setInput(fixture, '#profile-profession', 'Updated organizer');
    (fixture.nativeElement.querySelector('.save-profile-button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#profile-edit-form')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'We could not save your profile changes',
    );
    expect((fixture.nativeElement.querySelector('#profile-profession') as HTMLInputElement).value).toBe(
      'Updated organizer',
    );
    expect(toastService.error).toHaveBeenCalledWith(
      'We could not save your profile changes. Please try again.',
    );
  });

  it('signs out, clears profile data, and navigates to login', async () => {
    const fixture = await createCompletedFixture();
    const router = TestBed.inject(Router);
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    authService.signOut.mockResolvedValue(undefined);

    (fixture.nativeElement.querySelector('.logout-button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(authService.signOut).toHaveBeenCalledOnce();
    expect(navigateByUrl).toHaveBeenCalledWith('/account/user/login');
    expect(fixture.nativeElement.textContent).toContain('Log in to view your profile');
    expect(fixture.nativeElement.textContent).not.toContain('Casey Example');
    expect(fixture.nativeElement.textContent).not.toContain('casey@example.com');
  });

  it('keeps the profile visible and reports a sign-out failure', async () => {
    const fixture = await createCompletedFixture();
    const router = TestBed.inject(Router);
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl');
    authService.signOut.mockRejectedValue(new Error('Firebase unavailable'));

    (fixture.nativeElement.querySelector('.logout-button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Welcome, Casey Example');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'We could not log you out',
    );
    expect(toastService.error).toHaveBeenCalledWith('We could not log you out. Please try again.');
  });

  it('opens the deletion confirmation dialog and records cancellation without changing data', async () => {
    const fixture = await createCompletedFixture();
    const dialog = prepareDeleteDialog(fixture);

    (fixture.nativeElement.querySelector('.delete-account-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('permanently close your account');
    expect(dialog.textContent).toContain('personal profile information');
    expect(dialog.textContent).toContain('user-owned ideas and their related records');
    expect(dialog.textContent).toContain('cannot be undone');

    (dialog.querySelector('.cancel-deletion-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(dialog.open).toBe(false);
    expect(fixture.nativeElement.textContent).toContain(
      'Account deletion cancelled. No changes were made.',
    );
    expect(userDataService.saveProfile).not.toHaveBeenCalled();
    expect(authService.signOut).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Welcome, Casey Example');
  });

  it('opens the existing non-destructive deletion dialog from the profile route query', async () => {
    const fixture = await createCompletedFixture();
    const dialog = prepareDeleteDialog(fixture);

    queryParamMap.next(convertToParamMap({ openDeleteAccount: 'true' }));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(dialog.open).toBe(true);
    });

    expect(dialog.textContent).toContain('Deletion is currently unavailable');
    expect(dialog.textContent).toContain('no deletion will be attempted here');
    expect(authService.signOut).not.toHaveBeenCalled();
    expect(userDataService.saveProfile).not.toHaveBeenCalled();
  });

  it('requires explicit acknowledgement and never claims or attempts deletion without an approved policy', async () => {
    const fixture = await createCompletedFixture();
    const dialog = prepareDeleteDialog(fixture);
    (fixture.nativeElement.querySelector('.delete-account-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const confirmButton = dialog.querySelector('.confirm-deletion-button') as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    (dialog.querySelector('#delete-account-confirmation') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(confirmButton.disabled).toBe(false);

    confirmButton.click();
    fixture.detectChanges();

    expect(dialog.textContent).toContain(
      'Account deletion is unavailable until a data-retention policy is approved',
    );
    expect(dialog.textContent).toContain('No data has been changed');
    expect(dialog.open).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('Account deleted');
    expect(authService.signOut).not.toHaveBeenCalled();
    expect(userDataService.saveProfile).not.toHaveBeenCalled();
    expect(toastService.info).toHaveBeenCalledWith(
      expect.stringContaining('No data has been changed.'),
    );
  });
});
