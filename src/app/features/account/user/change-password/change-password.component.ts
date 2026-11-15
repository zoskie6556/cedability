import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FirebaseError } from 'firebase/app';
import { RouterLink } from '@angular/router';
import {
  AuthService,
  PasswordChangeUnavailableError,
} from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePasswordComponent {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly toastService = inject(ToastService);

  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly form = this.formBuilder.nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  });

  protected passwordsDoNotMatch(): boolean {
    const { newPassword, confirmPassword } = this.form.getRawValue();
    return confirmPassword.length > 0 && newPassword !== confirmPassword;
  }

  protected clearMessages(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.passwordsDoNotMatch()) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    this.clearMessages();

    try {
      const { currentPassword, newPassword } = this.form.getRawValue();
      await this.authService.changePassword(currentPassword, newPassword);
      this.successMessage.set('Your password has been changed.');
      this.toastService.success('Your password has been changed.');
      this.form.reset();
    } catch (error: unknown) {
      const message = this.getChangePasswordErrorMessage(error);
      this.errorMessage.set(message);
      this.toastService.error(message);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private getChangePasswordErrorMessage(error: unknown): string {
    if (error instanceof PasswordChangeUnavailableError) {
      return 'Password changes are available only for accounts using email and password sign-in.';
    }

    if (!(error instanceof FirebaseError)) {
      return 'We could not change your password right now. Please try again.';
    }

    switch (error.code) {
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
      case 'auth/invalid-login-credentials':
        return 'Your current password is incorrect.';
      case 'auth/weak-password':
        return 'Choose a stronger password with at least 8 characters.';
      case 'auth/too-many-requests':
        return 'Too many attempts were made. Please wait a moment and try again.';
      case 'auth/network-request-failed':
        return 'A network error prevented the password change. Check your connection and try again.';
      case 'auth/requires-recent-login':
        return 'Please sign in again before changing your password.';
      default:
        return 'We could not change your password right now. Please try again.';
    }
  }
}
