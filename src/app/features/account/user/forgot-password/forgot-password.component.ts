import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { FirebaseError } from 'firebase/app';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';

const RESET_CONFIRMATION =
  'If an account exists for that email address, we’ll send a secure password reset link. Check your inbox and spam folder.';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly toastService = inject(ToastService);

  protected readonly isSubmitting = signal(false);
  protected readonly confirmationMessage = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    this.confirmationMessage.set(null);
    this.errorMessage.set(null);

    try {
      const email = this.form.controls.email.value.trim();
      await this.authService.sendPasswordResetEmail(email);
      this.showNeutralConfirmation();
    } catch (error: unknown) {
      if (error instanceof FirebaseError && error.code === 'auth/user-not-found') {
        this.showNeutralConfirmation();
      } else {
        const message = this.getResetErrorMessage(error);
        this.errorMessage.set(message);
        this.toastService.error(message);
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private showNeutralConfirmation(): void {
    this.confirmationMessage.set(RESET_CONFIRMATION);
    this.toastService.success(RESET_CONFIRMATION);
  }

  private getResetErrorMessage(error: unknown): string {
    if (!(error instanceof FirebaseError)) {
      return 'We could not send a password reset email right now. Please try again.';
    }

    switch (error.code) {
      case 'auth/invalid-email':
        return 'Enter a valid email address and try again.';
      case 'auth/too-many-requests':
        return 'Too many reset attempts were made. Please wait a moment before trying again.';
      case 'auth/network-request-failed':
        return 'A network error prevented the request. Check your connection and try again.';
      case 'auth/operation-not-allowed':
        return 'Password recovery is not available right now. Please contact support.';
      default:
        return 'We could not send a password reset email right now. Please try again.';
    }
  }
}
