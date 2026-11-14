import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserDataService } from '../../../core/services/user-data.service';
import type { User } from '../../../shared/models/user.model';
import { ProfileComponent } from './profile.component';

describe('ProfileComponent', () => {
  const authService = {
    getCurrentUser: vi.fn(),
  };
  const toastService = {
    success: vi.fn(),
    error: vi.fn(),
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
    authService.getCurrentUser.mockReset();
    toastService.success.mockReset();
    toastService.error.mockReset();
    userDataService.getOrCreateUser.mockReset();
    userDataService.getIdeasForUser.mockReset();
    userDataService.saveProfile.mockReset();
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
        { provide: AuthService, useValue: authService },
        { provide: ToastService, useValue: toastService },
        { provide: UserDataService, useValue: userDataService },
      ],
    }).compileComponents();
  });

  it('saves the onboarding answers and optional contact details to the signed-in user', async () => {
    const fixture = TestBed.createComponent(ProfileComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('#profile-profession')).not.toBeNull();
    });

    const setInput = (selector: string, value: string): void => {
      const input = fixture.nativeElement.querySelector(selector) as
        | HTMLInputElement
        | HTMLTextAreaElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    };

    setInput('#profile-profession', 'Community organizer');
    setInput('#profile-purpose', 'Build a local food network');
    setInput('#profile-location', 'Gaborone');
    setInput('#profile-goals', 'Connect growers with families');
    setInput('#profile-phone', '+267 7000 0000');
    setInput('#profile-plot-number', 'Plot 12');
    setInput('#profile-box-number', 'P.O. Box 42');
    setInput('#profile-address-location', 'Gaborone');

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(userDataService.saveProfile).toHaveBeenCalledWith(
      user.uid,
      expect.objectContaining({
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
});
