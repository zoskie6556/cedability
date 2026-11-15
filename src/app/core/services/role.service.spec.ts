import { TestBed } from '@angular/core/testing';
import { Auth, authState } from '@angular/fire/auth';
import { IdTokenResult } from 'firebase/auth';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleService } from './role.service';

const authMocks = vi.hoisted(() => ({
  authState: vi.fn(),
}));

function createIdTokenResult(claims: IdTokenResult['claims']): IdTokenResult {
  return {
    authTime: '2026-11-15T00:00:00.000Z',
    expirationTime: '2026-11-15T01:00:00.000Z',
    issuedAtTime: '2026-11-15T00:00:00.000Z',
    signInProvider: 'password',
    signInSecondFactor: null,
    token: 'test-id-token',
    claims,
  };
}

vi.mock('@angular/fire/auth', () => ({
  Auth: class Auth {},
  authState: authMocks.authState,
}));

describe('RoleService', () => {
  const user = {
    getIdTokenResult: vi.fn<(forceRefresh?: boolean) => Promise<IdTokenResult>>(),
  };
  let roleService: RoleService;

  beforeEach(() => {
    authMocks.authState.mockReset();
    vi.mocked(user.getIdTokenResult).mockReset();

    TestBed.configureTestingModule({
      providers: [RoleService, { provide: Auth, useValue: {} }],
    });
    roleService = TestBed.inject(RoleService);
  });

  it('loads a recognized role from the authenticated user custom claims', async () => {
    authMocks.authState.mockReturnValue(of(user));
    vi.mocked(user.getIdTokenResult).mockResolvedValue(
      createIdTokenResult({ role: 'evaluator' }),
    );

    await expect(roleService.loadCurrentRole()).resolves.toEqual({
      status: 'assigned',
      role: 'evaluator',
    });
    expect(user.getIdTokenResult).toHaveBeenCalledWith(false);
  });

  it('reports an unauthenticated user without assigning a role', async () => {
    authMocks.authState.mockReturnValue(of(null));

    await expect(roleService.loadCurrentRole()).resolves.toEqual({
      status: 'unauthenticated',
    });
    expect(user.getIdTokenResult).not.toHaveBeenCalled();
  });

  it('reports a missing role claim as unassigned', async () => {
    authMocks.authState.mockReturnValue(of(user));
    vi.mocked(user.getIdTokenResult).mockResolvedValue(createIdTokenResult({}));

    await expect(roleService.loadCurrentRole()).resolves.toEqual({
      status: 'unassigned',
    });
  });

  it('reports an unknown role claim as invalid', async () => {
    authMocks.authState.mockReturnValue(of(user));
    vi.mocked(user.getIdTokenResult).mockResolvedValue(
      createIdTokenResult({ role: 'owner' }),
    );

    await expect(roleService.loadCurrentRole()).resolves.toEqual({
      status: 'invalid',
    });
  });

  it('does not hide custom-claim retrieval errors behind a default role', async () => {
    const error = new Error('Token unavailable');
    authMocks.authState.mockReturnValue(of(user));
    vi.mocked(user.getIdTokenResult).mockRejectedValue(error);

    await expect(roleService.loadCurrentRole()).rejects.toBe(error);
  });

  it('can force a custom-claim refresh', async () => {
    authMocks.authState.mockReturnValue(of(user));
    vi.mocked(user.getIdTokenResult).mockResolvedValue(
      createIdTokenResult({ role: 'admin' }),
    );

    await roleService.loadCurrentRole(true);

    expect(user.getIdTokenResult).toHaveBeenCalledWith(true);
  });

  it('uses the AngularFire authState observable', async () => {
    authMocks.authState.mockReturnValue(of(null));

    await roleService.loadCurrentRole();

    expect(authState).toHaveBeenCalled();
  });
});
