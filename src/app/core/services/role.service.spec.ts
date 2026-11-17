import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserDataService } from './user-data.service';
import { AuthService } from './auth.service';
import { RoleService } from './role.service';

describe('RoleService', () => {
  const authUser = { uid: 'user-123' };
  const authService = {
    getCurrentUser: vi.fn<() => Promise<typeof authUser | null>>(),
  };
  const userDataService = {
    getRoleRecord: vi.fn<(uid: string) => Promise<{ exists: boolean; role: unknown }>>(),
  };
  let roleService: RoleService;

  beforeEach(() => {
    authService.getCurrentUser.mockReset().mockResolvedValue(authUser);
    userDataService.getRoleRecord.mockReset();

    TestBed.configureTestingModule({
      providers: [
        RoleService,
        { provide: AuthService, useValue: authService },
        { provide: UserDataService, useValue: userDataService },
      ],
    });
    roleService = TestBed.inject(RoleService);
  });

  it.each([
    ['user', 'submitter'],
    ['submitter', 'submitter'],
    ['evaluator', 'evaluator'],
    ['admin', 'admin'],
  ] as const)(
    'loads the %s role from the protected user document',
    async (storedRole, expectedRole) => {
      userDataService.getRoleRecord.mockResolvedValue({ exists: true, role: storedRole });

      await expect(roleService.loadCurrentRole()).resolves.toEqual({
        status: 'assigned',
        role: expectedRole,
      });
      expect(userDataService.getRoleRecord).toHaveBeenCalledWith(authUser.uid);
    },
  );

  it('gets the initialized current user from AuthService', async () => {
    userDataService.getRoleRecord.mockResolvedValue({ exists: true, role: 'submitter' });

    await roleService.loadCurrentRole();

    expect(authService.getCurrentUser).toHaveBeenCalledOnce();
  });

  it('reports an unauthenticated user without reading a role', async () => {
    authService.getCurrentUser.mockResolvedValue(null);

    await expect(roleService.loadCurrentRole()).resolves.toEqual({
      status: 'unauthenticated',
    });
    expect(userDataService.getRoleRecord).not.toHaveBeenCalled();
  });

  it('reports a missing user document as unassigned', async () => {
    userDataService.getRoleRecord.mockResolvedValue({ exists: false, role: undefined });

    await expect(roleService.loadCurrentRole()).resolves.toEqual({
      status: 'unassigned',
    });
  });

  it('reports a missing role field as invalid', async () => {
    userDataService.getRoleRecord.mockResolvedValue({ exists: true, role: undefined });

    await expect(roleService.loadCurrentRole()).resolves.toEqual({
      status: 'invalid',
    });
  });

  it('reports an unknown role as invalid', async () => {
    userDataService.getRoleRecord.mockResolvedValue({ exists: true, role: 'owner' });

    await expect(roleService.loadCurrentRole()).resolves.toEqual({
      status: 'invalid',
    });
  });

  it('does not hide Firestore role lookup failures', async () => {
    const error = new Error('Firestore unavailable');
    userDataService.getRoleRecord.mockRejectedValue(error);

    await expect(roleService.loadCurrentRole()).rejects.toBe(error);
  });
});
