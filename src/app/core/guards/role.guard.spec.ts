import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleService, UserRoleResult } from '../services/role.service';
import { roleGuard } from './role.guard';

describe('roleGuard', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/admin/admin-dashboard' } as RouterStateSnapshot;
  const roleService = {
    loadCurrentRole: vi.fn<() => Promise<UserRoleResult>>(),
  };
  let router: Router;

  beforeEach(() => {
    roleService.loadCurrentRole.mockReset();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: RoleService, useValue: roleService }],
    });
    router = TestBed.inject(Router);
  });

  it('allows a user with the required role', async () => {
    roleService.loadCurrentRole.mockResolvedValue({
      status: 'assigned',
      role: 'admin',
    });

    const result = await TestBed.runInInjectionContext(() =>
      roleGuard('admin')(route, state),
    );

    expect(result).toBe(true);
  });

  it('denies an authenticated user with a different role', async () => {
    roleService.loadCurrentRole.mockResolvedValue({
      status: 'assigned',
      role: 'submitter',
    });

    const result = await TestBed.runInInjectionContext(() =>
      roleGuard('admin')(route, state),
    );

    expect(result).toBe(false);
  });

  it.each([
    { status: 'unassigned' },
    { status: 'invalid' },
  ] satisfies UserRoleResult[])('denies a user whose role is $status', async roleResult => {
    roleService.loadCurrentRole.mockResolvedValue(roleResult);

    const result = await TestBed.runInInjectionContext(() =>
      roleGuard('admin')(route, state),
    );

    expect(result).toBe(false);
  });

  it('redirects an unauthenticated user to login', async () => {
    roleService.loadCurrentRole.mockResolvedValue({ status: 'unauthenticated' });

    const result = await TestBed.runInInjectionContext(() =>
      roleGuard('admin')(route, state),
    );

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toContain(
      '/account/user/login?returnUrl=%2Fadmin%2Fadmin-dashboard',
    );
  });

  it('does not convert role lookup failures into authorization', async () => {
    const error = new Error('Claim lookup failed');
    roleService.loadCurrentRole.mockRejectedValue(error);

    await expect(
      TestBed.runInInjectionContext(() => roleGuard('admin')(route, state)),
    ).rejects.toBe(error);
  });
});
