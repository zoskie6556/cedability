import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserRole } from '../models/user-role';
import { RoleService } from '../services/role.service';

export function roleGuard(requiredRole: UserRole): CanActivateFn {
  return async (_route, state) => {
    const router = inject(Router);
    const roleResult = await inject(RoleService).loadCurrentRole();

    if (roleResult.status === 'unauthenticated') {
      return router.createUrlTree(['/account/user/login'], {
        queryParams: { returnUrl: state.url },
      });
    }

    return roleResult.status === 'assigned' && roleResult.role === requiredRole;
  };
}
