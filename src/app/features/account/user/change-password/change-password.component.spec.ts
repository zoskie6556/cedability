import { TestBed } from '@angular/core/testing';
import { FirebaseError } from 'firebase/app';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ChangePasswordComponent } from './change-password.component';

describe('ChangePasswordComponent', () => {
  const authService = {
    changePassword: vi.fn(),
  };
  const toastService = {
    success: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(async () => {
    authService.changePassword.mockReset();
    toastService.success.mockReset();
    toastService.error.mockReset();

    await TestBed.configureTestingModule({
      imports: [ChangePasswordComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: ToastService, useValue: toastService },
      ],
    }).compileComponents();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(ChangePasswordComponent);
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

  async function submit(fixture: ReturnType<typeof createFixture>): Promise<void> {
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function setValidPasswords(fixture: ReturnType<typeof createFixture>): void {
    setInput(fixture, '#current-password', 'old-password');
    setInput(fixture, '#new-password', 'new-password');
    setInput(fixture, '#confirm-password', 'new-password');
  }

  it('validates required fields and the minimum new-password length', async () => {
    const fixture = createFixture();
    setInput(fixture, '#current-password', 'old-password');
    setInput(fixture, '#new-password', 'short');
    setInput(fixture, '#confirm-password', 'short');

    await submit(fixture);

    expect(authService.changePassword).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Use at least 8 characters.');
  });

  it('rejects mismatched new passwords without calling Firebase', async () => {
    const fixture = createFixture();
    setInput(fixture, '#current-password', 'old-password');
    setInput(fixture, '#new-password', 'new-password');
    setInput(fixture, '#confirm-password', 'different-password');

    await submit(fixture);

    expect(authService.changePassword).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('The new passwords do not match.');
  });

  it('changes the password and shows success', async () => {
    authService.changePassword.mockResolvedValue(undefined);
    const fixture = createFixture();
    setValidPasswords(fixture);

    await submit(fixture);

    expect(authService.changePassword).toHaveBeenCalledWith('old-password', 'new-password');
    expect(fixture.nativeElement.textContent).toContain('Your password has been changed.');
    expect(toastService.success).toHaveBeenCalledWith('Your password has been changed.');
  });

  it('shows a loading state while the password update is pending', async () => {
    let finishChange: (() => void) | undefined;
    authService.changePassword.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishChange = resolve;
        }),
    );
    const fixture = createFixture();
    setValidPasswords(fixture);
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    const submitButton = fixture.nativeElement.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
    expect(submitButton.getAttribute('aria-busy')).toBe('true');
    expect(submitButton.textContent).toContain('Updating password...');

    finishChange?.();
    await fixture.whenStable();
  });

  it('shows a useful error when Firebase rejects reauthentication', async () => {
    authService.changePassword.mockRejectedValue(
      new FirebaseError('auth/wrong-password', 'Invalid current password'),
    );
    const fixture = createFixture();
    setValidPasswords(fixture);

    await submit(fixture);

    expect(fixture.nativeElement.textContent).toContain('Your current password is incorrect.');
    expect(toastService.error).toHaveBeenCalledWith('Your current password is incorrect.');
  });
});
