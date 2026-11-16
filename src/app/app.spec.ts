import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Auth, User } from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './core/services/auth.service';
import { ToastService, type ToastMessage } from './core/services/toast.service';
import { App } from './app';

const authMocks = vi.hoisted(() => ({
  authState: vi.fn(),
}));

vi.mock('@angular/fire/auth', () => ({
  Auth: class Auth {},
  authState: authMocks.authState,
}));

@Component({ selector: 'app-login-route-stub', template: '<p>Log in</p>' })
class LoginRouteStubComponent {}

@Component({ selector: 'app-account-route-stub', template: '<p>Account route</p>' })
class AccountRouteStubComponent {}

describe('App', () => {
  let authSubject: BehaviorSubject<User | null>;
  let router: Router;
  const authService = {
    signOut: vi.fn(),
  };
  const toastService = {
    messages: signal<ToastMessage[]>([]),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  };

  beforeEach(async () => {
    authSubject = new BehaviorSubject<User | null>(null);
    authMocks.authState.mockReset();
    authMocks.authState.mockReturnValue(authSubject.asObservable());
    authService.signOut.mockReset();
    toastService.success.mockReset();
    toastService.error.mockReset();

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: 'account/user/login', component: LoginRouteStubComponent },
          { path: 'account/user/profile', component: AccountRouteStubComponent },
          { path: 'account/user/change-password', component: AccountRouteStubComponent },
        ]),
        { provide: Auth, useValue: {} },
        { provide: Firestore, useValue: {} },
        { provide: AuthService, useValue: authService },
        { provide: ToastService, useValue: toastService },
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
  });

  function createFixture() {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return fixture;
  }

  function openProfileMenu(fixture: ReturnType<typeof createFixture>): HTMLButtonElement {
    const trigger = (fixture.nativeElement as HTMLElement).querySelector(
      '.profile-menu-trigger',
    ) as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    return trigger;
  }

  it('should create the app', () => {
    const fixture = createFixture();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should expose the primary destinations in the main navigation', () => {
    const fixture = createFixture();
    const compiled = fixture.nativeElement as HTMLElement;
    const links = Array.from(compiled.querySelectorAll('nav[aria-label="Main navigation"] a'));

    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'Home',
      'About',
      'Contact',
      'Submissions',
      'Dashboard',
      'VoiceCommand',
    ]);
  });

  it('should route VoiceCommand to the accessibility feature', () => {
    const fixture = createFixture();
    const compiled = fixture.nativeElement as HTMLElement;
    const voiceCommandLink = Array.from(
      compiled.querySelectorAll('nav[aria-label="Main navigation"] a'),
    ).find((link) => link.textContent?.trim() === 'VoiceCommand');

    expect(voiceCommandLink?.getAttribute('href')).toBe('/accessibility');
  });

  it('routes Dashboard through the authenticated role redirect', () => {
    const fixture = createFixture();
    const dashboardLink = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('nav[aria-label="Main navigation"] a'),
    ).find((link) => link.textContent?.trim() === 'Dashboard');

    expect(dashboardLink?.getAttribute('href')).toBe('/dashboard');
  });

  it('shows Login and Sign Up when Firebase reports no authenticated user', () => {
    const fixture = createFixture();
    const actions = (fixture.nativeElement as HTMLElement).querySelector('.header-actions');

    expect(actions?.textContent).toContain('Log in');
    expect(actions?.textContent).toContain('Sign up');
    expect(actions?.textContent).not.toContain('My Profile');
    expect(actions?.textContent).not.toContain('Log Out');
    expect((fixture.nativeElement as HTMLElement).querySelector('.profile-menu-container')).toBeNull();
  });

  it('shows the Profile menu and hides Login and Sign Up when authenticated', () => {
    authSubject.next({ uid: 'user-123' } as User);
    const fixture = createFixture();
    const compiled = fixture.nativeElement as HTMLElement;
    const profileTrigger = compiled.querySelector('.profile-menu-trigger');

    expect(profileTrigger?.textContent).toContain('Profile');
    expect(profileTrigger?.querySelector('.nav-icon')).not.toBeNull();
    expect(profileTrigger?.querySelector('.profile-menu-chevron')).not.toBeNull();
    expect(compiled.querySelector('.header-actions')?.textContent).not.toContain('Sign up');
    expect(compiled.querySelector('.header-actions')?.textContent).not.toContain('Log in');
  });

  it('opens the account dropdown with its account settings', () => {
    authSubject.next({ uid: 'user-123' } as User);
    const fixture = createFixture();
    openProfileMenu(fixture);
    const menu = (fixture.nativeElement as HTMLElement).querySelector('.profile-account-menu');

    expect(menu?.textContent).toContain('YOUR ACCOUNT');
    expect(menu?.textContent).toContain('Profile & Settings');
    expect(menu?.textContent).toContain('Personal Details');
    expect(menu?.textContent).toContain('View and edit your profile');
    expect(menu?.textContent).toContain('Security');
    expect(menu?.textContent).toContain('Change your password');
    expect(menu?.textContent).toContain('Delete Account');
    expect(menu?.textContent).toContain('Manage account deletion');
    expect(menu?.textContent).toContain('Log Out');
    expect(menu?.textContent).toContain('Securely sign out');
  });

  it('closes the account dropdown when clicking outside', () => {
    authSubject.next({ uid: 'user-123' } as User);
    const fixture = createFixture();
    openProfileMenu(fixture);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="menu"]')).toBeNull();
  });

  it('closes the account dropdown with Escape and restores focus to Profile', async () => {
    authSubject.next({ uid: 'user-123' } as User);
    const fixture = createFixture();
    const trigger = openProfileMenu(fixture);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('opens the menu and focuses its first item with ArrowDown', async () => {
    authSubject.next({ uid: 'user-123' } as User);
    const fixture = createFixture();
    const trigger = (fixture.nativeElement as HTMLElement).querySelector(
      '.profile-menu-trigger',
    ) as HTMLButtonElement;
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="menu"]')).not.toBeNull();
    expect(document.activeElement).toBe(
      (fixture.nativeElement as HTMLElement).querySelector('[role="menuitem"]'),
    );
  });

  it('closes the dropdown when selecting Security and navigates to password settings', async () => {
    authSubject.next({ uid: 'user-123' } as User);
    const fixture = createFixture();
    openProfileMenu(fixture);
    const securityLink = (fixture.nativeElement as HTMLElement).querySelector(
      'a[routerLink="/account/user/change-password"]',
    ) as HTMLAnchorElement;
    securityLink.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/account/user/change-password');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="menu"]')).toBeNull();
  });

  it('routes Delete Account to the existing profile deletion interface without enabling deletion', async () => {
    authSubject.next({ uid: 'user-123' } as User);
    const fixture = createFixture();
    openProfileMenu(fixture);
    const deleteAccountLink = (fixture.nativeElement as HTMLElement).querySelector(
      'a.profile-menu-item-danger[routerLink="/account/user/profile"]',
    ) as HTMLAnchorElement;

    expect(deleteAccountLink.textContent).toContain('Manage account deletion');
    expect(deleteAccountLink.getAttribute('href')).toBe(
      '/account/user/profile?openDeleteAccount=true',
    );
    deleteAccountLink.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/account/user/profile?openDeleteAccount=true');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="menu"]')).toBeNull();
  });

  it('updates the navigation after logout and redirects to login', async () => {
    authSubject.next({ uid: 'user-123' } as User);
    authService.signOut.mockImplementation(async () => {
      authSubject.next(null);
    });
    const fixture = createFixture();
    openProfileMenu(fixture);
    const logoutButton = (fixture.nativeElement as HTMLElement).querySelector(
      '.profile-menu-item-logout',
    ) as HTMLButtonElement;

    logoutButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(authService.signOut).toHaveBeenCalledOnce();
    expect(router.url).toBe('/account/user/login');
    expect(fixture.nativeElement.textContent).toContain('Log in');
    expect(fixture.nativeElement.textContent).toContain('Sign up');
    expect(fixture.nativeElement.textContent).not.toContain('My Profile');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="menu"]')).toBeNull();
    expect(toastService.success).toHaveBeenCalledWith('You have been logged out.');
  });

  it('keeps authenticated navigation and reports a sign-out failure', async () => {
    authSubject.next({ uid: 'user-123' } as User);
    authService.signOut.mockRejectedValue(new Error('Firebase unavailable'));
    const fixture = createFixture();
    openProfileMenu(fixture);
    const logoutButton = (fixture.nativeElement as HTMLElement).querySelector(
      '.profile-menu-item-logout',
    ) as HTMLButtonElement;

    logoutButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/');
    expect(fixture.nativeElement.textContent).toContain('Profile');
    expect(fixture.nativeElement.textContent).not.toContain('Sign up');
    expect(toastService.error).toHaveBeenCalledWith('Unable to log out right now. Please try again.');
  });
});
