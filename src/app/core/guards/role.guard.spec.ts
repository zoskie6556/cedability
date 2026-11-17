import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '../models/user-role';
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

  it.each(['user', 'submitter', 'evaluator', 'adjudicator', 'admin'] as const)(
    'allows the matching %s role',
    async (role: UserRole) => {
      roleService.loadCurrentRole.mockResolvedValue({ status: 'assigned', role });

      const result = await TestBed.runInInjectionContext(() =>
        roleGuard(role)(route, state),
      );

      it.each(['adjudicator', 'admin'] as const)(
        'allows %s on a route shared with admins',
        async (role) => {
          roleService.loadCurrentRole.mockResolvedValue({ status: 'assigned', role });
          const result = await TestBed.runInInjectionContext(() =>
            roleGuard(['adjudicator', 'admin'])(route, state),
          );
          expect(result).toBe(true);
        },
      );

      it('redirects an evaluator away from an adjudicator and admin route', async () => {
        roleService.loadCurrentRole.mockResolvedValue({ status: 'assigned', role: 'evaluator' });
        const result = await TestBed.runInInjectionContext(() =>
          roleGuard(['adjudicator', 'admin'])(route, state),
        );
        expect(result).toBeInstanceOf(UrlTree);
        expect(router.serializeUrl(result as UrlTree)).toBe('/dashboard');
      });

      expect(result).toBe(true);
    },
  );

  it.each([
    ['user', 'admin'],
    ['submitter', 'admin'],
    ['admin', 'submitter'],
    ['evaluator', 'admin'],
    ['admin', 'evaluator'],
  ] as const)(
    'redirects a %s away from a %s-only route',
    async (role, requiredRole) => {
      roleService.loadCurrentRole.mockResolvedValue({ status: 'assigned', role });

      const result = await TestBed.runInInjectionContext(() =>
        roleGuard(requiredRole)(route, state),
      );

      expect(result).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(result as UrlTree)).toBe('/dashboard');
    },
  );

  it.each(['unassigned', 'invalid'] as const)(
    'returns an explicit role error for a %s role',
    async (status) => {
      roleService.loadCurrentRole.mockResolvedValue({ status });

      const result = await TestBed.runInInjectionContext(() =>
        roleGuard('admin')(route, state),
      );

      expect(result).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(result as UrlTree)).toBe(
        `/account/user/login?roleError=${status}`,
      );
    },
  );

  it('redirects an unauthenticated user to login with the requested URL', async () => {
    roleService.loadCurrentRole.mockResolvedValue({ status: 'unauthenticated' });

    const result = await TestBed.runInInjectionContext(() =>
      roleGuard('admin')(route, state),
    );

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toContain(
      '/account/user/login?returnUrl=%2Fadmin%2Fadmin-dashboard',
    );
  });

  it('reports role lookup failures without granting access', async () => {
    roleService.loadCurrentRole.mockRejectedValue(new Error('Firestore unavailable'));

    const result = await TestBed.runInInjectionContext(() =>
      roleGuard('admin')(route, state),
    );

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe(
      '/account/user/login?roleError=unavailable',
    );
  });
});
