import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FirebaseError } from 'firebase/app';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ForgotPasswordComponent } from './forgot-password.component';

@Component({ template: '<p>Log in</p>' })
class LoginRouteStubComponent {}

describe('ForgotPasswordComponent', () => {
  const authService = {
    sendPasswordResetEmail: vi.fn(),
  };
  const toastService = {
    success: vi.fn(),
    error: vi.fn(),
  };
  let router: Router;

  beforeEach(async () => {
    authService.sendPasswordResetEmail.mockReset();
    toastService.success.mockReset();
    toastService.error.mockReset();

    await TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent],
      providers: [
        provideRouter([{ path: 'account/user/login', component: LoginRouteStubComponent }]),
        { provide: AuthService, useValue: authService },
        { provide: ToastService, useValue: toastService },
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
  });

  function createFixture() {
    const fixture = TestBed.createComponent(ForgotPasswordComponent);
    fixture.detectChanges();
    return fixture;
  }

  function setEmail(
    fixture: ReturnType<typeof createFixture>,
    email: string,
  ): void {
    const input = fixture.nativeElement.querySelector('#recovery-email') as HTMLInputElement;
    input.value = email;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  async function submit(fixture: ReturnType<typeof createFixture>): Promise<void> {
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows validation and does not request a reset for an invalid email', async () => {
    const fixture = createFixture();
    setEmail(fixture, 'not-an-email');

    await submit(fixture);

    expect(authService.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Enter a valid email address.');
  });

  it('sends a reset request and displays a neutral confirmation', async () => {
    authService.sendPasswordResetEmail.mockResolvedValue(undefined);
    const fixture = createFixture();
    setEmail(fixture, '  casey@example.com  ');

    await submit(fixture);

    expect(authService.sendPasswordResetEmail).toHaveBeenCalledWith('casey@example.com');
    expect(fixture.nativeElement.textContent).toContain(
      'If an account exists for that email address, we’ll send a secure password reset link.',
    );
    expect(toastService.success).toHaveBeenCalledOnce();
  });

  it('uses the same neutral confirmation when Firebase reports no matching account', async () => {
    authService.sendPasswordResetEmail.mockRejectedValue(
      new FirebaseError('auth/user-not-found', 'No user found'),
    );
    const fixture = createFixture();
    setEmail(fixture, 'casey@example.com');

    await submit(fixture);

    expect(fixture.nativeElement.textContent).toContain(
      'If an account exists for that email address, we’ll send a secure password reset link.',
    );
    expect(toastService.error).not.toHaveBeenCalled();
  });

  it('shows a clear error for Firebase request failures', async () => {
    authService.sendPasswordResetEmail.mockRejectedValue(
      new FirebaseError('auth/too-many-requests', 'Rate limited'),
    );
    const fixture = createFixture();
    setEmail(fixture, 'casey@example.com');

    await submit(fixture);

    expect(fixture.nativeElement.textContent).toContain(
      'Too many reset attempts were made. Please wait a moment before trying again.',
    );
    expect(toastService.error).toHaveBeenCalledWith(
      'Too many reset attempts were made. Please wait a moment before trying again.',
    );
  });

  it('keeps SMS recovery unavailable and does not send an SMS', async () => {
    const fixture = createFixture();
    const smsOption = fixture.nativeElement.querySelector(
      '.recovery-method-unavailable',
    ) as HTMLButtonElement;

    expect(smsOption.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(
      'No SMS will be sent.',
    );
    expect(authService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('navigates back to the login route', async () => {
    const fixture = createFixture();
    const backLink = fixture.nativeElement.querySelector(
      'a[routerLink="/account/user/login"]',
    ) as HTMLAnchorElement;
    backLink.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    );
    await fixture.whenStable();

    expect(router.url).toBe('/account/user/login');
  });
});
