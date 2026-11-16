import { inject, Injectable } from '@angular/core';
import { collection, Firestore, getDocs, orderBy, query, Timestamp } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import type { EvaluatorType } from '../../shared/models/idea-evaluation.model';
import { AdminUser, AdminUserRole } from '../../features/admin/models/admin-user.model';

interface CreateUserRequest {
  displayName: string;
  email: string;
  phone?: string;
  role: AdminUserRole;
  evaluatorType?: EvaluatorType;
  organization?: string;
}

interface UpdateRoleRequest {
  uid: string;
  role: AdminUserRole;
}

interface ToggleUserRequest {
  uid: string;
  isActive: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminUserService {
  private readonly firestore = inject(Firestore);
  private readonly functions = inject(Functions);

  async loadUsers(): Promise<AdminUser[]> {
    console.log('[AdminUserService] loading users from Firestore');

    try {
      const userQuery = query(collection(this.firestore, 'users'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(userQuery);
      const users = snapshot.docs.map((document) => this.mapUser(document.id, document.data()));

      console.log('[AdminUserService] users loaded', {
        count: users.length,
        ids: snapshot.docs.map((document) => document.id),
      });

      return users;
    } catch (error) {
      console.error('[AdminUserService] failed to load users', error);
      throw error;
    }
  }

  async createUser(input: CreateUserRequest): Promise<{ uid: string; email: string; link: string }> {
    const callable = httpsCallable<CreateUserRequest, { uid: string; email: string; link: string }>(
      this.functions,
      'createUserAccount',
    );

    const response = await callable(input);
    return response.data;
  }

  async updateRole(uid: string, role: AdminUserRole): Promise<void> {
    const callable = httpsCallable<UpdateRoleRequest, { uid: string; role: AdminUserRole }>(
      this.functions,
      'setUserRole',
    );

    await callable({ uid, role });
  }

  async toggleStatus(uid: string, isActive: boolean): Promise<void> {
    const callable = httpsCallable<ToggleUserRequest, { uid: string; isActive: boolean }>(
      this.functions,
      'setUserActive',
    );

    await callable({ uid, isActive });
  }

  async resendInvite(uid: string): Promise<void> {
    const callable = httpsCallable<{ uid: string }, { uid: string; link: string }>(this.functions, 'resendInvite');
    await callable({ uid });
  }

  async deleteUser(uid: string): Promise<void> {
    const callable = httpsCallable<{ uid: string }, { uid: string; deleted: boolean }>(
      this.functions,
      'deleteUserAccount',
    );

    await callable({ uid });
  }

  private mapUser(uid: string, data: Record<string, unknown>): AdminUser {
    const role = this.normaliseRole(data['role']);
    const isActive = data['isActive'] !== false;
    const rawName = data['fullName'] ?? data['displayName'];
    const name = typeof rawName === 'string' && rawName.trim() ? rawName : 'Unknown user';
    const email = typeof data['email'] === 'string' ? data['email'] : `${uid}@unknown.local`;
    const phone = typeof data['phone'] === 'string' && data['phone'].trim() ? data['phone'] : undefined;

    return {
      id: uid,
      name,
      email,
      phone,
      role,
      evaluatorType:
        role === 'evaluator'
          ? data['evaluatorType'] === 'external'
            ? 'external'
            : 'internal'
          : null,
      organization: typeof data['organization'] === 'string' ? data['organization'] : null,
      status: isActive ? 'active' : 'disabled',
      emailVerified: Boolean(data['emailVerified']),
      createdAt: this.formatDate(data['createdAt']),
      lastActive: this.formatDate(data['updatedAt'] ?? data['lastActive']),
    };
  }

  private normaliseRole(role: unknown): AdminUserRole {
    if (role === 'submitter' || role === 'evaluator' || role === 'adjudicator' || role === 'agent' || role === 'admin') {
      return role;
    }

    return 'submitter';
  }

  private formatDate(value: unknown): string {
    if (value instanceof Timestamp) {
      return value.toDate().toLocaleDateString();
    }

    if (value && typeof value === 'object') {
      const timestampLike = value as { toDate?: () => Date };
      if (typeof timestampLike.toDate === 'function') {
        return timestampLike.toDate().toLocaleDateString();
      }
    }

    if (typeof value === 'string' && value.trim()) {
      return value;
    }

    return '—';
  }
}
