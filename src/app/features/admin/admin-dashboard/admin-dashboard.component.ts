import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NgFor } from '@angular/common';
import { DestroyRef } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent {
  private readonly sanitizer = inject(DomSanitizer);
  readonly sidebarOpen = signal(true);
  readonly notificationCount = signal<number>(0);

  readonly navigation = [
    {
      label: 'Overview',
      path: '/admin/overview',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12.5h7V4H4zm9 7.5h7V11h-7zm0-16v7h7V4zm-9 9h7v7H4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    },
    {
      label: 'Users',
      path: '/admin/users',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5 8c.8-2.2 2.8-3.5 5-3.5s4.2 1.3 5 3.5M16.5 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm2.5 9c-.6-2-2-3.2-4.2-3.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    },
    {
      label: 'Staff activity',
      path: '/admin/staff-activity',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 18c1.1-2.4 3-3.6 5.5-3.6S9.3 15.6 12 18M7.5 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm9.5 2a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4Zm-2.1 8.2c.9-1.9 2.5-3.1 4.5-3.1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    },
    // {
    //   label: 'Tickets',
    //   path: '/admin/tickets',
    //   icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 4h16v16H4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    // },
    {
      label: 'Ideas',
      path: '/admin/ideas',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 5 9.5l-1.2 1.4a4 4 0 0 0-.8 2.1V17H9v-1c0-.8-.3-1.6-.8-2.1L7 12.5A6 6 0 0 1 12 3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    },
    {
      label: 'Stages',
      path: '/admin/stages',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 17h16M7 7h10M7 12h10M7 4v16M17 4v16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    },
    {
      label: 'Forms',
      path: '/admin/forms',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 4h9l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm9 0v4h4M8 11h8M8 15h8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    },
    {
      label: 'Content',
      path: '/admin/content',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5.5h14v13H5zm2 3h10M7 11.5h10M7 15.5h7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    },
    {
      label: 'Audit log',
      path: '/admin/audit-log',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 9.5h10M7 14.5h6M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm4 4.5 2 2 4-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    },
    {
      label: 'Settings',
      path: '/admin/settings',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3.8v2.2m0 14v2.2M4.8 12h2.2m14 0h-2.2M6.9 6.9l1.6 1.6m7 7l1.6 1.6M17.1 6.9l-1.6 1.6m-7 7-1.6 1.6M12 8.5A3.5 3.5 0 1 1 12 15.5 3.5 3.5 0 0 1 12 8.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    },
  ];

  safeIcon(icon: string) {
    return this.sanitizer.bypassSecurityTrustHtml(icon);
  }
  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }
}
