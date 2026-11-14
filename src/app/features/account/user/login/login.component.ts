import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { FirebaseError } from 'firebase/app';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);

  protected readonly isSubmitting = signal(false);
  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
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

    try {
      const { email, password } = this.form.getRawValue();
      await this.authService.signIn(email.trim(), password);
      this.toastService.success('You are now logged in.');
      await this.router.navigateByUrl('/account/user/profile');
    } catch (error: unknown) {
      this.toastService.error(this.getLoginErrorMessage(error));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private getLoginErrorMessage(error: unknown): string {
    if (!(error instanceof FirebaseError)) {
      return 'Unable to log in right now. Please try again.';
    }

    switch (error.code) {
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'The email address or password is incorrect.';
      case 'auth/user-disabled':
        return 'This account has been disabled. Please contact support.';
      case 'auth/too-many-requests':
        return 'Too many login attempts. Please wait a moment and try again.';
      case 'auth/network-request-failed':
        return 'A network error prevented login. Check your connection and try again.';
      default:
        return 'Unable to log in right now. Please try again.';
    }
  }
}
