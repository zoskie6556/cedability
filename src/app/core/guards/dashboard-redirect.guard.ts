import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { RoleService, UserRoleResult } from '../services/role.service';
import { roleDashboardPath, roleErrorUrl } from './role-routing';

export const dashboardRedirectGuard: CanActivateFn = async (_route, state) => {
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
    return router.parseUrl(roleDashboardPath(roleResult.role));
  }

  return roleErrorUrl(router, roleResult.status);
};
