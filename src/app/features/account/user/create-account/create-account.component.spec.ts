import { TestBed } from '@angular/core/testing';
import { FirebaseError } from 'firebase/app';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountFirestoreWriteError,
  AuthService,
} from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { CreateAccountComponent } from './create-account.component';

describe('CreateAccountComponent', () => {
  const authService = {
    register: vi.fn(),
  };
  const toastService = {
    success: vi.fn(),
    error: vi.fn(),
  };
  let router: Router;

  beforeEach(async () => {
    authService.register.mockReset();
    toastService.success.mockReset();
    toastService.error.mockReset();

    await TestBed.configureTestingModule({
      imports: [CreateAccountComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: ToastService, useValue: toastService },
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  function createFixture() {
    const fixture = TestBed.createComponent(CreateAccountComponent);
    fixture.detectChanges();
    return fixture;
  }

  function setInput(
    fixture: ReturnType<typeof createFixture>,
    selector: string,
    value: string,
  ): void {
    const input = fixture.nativeElement.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  it('creates an account with the trimmed name and navigates to the profile', async () => {
    authService.register.mockResolvedValue(undefined);
    const fixture = createFixture();
    setInput(fixture, '#signup-name', '  Casey Example  ');
    setInput(fixture, '#signup-email', 'casey@example.com');
    setInput(fixture, '#signup-password', 'password123');

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(authService.register).toHaveBeenCalledWith(
      'Casey Example',
      'casey@example.com',
      'password123',
    );
    expect(toastService.success).toHaveBeenCalledWith('Your account has been created.');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/account/user/profile');
  });

  it('does not call Firebase when the email is invalid', async () => {
    const fixture = createFixture();
    setInput(fixture, '#signup-name', 'Casey Example');
    setInput(fixture, '#signup-email', 'not-an-email');
    setInput(fixture, '#signup-password', 'password123');

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(authService.register).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Enter a valid email address.');
  });

  it('shows a useful error when the email is already registered', async () => {
    authService.register.mockRejectedValue(
      new FirebaseError('auth/email-already-in-use', 'Email already in use'),
    );
    const fixture = createFixture();
    setInput(fixture, '#signup-name', 'Casey Example');
    setInput(fixture, '#signup-email', 'casey@example.com');
    setInput(fixture, '#signup-password', 'password123');

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(toastService.error).toHaveBeenCalledWith(
      'An account with this email already exists. Try logging in.',
    );
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('explains that the account exists when its Firestore user record cannot be saved', async () => {
    authService.register.mockRejectedValue(new AccountFirestoreWriteError(new Error('offline')));
    const fixture = createFixture();
    setInput(fixture, '#signup-name', 'Casey Example');
    setInput(fixture, '#signup-email', 'casey@example.com');
    setInput(fixture, '#signup-password', 'password123');

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(toastService.error).toHaveBeenCalledWith(
      'Your account was created, but we could not save your user record. Please do not register again; contact support for help.',
    );
    expect(router.navigateByUrl).toHaveBeenCalledWith('/account/user/profile');
  });
});
