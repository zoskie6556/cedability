import { TestBed } from '@angular/core/testing';
import { Auth, authState, User } from '@angular/fire/auth';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authGuard } from './auth.guard';

const authMocks = vi.hoisted(() => ({
  authState: vi.fn(),
}));

vi.mock('@angular/fire/auth', () => ({
  Auth: class Auth {},
  authState: authMocks.authState,
}));

describe('authGuard', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/submissions/idea' } as RouterStateSnapshot;
  const user = {} as User;
  let router: Router;

  beforeEach(() => {
    authMocks.authState.mockReset();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Auth, useValue: {} }],
    });
    router = TestBed.inject(Router);
  });

  it('allows an authenticated user', async () => {
    authMocks.authState.mockReturnValue(of(user));

    const result = await TestBed.runInInjectionContext(() => authGuard(route, state));

    expect(result).toBe(true);
  });

  it('redirects an unauthenticated user to login with the requested URL', async () => {
    authMocks.authState.mockReturnValue(of(null));

    const result = await TestBed.runInInjectionContext(() => authGuard(route, state));

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toContain(
      '/account/user/login?returnUrl=%2Fsubmissions%2Fidea',
    );
  });
});
