import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserRole } from '../models/user-role';
import { RoleService, UserRoleResult } from '../services/role.service';
import { roleErrorUrl } from './role-routing';

export function roleGuard(requiredRole: UserRole): CanActivateFn {
  return async (_route, state) => {
    const router = inject(Router);
    let roleResult: UserRoleResult;
    try {
      roleResult = await inject(RoleService).loadCurrentRole();
    } catch {
      return roleErrorUrl(router, 'unavailable');
    }

    if (roleResult.status === 'unauthenticated') {
      return router.createUrlTree(['/account/user/login'], {
        queryParams: { returnUrl: state.url },
      });
    }

    if (roleResult.status === 'assigned') {
      return roleResult.role === requiredRole ? true : router.parseUrl('/dashboard');
    }

    return roleErrorUrl(router, roleResult.status);
  };
}
