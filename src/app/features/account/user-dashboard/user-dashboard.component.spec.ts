import { ComponentFixture, TestBed } from '@angular/core/testing';
import { User as FirebaseUser } from '@angular/fire/auth';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollaborationService } from '../../../core/services/collaboration.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserDataService } from '../../../core/services/user-data.service';
import type {
  CollaborationOverview,
  CollaborationRequestView,
} from '../../../shared/models/collaboration.model';
import type { User } from '../../../shared/models/user.model';
import { UserDashboardComponent } from './user-dashboard.component';

describe('UserDashboardComponent', () => {
  const authUser = {
    uid: 'user-123',
    displayName: 'Ada User',
  } as FirebaseUser;
  const authService = {
    getCurrentUser: vi.fn<() => Promise<FirebaseUser | null>>(),
  };
  const userDataService = {
    getOrCreateUser: vi.fn<(user: FirebaseUser) => Promise<User>>(),
  };
  const collaborationService = {
    getOverview: vi.fn<(uid: string) => Promise<CollaborationOverview>>(),
    syncDiscoverableProfile: vi.fn<(uid: string, user: User) => Promise<void>>(),
    searchDirectory: vi.fn(),
    setDiscoverable: vi.fn(),
    sendRequest: vi.fn(),
    respondToRequest: vi.fn(),
    cancelRequest: vi.fn(),
  };
  const toastService = {
    error: vi.fn(),
    success: vi.fn(),
  };
  let fixture: ComponentFixture<UserDashboardComponent>;
  let router: Router;

  function makeUser(onboardingCompleted: boolean, role: User['role'] = 'submitter'): User {
    return {
      uid: authUser.uid,
      email: 'ada@example.com',
      fullName: 'Ada Lovelace',
      emailVerified: true,
      phoneNumberVerified: false,
      role,
      profile: {
        userType: 'individual',
        profession: 'Engineer',
        purpose: 'Build useful ideas',
        plannedLocation: 'Gaborone',
        goals: 'Grow my idea',
        address: { plotNumber: '', boxNumber: '', location: '' },
        contacts: { phoneNumber: '' },
        passwordLastSetAt: null,
        onboardingCompleted,
        onboardingCompletedAt: null,
      },
      createdAt: null,
      updatedAt: null,
    };
  }

  function makeOverview(overrides: Partial<CollaborationOverview> = {}): CollaborationOverview {
    return {
      ownProfile: null,
      incomingRequests: [],
      outgoingRequests: [],
      collaborators: [],
      ...overrides,
    };
  }

  beforeEach(() => {
    authService.getCurrentUser.mockReset().mockResolvedValue(authUser);
    userDataService.getOrCreateUser.mockReset();
    collaborationService.getOverview.mockReset().mockResolvedValue(makeOverview());
    collaborationService.syncDiscoverableProfile.mockReset().mockResolvedValue();
    collaborationService.searchDirectory.mockReset().mockResolvedValue([]);
    collaborationService.setDiscoverable.mockReset().mockResolvedValue();
    collaborationService.sendRequest.mockReset().mockResolvedValue();
    collaborationService.respondToRequest.mockReset().mockResolvedValue();
    collaborationService.cancelRequest.mockReset().mockResolvedValue();
    toastService.error.mockReset();
    toastService.success.mockReset();

    TestBed.configureTestingModule({
      imports: [UserDashboardComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: CollaborationService, useValue: collaborationService },
        { provide: UserDataService, useValue: userDataService },
        { provide: ToastService, useValue: toastService },
      ],
    });

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(UserDashboardComponent);
  });

  it('sends users with incomplete profiles to onboarding', async () => {
    userDataService.getOrCreateUser.mockResolvedValue(makeUser(false));
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(router.navigateByUrl).toHaveBeenCalledWith('/account/user/profile', {
        replaceUrl: true,
      }),
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Welcome, Ada Lovelace');
  });

  it('renders the dashboard after onboarding is complete', async () => {
    userDataService.getOrCreateUser.mockResolvedValue(makeUser(true));
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Welcome, Ada Lovelace');
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a[routerLink="/submissions/idea"]')).not.toBeNull();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('explains the public directory fields and keeps opt-in off by default', async () => {
    userDataService.getOrCreateUser.mockResolvedValue(makeUser(true));
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Your email, phone, address');
    });

    const visibilityInput: HTMLInputElement | null = fixture.nativeElement.querySelector(
      '#collaboration-discoverable',
    );
    expect(visibilityInput?.checked).toBe(false);
    expect(visibilityInput?.getAttribute('aria-describedby')).toBe('directory-privacy');
  });

  it('lets only the recipient accept a visible incoming request', async () => {
    const request: CollaborationRequestView = {
      request: {
        id: 'user-123~user-456',
        participants: ['user-123', 'user-456'],
        senderUid: 'user-456',
        recipientUid: 'user-123',
        status: 'pending',
        createdAt: null,
        updatedAt: null,
        respondedAt: null,
      },
      profile: {
        uid: 'user-456',
        displayName: 'Grace Hopper',
        profession: 'Engineer',
        displayNameSearch: 'grace hopper',
        professionSearch: 'engineer',
      },
    };
    userDataService.getOrCreateUser.mockResolvedValue(makeUser(true));
    collaborationService.getOverview
      .mockResolvedValueOnce(makeOverview({ incomingRequests: [request] }))
      .mockResolvedValue(makeOverview());
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Grace Hopper');
    });

    const acceptButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (button: HTMLButtonElement) => button.textContent?.trim() === 'Accept',
    );
    acceptButton?.click();
    await vi.waitFor(() =>
      expect(collaborationService.respondToRequest).toHaveBeenCalledWith(
        request.request,
        'accepted',
      ),
    );
  });

  it('routes a user whose role changed to the matching dashboard', async () => {
    userDataService.getOrCreateUser.mockResolvedValue(makeUser(true, 'evaluator'));
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(router.navigateByUrl).toHaveBeenCalledWith('/evaluation/review', {
        replaceUrl: true,
      }),
    );

    expect(router.navigateByUrl).toHaveBeenCalledWith('/evaluation/review', {
      replaceUrl: true,
    });
  });

  it('reports profile loading failures and offers a retry', async () => {
    userDataService.getOrCreateUser.mockRejectedValue(new Error('Firestore unavailable'));
    fixture.detectChanges();
    await vi.waitFor(() => expect(toastService.error).toHaveBeenCalledOnce());
    fixture.detectChanges();

    expect(toastService.error).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Try again');
  });
});
