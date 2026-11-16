import { Router, UrlTree } from '@angular/router';
import type { UserRole } from '../models/user-role';

export type RoleResolutionError = 'unassigned' | 'invalid' | 'unavailable';

export function roleDashboardPath(role: UserRole): string {
  switch (role) {
    case 'user':
    case 'submitter':
      return '/account/user/dashboard';
    case 'evaluator':
      return '/evaluation/review';
    case 'admin':
      return '/admin/admin-dashboard';
  }
}

export function roleErrorUrl(router: Router, error: RoleResolutionError): UrlTree {
  return router.createUrlTree(['/account/user/login'], {
    queryParams: { roleError: error },
  });
}
