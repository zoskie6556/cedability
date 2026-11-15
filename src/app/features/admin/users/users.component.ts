import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { IdeaLoaderComponent } from '../../../shared/components/idea-loader/idea-loader.component';
import { AdminUserService } from '../../../core/services/admin-user.service';
import { ToastService } from '../../../core/services/toast.service';
import { AdminUser, AdminUserRole } from '../models/admin-user.model';

@Component({
  selector: 'app-admin-users',
  imports: [ReactiveFormsModule, IdeaLoaderComponent],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly adminUserService = inject(AdminUserService);
  private readonly toastService = inject(ToastService);

  readonly users = signal<AdminUser[]>([]);
  readonly isLoading = signal(true);
  readonly searchTerm = signal('');
  readonly roleFilter = signal<'all' | AdminUserRole>('all');

  readonly filteredUsers = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    const activeRole = this.roleFilter();

    return this.users().filter((user) => {
      const matchesRole = activeRole === 'all' || user.role === activeRole;
      const matchesQuery =
        !query ||
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query);

      return matchesRole && matchesQuery;
    });
  });

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.pattern(/^(?:\+[1-9]\d{1,14})?$/)],
    role: ['submitter' as AdminUserRole, Validators.required],
  });

  ngOnInit(): void {
    void this.loadUsers();
  }

  focusCreateForm(): void {
    this.form.controls.name.markAsTouched();
    this.form.controls.name.markAsDirty();
  }

  onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.searchTerm.set(target?.value ?? '');
  }

  onRoleFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    const value = target?.value ?? 'all';
    this.roleFilter.set(value === 'all' ? 'all' : (value as AdminUserRole));
  }

  async createUser(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.error('Please correct the highlighted account details.');
      return;
    }

    const { name, email, phone, role } = this.form.getRawValue();

    try {
      this.isLoading.set(true);
      await this.adminUserService.createUser({
        displayName: name,
        email,
        phone: phone || undefined,
        role,
      });
      this.form.reset({ role: 'submitter' as AdminUserRole });
      await this.loadUsers();
      this.toastService.success(`Created account for ${email}.`);
    } catch (error) {
      this.toastService.error(this.extractMessage(error, 'Unable to create the account.'));
    } finally {
      this.isLoading.set(false);
    }
  }

  async toggleStatus(user: AdminUser): Promise<void> {
    try {
      const nextStatus: AdminUser['status'] = user.status === 'active' ? 'disabled' : 'active';
      await this.adminUserService.toggleStatus(user.id, nextStatus === 'active');
      await this.loadUsers();
      this.toastService.success(`User ${user.name} is now ${nextStatus}.`);
    } catch (error) {
      this.toastService.error(this.extractMessage(error, 'Unable to update the user status.'));
    }
  }

  changeUserRole(event: Event, user: AdminUser): void {
    const target = event.target as HTMLSelectElement | null;
    const role = target?.value as AdminUserRole | undefined;
    if (role && role !== user.role) {
      void this.updateRole(user, role);
    }
  }

  async updateRole(user: AdminUser, role: AdminUserRole): Promise<void> {
    if (role === user.role) {
      return;
    }

    try {
      await this.adminUserService.updateRole(user.id, role);
      await this.loadUsers();
      this.toastService.success(`Updated ${user.name} to ${this.formatRole(role)}.`);
    } catch (error) {
      this.toastService.error(this.extractMessage(error, 'Unable to update the user role.'));
      await this.loadUsers();
    }
  }

  async resendInvite(user: AdminUser): Promise<void> {
    try {
      await this.adminUserService.resendInvite(user.id);
      this.toastService.success(`Invite email sent to ${user.email}.`);
    } catch (error) {
      this.toastService.error(this.extractMessage(error, 'Unable to resend the invite.'));
    }
  }

  async deleteUser(user: AdminUser): Promise<void> {
    try {
      await this.adminUserService.deleteUser(user.id);
      await this.loadUsers();
      this.toastService.success(`Deleted ${user.name}.`);
    } catch (error) {
      this.toastService.error(this.extractMessage(error, 'Unable to delete the user.'));
    }
  }

  formatRole(role: AdminUserRole): string {
    return role === 'agent'
      ? 'Support Team'
      : role.replace(/(^\w|_\w)/g, (match) => match.replace('_', ' ').toUpperCase());
  }

  private async loadUsers(): Promise<void> {
    console.log('[UsersComponent] attempting to load users');

    try {
      const users = await this.adminUserService.loadUsers();
      console.log('[UsersComponent] received users from service', users);
      this.users.set(users);
    } catch (error) {
      console.error('[UsersComponent] failed to load users', error);
      this.toastService.error(
        this.extractMessage(error, 'The user directory could not be loaded.'),
      );
      this.users.set([]);
    } finally {
      // The fix: without this the loader never goes away and the table never renders.
      this.isLoading.set(false);
    }
  }

  private extractMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return fallback;
  }
}
