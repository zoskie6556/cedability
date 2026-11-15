import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IdeaLoaderComponent } from '../../../shared/components/idea-loader/idea-loader.component';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserDataService } from '../../../core/services/user-data.service';
import type { User } from '../../../shared/models/user.model';

@Component({
  selector: 'app-user-dashboard',
  imports: [IdeaLoaderComponent, RouterLink],
  templateUrl: './user-dashboard.component.html',
  styleUrl: './user-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserDashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);
  private readonly userDataService = inject(UserDataService);

  protected readonly isLoading = signal(true);
  protected readonly fullName = signal('');
  protected readonly loadError = signal<string | null>(null);

  ngOnInit(): void {
    void this.loadDashboard();
  }

  protected async loadDashboard(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const authUser = await this.authService.getCurrentUser();
      if (!authUser) {
        await this.router.navigateByUrl('/account/user/login', { replaceUrl: true });
        return;
      }

      const user = await this.userDataService.getOrCreateUser(authUser);
      if (user.role !== 'submitter') {
        // user.role uses the richer domain role set; map the roles that have
        // a dedicated dashboard and fall back to the lightweight redirect
        // guard for any other role.
        await this.router.navigateByUrl(this.resolveDashboardPath(user.role), {
          replaceUrl: true,
        });
        return;
      }

      if (!user.profile.onboardingCompleted) {
        await this.router.navigateByUrl('/account/user/profile', { replaceUrl: true });
        return;
      }

      this.fullName.set(user.fullName.trim() || authUser.displayName?.trim() || 'there');
    } catch {
      this.loadError.set('We could not load your dashboard. Check your connection and try again.');
      this.toastService.error('We could not load your dashboard. Check your connection and try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private resolveDashboardPath(role: User['role']): string {
    switch (role) {
      case 'evaluator':
        return '/evaluation/review';
      case 'admin':
        return '/admin/admin-dashboard';
      default:
        return '/dashboard';
    }
  }
}
