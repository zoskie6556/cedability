import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { collection, Firestore, getCountFromServer, query, where } from '@angular/fire/firestore';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminUserService } from '../../../core/services/admin-user.service';
import { IdeaLoaderComponent } from '../../../shared/components/idea-loader/idea-loader.component';
import { AdminUser, AdminUserRole } from '../models/admin-user.model';

export type UserRole = AdminUserRole;
export type UserStatus = 'active' | 'disabled';

export interface UserSubscriptionInfo {
  planName: string;
  status: string;
  renewalDate: string;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  defaultPassword?: string;
  requirePasswordChange?: boolean;
}

export const DEFAULT_STAFF_PASSWORD = 'AdminOps@Ability';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IdeaLoaderComponent],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly adminUserService = inject(AdminUserService);
  private readonly firestore = inject(Firestore);

  readonly users = signal<AdminUser[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly searchTerm = signal<string>('');
  readonly roleFilter = signal<string>('all');
  readonly creatingUser = signal<boolean>(false);

  readonly pageSize = 10;
  readonly currentPage = signal<number>(1);
  readonly selectedUserId = signal<string | null>(null);
  readonly isCreateModalOpen = signal<boolean>(false);
  readonly isEditingUser = signal<boolean>(false);

  // Cache of "Ideas Shared" counts keyed by userId
  private readonly ideasCountCache = signal<Record<string, number>>({});
  readonly isLoadingIdeasCount = signal<boolean>(false);

  // Placeholder subscription state keyed by userId (not pulled from DB yet)
  private readonly subscriptionOverrides = signal<Record<string, UserSubscriptionInfo>>({});

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    role: ['submitter' as UserRole, [Validators.required]],
    defaultPassword: [''],
  });

  readonly editUserForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    phone: [''],
    role: ['submitter' as UserRole, [Validators.required]],
    subscriptionPlan: ['Standard'],
    subscriptionStatus: ['Not synced'],
    subscriptionRenewal: ['—'],
  });

  private readonly selectedFormRole = toSignal(this.form.controls.role.valueChanges, {
    initialValue: this.form.controls.role.value,
  });

  readonly requiresDefaultPassword = computed(() => {
    const role = this.selectedFormRole();
    return !!role && role !== 'submitter';
  });

  readonly filteredUsers = computed(() => {
    const queryText = this.searchTerm().trim().toLowerCase();
    const role = this.roleFilter();

    return this.users().filter((user) => {
      const matchesRole = role === 'all' || user.role === role;
      const matchesQuery =
        !queryText ||
        (user.name ?? '').toLowerCase().includes(queryText) ||
        (user.email ?? '').toLowerCase().includes(queryText);

      return matchesRole && matchesQuery;
    });
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredUsers().length / this.pageSize))
  );

  readonly paginatedUsers = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const start = (page - 1) * this.pageSize;
    return this.filteredUsers().slice(start, start + this.pageSize);
  });

  readonly pageNumbers = computed(() =>
    Array.from({ length: this.totalPages() }, (_, index) => index + 1)
  );

  readonly selectedUser = computed(() => {
    const id = this.selectedUserId();
    if (!id) return null;
    return this.users().find((user) => user.id === id) ?? null;
  });

  readonly selectedUserIdeasCount = computed<number | null>(() => {
    const user = this.selectedUser();
    if (!user) return null;
    const count = this.ideasCountCache()[user.id];
    return typeof count === 'number' ? count : null;
  });

  readonly selectedUserSubscription = computed<UserSubscriptionInfo>(() => {
    const user = this.selectedUser();
    if (!user) {
      return { planName: '—', status: 'Not synced', renewalDate: '—' };
    }
    return (
      this.subscriptionOverrides()[user.id] ?? {
        planName: 'None',
        status: 'Pending DB integration',
        renewalDate: '—',
      }
    );
  });

  constructor() {
    effect(() => {
      const needsDefault = this.requiresDefaultPassword();
      const passwordControl = this.form.controls.defaultPassword;

      if (needsDefault) {
        if (!passwordControl.value) {
          passwordControl.setValue(DEFAULT_STAFF_PASSWORD);
        }
      } else {
        passwordControl.setValue('');
      }
    });

    // Whenever a user modal opens, load the "Ideas Shared" count where ownerId == user.id
    effect(() => {
      const user = this.selectedUser();
      if (user) {
        void this.fetchIdeasCountForUser(user.id);
      }
    });
  }

  ngOnInit(): void {
    void this.loadUsers();
  }

  async loadUsers(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const loadedUsers = await this.adminUserService.loadUsers();
      this.users.set(loadedUsers);
    } catch (error) {
      console.error('[UsersComponent] failed to load users', error);
      this.errorMessage.set('Failed to load users. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async fetchIdeasCountForUser(ownerId: string, forceRefresh = false): Promise<void> {
    if (!ownerId) return;
    if (!forceRefresh && typeof this.ideasCountCache()[ownerId] === 'number') {
      return;
    }

    this.isLoadingIdeasCount.set(true);
    try {
      const ideasQuery = query(
        collection(this.firestore, 'ideas'),
        where('ownerId', '==', ownerId)
      );
      const snapshot = await getCountFromServer(ideasQuery);
      const count = snapshot.data().count;

      this.ideasCountCache.update((cache) => ({
        ...cache,
        [ownerId]: count,
      }));
    } catch (error) {
      console.error('[UsersComponent] failed to count ideas for ownerId:', ownerId, error);
      this.ideasCountCache.update((cache) => ({
        ...cache,
        [ownerId]: 0,
      }));
    } finally {
      this.isLoadingIdeasCount.set(false);
    }
  }

  onSearchChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
    this.currentPage.set(1);
  }

  onRoleFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.roleFilter.set(value);
    this.currentPage.set(1);
  }

  formatRole(role: string): string {
    switch (role) {
      case 'submitter':
        return 'User';
      case 'agent':
        return 'Support team';
      case 'evaluator':
        return 'Evaluator';
      case 'adjudicator':
        return 'Adjudicator';
      case 'admin':
        return 'Admin';
      default:
        return role;
    }
  }

  applyDefaultPassword(): void {
    this.form.controls.defaultPassword.setValue(DEFAULT_STAFF_PASSWORD);
  }

  openCreateModal(): void {
    this.errorMessage.set(null);
    this.form.reset({
      name: '',
      email: '',
      phone: '',
      role: 'submitter',
      defaultPassword: '',
    });
    this.isCreateModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
  }

  openUserModal(user: AdminUser): void {
    this.isEditingUser.set(false);
    this.populateEditForm(user);
    this.selectedUserId.set(user.id);
  }

  closeUserModal(): void {
    this.isEditingUser.set(false);
    this.selectedUserId.set(null);
  }

  startEditingUser(): void {
    const user = this.selectedUser();
    if (!user) return;
    this.populateEditForm(user);
    this.isEditingUser.set(true);
  }

  cancelEditingUser(): void {
    const user = this.selectedUser();
    if (user) {
      this.populateEditForm(user);
    }
    this.isEditingUser.set(false);
  }

  private populateEditForm(user: AdminUser): void {
    const sub =
      this.subscriptionOverrides()[user.id] ?? {
        planName: 'None',
        status: 'Pending DB integration',
        renewalDate: '—',
      };

    this.editUserForm.reset({
      name: user.name ?? '',
      phone: user.phone ?? '',
      role: user.role,
      subscriptionPlan: sub.planName,
      subscriptionStatus: sub.status,
      subscriptionRenewal: sub.renewalDate,
    });
  }

  async saveUserInfo(): Promise<void> {
    const user = this.selectedUser();
    if (!user || this.editUserForm.invalid || this.isSubmitting()) {
      this.editUserForm.markAllAsTouched();
      return;
    }

    const raw = this.editUserForm.getRawValue();
    const updatedName = raw.name.trim();
    const updatedPhone = raw.phone.trim() || undefined;
    const updatedRole = raw.role;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    try {
      // Save placeholder subscription fields locally until DB integration is wired
      this.subscriptionOverrides.update((subs) => ({
        ...subs,
        [user.id]: {
          planName: raw.subscriptionPlan.trim() || 'None',
          status: raw.subscriptionStatus.trim() || 'Pending DB integration',
          renewalDate: raw.subscriptionRenewal.trim() || '—',
        },
      }));

      // Update role via service if changed
      if (updatedRole !== user.role) {
        await this.adminUserService.updateRole(user.id, updatedRole);
      }

      // Update local user list state for name, phone, and role
      this.users.update((list) =>
        list.map((item) =>
          item.id === user.id
            ? {
                ...item,
                name: updatedName,
                phone: updatedPhone,
                role: updatedRole,
              }
            : item
        )
      );

      this.isEditingUser.set(false);
    } catch (error) {
      console.error('[UsersComponent] failed to update user info', error);
      this.errorMessage.set('Failed to update user information.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async createUser(): Promise<void> {
    if (this.form.invalid || this.creatingUser()) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const trimmedName = raw.name.trim();
    const trimmedEmail = raw.email.trim();
    const trimmedPhone = raw.phone.trim();
    const isNonUserRole = raw.role !== 'submitter';
    const resolvedPassword =
      raw.defaultPassword.trim() || (isNonUserRole ? DEFAULT_STAFF_PASSWORD : '');

    this.creatingUser.set(true);
    this.errorMessage.set(null);

    try {
      await this.adminUserService.createUser({
        fullName: trimmedName,
        email: trimmedEmail,
        password: resolvedPassword,
        ...(trimmedPhone ? { phone: trimmedPhone } : {}),
        role: raw.role,
      });

      await this.loadUsers();
      this.closeCreateModal();
    } catch (error) {
      console.error('[UsersComponent] failed to create user', error);
      this.errorMessage.set('Could not create user. Please check the details and try again.');
    } finally {
      this.creatingUser.set(false);
    }
  }

  async onSubmitCreateUser(): Promise<void> {
    await this.createUser();
  }

  async changeUserRole(event: Event, user: AdminUser): Promise<void> {
    const nextRole = (event.target as HTMLSelectElement).value as UserRole;
    if (nextRole === user.role) {
      return;
    }

    const previousRole = user.role;
    this.users.update((list) =>
      list.map((item) => (item.id === user.id ? { ...item, role: nextRole } : item))
    );

    try {
      await this.adminUserService.updateRole(user.id, nextRole);
    } catch (error) {
      console.error('[UsersComponent] failed to update role', error);
      this.users.update((list) =>
        list.map((item) => (item.id === user.id ? { ...item, role: previousRole } : item))
      );
      this.errorMessage.set('Failed to update user role.');
    }
  }

  async toggleStatus(user: AdminUser): Promise<void> {
    const nextStatus: UserStatus = user.status === 'active' ? 'disabled' : 'active';
    const nextIsActive = nextStatus === 'active';
    const previousStatus = user.status;

    this.users.update((list) =>
      list.map((item) => (item.id === user.id ? { ...item, status: nextStatus } : item))
    );

    try {
      await this.adminUserService.toggleStatus(user.id, nextIsActive);
    } catch (error) {
      console.error('[UsersComponent] failed to toggle status', error);
      this.users.update((list) =>
        list.map((item) => (item.id === user.id ? { ...item, status: previousStatus } : item))
      );
      this.errorMessage.set('Failed to update user status.');
    }
  }

  async resendInvite(user: AdminUser): Promise<void> {
    this.errorMessage.set(null);

    try {
      await this.adminUserService.resendInvite(user.id);
    } catch (error) {
      console.error('[UsersComponent] failed to resend invite', error);
      this.errorMessage.set('Failed to resend invite.');
    }
  }

  async deleteUser(user: AdminUser): Promise<void> {
    this.errorMessage.set(null);

    try {
      await this.adminUserService.deleteUser(user.id);
      this.users.update((list) => list.filter((item) => item.id !== user.id));

      if (this.selectedUserId() === user.id) {
        this.closeUserModal();
      }
      if (this.currentPage() > this.totalPages()) {
        this.currentPage.set(this.totalPages());
      }
    } catch (error) {
      console.error('[UsersComponent] failed to delete user', error);
      this.errorMessage.set('Failed to delete user.');
    }
  }

  deleteUserFromModal(user: AdminUser): void {
    void this.deleteUser(user);
  }

  goToPage(page: number): void {
    const clamped = Math.min(Math.max(1, page), this.totalPages());
    this.currentPage.set(clamped);
  }

  prevPage(): void {
    this.goToPage(this.currentPage() - 1);
  }

  nextPage(): void {
    this.goToPage(this.currentPage() + 1);
  }
}