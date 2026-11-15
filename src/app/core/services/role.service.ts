import { inject, Injectable } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import { firstValueFrom, take } from 'rxjs';
import { isUserRole, UserRole } from '../models/user-role';

export type UserRoleResult =
  | { status: 'unauthenticated' }
  | { status: 'unassigned' }
  | { status: 'invalid' }
  | { status: 'assigned'; role: UserRole };

@Injectable({ providedIn: 'root' })
export class RoleService {
  private readonly auth = inject(Auth);

  async loadCurrentRole(forceRefresh = false): Promise<UserRoleResult> {
    const user = await firstValueFrom(authState(this.auth).pipe(take(1)));
    if (!user) {
      return { status: 'unauthenticated' };
    }

    const token = await user.getIdTokenResult(forceRefresh);
    if (!Object.hasOwn(token.claims, 'role')) {
      return { status: 'unassigned' };
    }

    const role = token.claims['role'];
    return isUserRole(role) ? { status: 'assigned', role } : { status: 'invalid' };
  }
}
