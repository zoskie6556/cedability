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
import { dashboardRedirectGuard } from './dashboard-redirect.guard';

describe('dashboardRedirectGuard', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/dashboard' } as RouterStateSnapshot;
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

  it.each([
    ['user', '/account/user/dashboard'],
    ['evaluator', '/evaluation/review'],
    ['adjudicator', '/evaluation/adjudication'],
    ['admin', '/admin/admin-dashboard'],
  ] as const)('routes the %s role to its dashboard', async (role, expectedPath) => {
    roleService.loadCurrentRole.mockResolvedValue({ status: 'assigned', role });

    const result = await TestBed.runInInjectionContext(() =>
      dashboardRedirectGuard(route, state),
    );

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe(expectedPath);
  });

  it.each(['unassigned', 'invalid'] as const)(
    'does not route a %s role to a dashboard',
    async (status) => {
      roleService.loadCurrentRole.mockResolvedValue({ status });

      const result = await TestBed.runInInjectionContext(() =>
        dashboardRedirectGuard(route, state),
      );

      expect(result).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(result as UrlTree)).toBe(
        `/account/user/login?roleError=${status}`,
      );
    },
  );

  it('redirects unauthenticated users to login', async () => {
    roleService.loadCurrentRole.mockResolvedValue({ status: 'unauthenticated' });

    const result = await TestBed.runInInjectionContext(() =>
      dashboardRedirectGuard(route, state),
    );

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toContain(
      '/account/user/login?returnUrl=%2Fdashboard',
    );
  });

  it('fails closed when the role cannot be read', async () => {
    roleService.loadCurrentRole.mockRejectedValue(new Error('Firestore unavailable'));

    const result = await TestBed.runInInjectionContext(() =>
      dashboardRedirectGuard(route, state),
    );

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe(
      '/account/user/login?roleError=unavailable',
    );
  });
});
