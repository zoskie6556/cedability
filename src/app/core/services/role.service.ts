import { inject, Injectable } from '@angular/core';
import { isUserRole, UserRole } from '../models/user-role';
import { AuthService } from './auth.service';
import { UserDataService } from './user-data.service';

export type UserRoleResult =
  | { status: 'unauthenticated' }
  | { status: 'unassigned' }
  | { status: 'invalid' }
  | { status: 'assigned'; role: UserRole };

@Injectable({ providedIn: 'root' })
export class RoleService {
  private readonly authService = inject(AuthService);
  private readonly userDataService = inject(UserDataService);

  async loadCurrentRole(): Promise<UserRoleResult> {
    const user = await this.authService.getCurrentUser();
    if (!user) {
      return { status: 'unauthenticated' };
    }

    const roleRecord = await this.userDataService.getRoleRecord(user.uid);
    if (!roleRecord.exists) {
      return { status: 'unassigned' };
    }

    const role = roleRecord.role;
    return isUserRole(role) ? { status: 'assigned', role } : { status: 'invalid' };
  }
}
