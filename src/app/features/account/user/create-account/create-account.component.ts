import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FirebaseError } from 'firebase/app';
import { Router, RouterLink } from '@angular/router';
import { AccountProfileUpdateError, AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-create-account',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './create-account.component.html',
  styleUrl: './create-account.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateAccountComponent {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);

  protected readonly isSubmitting = signal(false);
  protected readonly form = this.formBuilder.nonNullable.group({
    fullName: ['', [Validators.required, Validators.pattern(/\S/)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
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
    let accountCreated = false;

    try {
      const { fullName, email, password } = this.form.getRawValue();
      await this.authService.register(fullName.trim(), email.trim(), password);
      accountCreated = true;
      this.toastService.success('Your account has been created.');
      await this.router.navigateByUrl('/account/user/profile');
    } catch (error: unknown) {
      if (error instanceof AccountProfileUpdateError) {
        this.toastService.error(
          'Your account was created, but we could not save your name. You can update it later.',
        );
        await this.router.navigateByUrl('/account/user/profile');
      } else if (accountCreated) {
        this.toastService.error(
          'Your account was created, but we could not open your profile. Please log in to continue.',
        );
      } else {
        this.toastService.error(this.getRegistrationErrorMessage(error));
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private getRegistrationErrorMessage(error: unknown): string {
    if (!(error instanceof FirebaseError)) {
      return 'Unable to create your account right now. Please try again.';
    }

    switch (error.code) {
      case 'auth/email-already-in-use':
        return 'An account with this email already exists. Try logging in.';
      case 'auth/invalid-email':
        return 'Enter a valid email address.';
      case 'auth/weak-password':
        return 'Choose a stronger password with at least 8 characters.';
      case 'auth/operation-not-allowed':
        return 'Email and password registration is not enabled. Please contact support.';
      case 'auth/network-request-failed':
        return 'A network error prevented registration. Check your connection and try again.';
      case 'auth/too-many-requests':
        return 'Too many registration attempts. Please wait a moment and try again.';
      default:
        return 'Unable to create your account right now. Please try again.';
    }
  }
}
