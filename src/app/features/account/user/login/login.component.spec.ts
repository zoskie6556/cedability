import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { UserCredential } from '@angular/fire/auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '../../../../core/models/user-role';
import { AuthService } from '../../../../core/services/auth.service';
import { RoleService, UserRoleResult } from '../../../../core/services/role.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  const authService = {
    signIn: vi.fn<(email: string, password: string) => Promise<UserCredential>>(),
  };
  const roleService = {
    loadCurrentRole: vi.fn<() => Promise<UserRoleResult>>(),
  };
  const toastService = {
    success: vi.fn(),
    error: vi.fn(),
  };
  let fixture: ComponentFixture<LoginComponent>;
  let router: Router;

  async function submitLogin(): Promise<void> {
    const element = fixture.nativeElement as HTMLElement;
    const email = element.querySelector('#login-email') as HTMLInputElement;
    const password = element.querySelector('#login-password') as HTMLInputElement;
    email.value = 'ada@example.com';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    password.value = 'correct-password';
    password.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    element.querySelector('form')?.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    authService.signIn.mockReset().mockResolvedValue({} as UserCredential);
    roleService.loadCurrentRole.mockReset();
    toastService.success.mockReset();
    toastService.error.mockReset();

    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: RoleService, useValue: roleService },
        { provide: ToastService, useValue: toastService },
      ],
    });
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
  });

  it.each([
    ['user', '/account/user/dashboard'],
    ['evaluator', '/evaluation/review'],
    ['admin', '/admin/admin-dashboard'],
  ] as const)(
    'redirects a %s account to its dashboard after login',
    async (role: UserRole, expectedPath: string) => {
      roleService.loadCurrentRole.mockResolvedValue({ status: 'assigned', role });

      await submitLogin();

      expect(authService.signIn).toHaveBeenCalledWith('ada@example.com', 'correct-password');
      expect(router.navigateByUrl).toHaveBeenCalledWith(expectedPath);
      expect(toastService.success).toHaveBeenCalledWith('You are now logged in.');
    },
  );

  it.each([
    { status: 'unassigned', message: 'We could not verify a role' },
    { status: 'invalid', message: 'unsupported role' },
  ] satisfies Array<{ status: 'unassigned' | 'invalid'; message: string }>)(
    'does not redirect when the role is $status',
    async ({ status, message }) => {
      roleService.loadCurrentRole.mockResolvedValue({ status });

      await submitLogin();

      expect(router.navigateByUrl).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(message);
    },
  );

  it('does not redirect when the role lookup fails', async () => {
    roleService.loadCurrentRole.mockRejectedValue(new Error('Firestore unavailable'));

    await submitLogin();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'We could not verify account permissions',
    );
  });
});
