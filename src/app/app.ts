import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  Injector,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Auth, authState } from '@angular/fire/auth';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { ToastService } from './core/services/toast.service';
import { ToastOutletComponent } from './shared/components/toast-outlet/toast-outlet.component';
import { ChatWidgetComponent } from './shared/components/chat-widget/chat-widget.component';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ToastOutletComponent, ChatWidgetComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'handleDocumentClick($event)',
    '(document:focusin)': 'handleDocumentFocus($event)',
    '(document:keydown)': 'handleDocumentKeydown($event)',
  },
})
export class App {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);
  private readonly auth = inject(Auth);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);

  protected readonly authUser = toSignal(authState(this.auth), { initialValue: undefined });
  protected readonly authStateReady = computed(() => this.authUser() !== undefined);
  protected readonly mobileMenuOpen = signal(false);
  protected readonly profileMenuOpen = signal(false);
  protected readonly isLoggingOut = signal(false);
  // Visual only for now: the language toggle does not translate anything yet.
  protected readonly language = signal<'tn' | 'en'>('en');
  private readonly closeProfileMenuOnSignOut = effect(() => {
    if (this.authUser() === null) {
      this.profileMenuOpen.set(false);
    }
  });

  @ViewChild('profileMenuTrigger') private profileMenuTrigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('profileAccountMenu') private profileAccountMenu?: ElementRef<HTMLDivElement>;

  protected toggleMobileMenu(): void {
    this.mobileMenuOpen.update((isOpen) => !isOpen);
  }

  protected closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  protected setLanguage(language: 'tn' | 'en'): void {
    this.language.set(language);
  }

  protected toggleProfileMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.profileMenuOpen.update((isOpen) => !isOpen);
  }

  protected handleProfileTriggerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }

    event.preventDefault();
    this.profileMenuOpen.set(true);
    afterNextRender(
      () => this.focusProfileMenuItem(event.key === 'ArrowUp' ? -1 : 0),
      { injector: this.injector },
    );
  }

  protected closeProfileMenu(restoreFocus = false): void {
    if (!this.profileMenuOpen()) {
      return;
    }

    this.profileMenuOpen.set(false);
    if (restoreFocus) {
      queueMicrotask(() => this.profileMenuTrigger?.nativeElement.focus());
    }
  }

  protected handleDocumentClick(event: MouseEvent): void {
    if (this.profileMenuOpen() && !this.isInsideProfileMenu(event.target)) {
      this.closeProfileMenu();
    }
  }

  protected handleDocumentFocus(event: FocusEvent): void {
    if (this.profileMenuOpen() && !this.isInsideProfileMenu(event.target)) {
      this.closeProfileMenu();
    }
  }

  protected handleDocumentKeydown(event: KeyboardEvent): void {
    if (!this.profileMenuOpen()) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeProfileMenu(true);
      return;
    }

    const menu = this.profileAccountMenu?.nativeElement;
    if (!menu || !(event.target instanceof Node) || !menu.contains(event.target)) {
      return;
    }

    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const currentIndex = items.indexOf(this.elementRef.nativeElement.ownerDocument.activeElement as HTMLElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
      items[nextIndex]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const previousIndex =
        currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
      items[previousIndex]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items.at(-1)?.focus();
    }
  }

  protected async logout(): Promise<void> {
    if (this.isLoggingOut()) {
      return;
    }

    this.closeProfileMenu();
    this.isLoggingOut.set(true);

    try {
      try {
        await this.authService.signOut();
      } catch {
        this.toastService.error('Unable to log out right now. Please try again.');
        return;
      }

      this.closeMobileMenu();

      try {
        const navigated = await this.router.navigateByUrl('/account/user/login');
        if (!navigated) {
          this.toastService.error('You have been logged out, but the login page could not be opened.');
          return;
        }
        this.toastService.success('You have been logged out.');
      } catch {
        this.toastService.error('You have been logged out, but the login page could not be opened.');
      }
    } finally {
      this.isLoggingOut.set(false);
    }
  }

  private isInsideProfileMenu(target: EventTarget | null): boolean {
    const container = this.elementRef.nativeElement.querySelector('.profile-menu-container');
    return target instanceof Node && container?.contains(target) === true;
  }

  private focusProfileMenuItem(index: number): void {
    const items =
      this.profileAccountMenu?.nativeElement.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (!items?.length) {
      return;
    }

    items[index < 0 ? items.length - 1 : index]?.focus();
  }
}