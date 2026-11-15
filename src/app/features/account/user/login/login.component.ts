import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { FirebaseError } from 'firebase/app';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { roleDashboardPath } from '../../../../core/guards/role-routing';
import { AuthService } from '../../../../core/services/auth.service';
import { RoleService, UserRoleResult } from '../../../../core/services/role.service';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent implements OnInit {
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly roleService = inject(RoleService);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);

  protected readonly isSubmitting = signal(false);
  protected readonly roleError = signal<string | null>(null);
  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  ngOnInit(): void {
    this.activatedRoute.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.roleError.set(this.getRoleErrorMessage(params.get('roleError')));
      });
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    this.roleError.set(null);

    try {
      const { email, password } = this.form.getRawValue();
      await this.authService.signIn(email.trim(), password);

      let roleResult: UserRoleResult;
      try {
        roleResult = await this.roleService.loadCurrentRole();
      } catch {
        this.roleError.set(this.getRoleErrorMessage('unavailable'));
        return;
      }

      if (roleResult.status !== 'assigned') {
        this.roleError.set(
          this.getRoleErrorMessage(
            roleResult.status === 'unauthenticated' ? 'unavailable' : roleResult.status,
          ),
        );
        return;
      }

      this.toastService.success('You are now logged in.');
      await this.router.navigateByUrl(roleDashboardPath(roleResult.role));
    } catch (error: unknown) {
      this.toastService.error(this.getLoginErrorMessage(error));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private getRoleErrorMessage(status: string | null): string | null {
    switch (status) {
      case 'unassigned':
        return 'We could not verify a role for this account. Access remains restricted; please contact support.';
      case 'invalid':
        return 'This account has an unsupported role. Access remains restricted; please contact support.';
      case 'unavailable':
        return 'We could not verify account permissions. Check your connection and try again.';
      default:
        return null;
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
