import {
  ChangeDetectionStrategy,
  Component,
  inject,
  isDevMode,
  OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IdeaLoaderComponent } from '../../../shared/components/idea-loader/idea-loader.component';
import { AuthService } from '../../../core/services/auth.service';
import { CollaborationService } from '../../../core/services/collaboration.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserDataService } from '../../../core/services/user-data.service';
import type {
  AcceptedCollaborator,
  CollaborationOverview,
  CollaborationProfile,
  CollaborationRequestView,
} from '../../../shared/models/collaboration.model';
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
  private readonly collaborationService = inject(CollaborationService);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);
  private readonly userDataService = inject(UserDataService);
  private currentUser: User | null = null;

  protected readonly isLoading = signal(true);
  protected readonly fullName = signal('');
  protected readonly loadError = signal<string | null>(null);
  protected readonly isCollaborationLoading = signal(false);
  protected readonly isCollaborationBusy = signal(false);
  protected readonly collaborationError = signal<string | null>(null);
  protected readonly isDiscoverable = signal(false);
  protected readonly searchTerm = signal('');
  protected readonly hasSearched = signal(false);
  protected readonly isSearching = signal(false);
  protected readonly searchResults = signal<CollaborationProfile[]>([]);
  protected readonly incomingRequests = signal<CollaborationRequestView[]>([]);
  protected readonly outgoingRequests = signal<CollaborationRequestView[]>([]);
  protected readonly collaborators = signal<AcceptedCollaborator[]>([]);

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

      this.currentUser = user;
      this.fullName.set(user.fullName.trim() || authUser.displayName?.trim() || 'there');
      await this.loadCollaboration(user);
    } catch {
      this.loadError.set('We could not load your dashboard. Check your connection and try again.');
      this.toastService.error(
        'We could not load your dashboard. Check your connection and try again.',
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  protected setSearchTerm(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.searchTerm.set(target.value);
    }
  }

  protected async searchDirectory(event: Event): Promise<void> {
    event.preventDefault();
    const uid = this.currentUser?.uid;
    if (!uid) {
      return;
    }

    this.isSearching.set(true);
    this.collaborationError.set(null);
    this.hasSearched.set(true);
    try {
      this.searchResults.set(
        await this.collaborationService.searchDirectory(uid, this.searchTerm()),
      );
    } catch (error: unknown) {
      if (
        isDevMode() &&
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string'
      ) {
        console.error('[UserDashboardComponent] Directory search failed:', error.code);
      }
      this.collaborationError.set('We could not search the member directory. Please try again.');
      this.toastService.error('We could not search the member directory. Please try again.');
    } finally {
      this.isSearching.set(false);
    }
  }

  protected async setDirectoryVisibility(event: Event): Promise<void> {
    const target = event.target;
    if (target instanceof HTMLInputElement && this.currentUser) {
      await this.updateDirectoryVisibility(target.checked);
    }
  }

  protected requestState(profile: CollaborationProfile): 'connected' | 'sent' | 'received' | null {
    if (this.collaborators().some((collaborator) => collaborator.uid === profile.uid)) {
      return 'connected';
    }
    if (this.outgoingRequests().some((entry) => entry.request.recipientUid === profile.uid)) {
      return 'sent';
    }
    if (this.incomingRequests().some((entry) => entry.request.senderUid === profile.uid)) {
      return 'received';
    }
    return null;
  }

  protected async sendRequest(profile: CollaborationProfile): Promise<void> {
    const uid = this.currentUser?.uid;
    if (!uid) {
      return;
    }
    await this.performCollaborationAction(
      () => this.collaborationService.sendRequest(uid, profile.uid),
      'Your collaboration request was sent.',
      'We could not send the collaboration request. Please try again.',
    );
  }

  protected async respondToRequest(
    entry: CollaborationRequestView,
    status: 'accepted' | 'declined',
  ): Promise<void> {
    await this.performCollaborationAction(
      () => this.collaborationService.respondToRequest(entry.request, status),
      status === 'accepted' ? 'Collaboration request accepted.' : 'Collaboration request declined.',
      'We could not update that collaboration request. Please try again.',
    );
  }

  protected async cancelRequest(entry: CollaborationRequestView): Promise<void> {
    await this.performCollaborationAction(
      () => this.collaborationService.cancelRequest(entry.request.id),
      'Collaboration request cancelled.',
      'We could not cancel that collaboration request. Please try again.',
    );
  }

  private async loadCollaboration(user: User): Promise<void> {
    this.isCollaborationLoading.set(true);
    this.collaborationError.set(null);
    try {
      const overview = await this.collaborationService.getOverview(user.uid);
      this.applyOverview(overview);
      if (overview.ownProfile) {
        try {
          await this.collaborationService.syncDiscoverableProfile(user.uid, user);
        } catch {
          this.collaborationError.set(
            'We could not refresh your public name and profession. You can still update your directory preference.',
          );
          this.toastService.error(
            'We could not refresh your public name and profession. You can still update your directory preference.',
          );
        }
      }
    } catch {
      this.collaborationError.set(
        'Collaboration tools are unavailable right now. You can try again shortly.',
      );
      this.toastService.error(
        'Collaboration tools are unavailable right now. You can try again shortly.',
      );
    } finally {
      this.isCollaborationLoading.set(false);
    }
  }

  private async updateDirectoryVisibility(discoverable: boolean): Promise<void> {
    if (!this.currentUser) {
      return;
    }
    this.isCollaborationBusy.set(true);
    this.collaborationError.set(null);
    try {
      await this.collaborationService.setDiscoverable(
        this.currentUser.uid,
        this.currentUser,
        discoverable,
      );
      this.isDiscoverable.set(discoverable);
      if (!discoverable) {
        this.searchResults.set([]);
        this.hasSearched.set(false);
      }
      this.toastService.success(
        discoverable
          ? 'Your name and profession are now visible in the member directory.'
          : 'Your profile has been removed from the member directory.',
      );
      await this.refreshOverview();
    } catch (error) {
      const message =
        error instanceof Error &&
        error.message ===
          'Add a valid name and profession to your profile before becoming discoverable.'
          ? error.message
          : 'We could not update your directory preferences. Please try again.';
      this.collaborationError.set(message);
      this.toastService.error(message);
    } finally {
      this.isCollaborationBusy.set(false);
    }
  }

  private async performCollaborationAction(
    action: () => Promise<void>,
    successMessage: string,
    errorMessage: string,
  ): Promise<void> {
    if (this.isCollaborationBusy()) {
      return;
    }
    this.isCollaborationBusy.set(true);
    this.collaborationError.set(null);
    try {
      await action();
      this.toastService.success(successMessage);
      await this.refreshOverview();
    } catch {
      this.collaborationError.set(errorMessage);
      this.toastService.error(errorMessage);
    } finally {
      this.isCollaborationBusy.set(false);
    }
  }

  private async refreshOverview(): Promise<void> {
    const uid = this.currentUser?.uid;
    if (!uid) {
      return;
    }
    this.isCollaborationLoading.set(true);
    try {
      this.applyOverview(await this.collaborationService.getOverview(uid));
    } catch {
      this.collaborationError.set(
        'Your action was saved, but we could not refresh collaboration details. Please try again.',
      );
      this.toastService.error(
        'Your action was saved, but we could not refresh collaboration details. Please try again.',
      );
    } finally {
      this.isCollaborationLoading.set(false);
    }
  }

  private applyOverview(overview: CollaborationOverview): void {
    this.isDiscoverable.set(overview.ownProfile !== null);
    this.incomingRequests.set(overview.incomingRequests);
    this.outgoingRequests.set(overview.outgoingRequests);
    this.collaborators.set(overview.collaborators);
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
