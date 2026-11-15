import { Routes } from '@angular/router';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard.component';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminDashboardComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      {
        path: 'overview',
        title: 'Overview',
        loadComponent: () =>
          import('./overview/overview.component').then((m) => m.OverviewComponent),
      },
      {
        path: 'users',
        title: 'Users',
        loadComponent: () => import('./users/users.component').then((m) => m.UsersComponent),
      },
      {
        path: 'staff-activity',
        title: 'Staff activity',
        loadComponent: () =>
          import('./staff-activity/staff-activity.component').then((m) => m.StaffActivityComponent),
      },
      {
        path: 'ideas',
        title: 'Ideas',
        loadComponent: () => import('./ideas/ideas.component').then((m) => m.IdeasComponent),
      },
      {
        path: 'stages',
        title: 'Stages',
        loadComponent: () => import('./stages/stages.component').then((m) => m.StagesComponent),
      },
      {
        path: 'forms',
        title: 'Forms',
        loadComponent: () => import('./forms/forms.component').then((m) => m.FormsComponent),
      },
      {
        path: 'content',
        title: 'Content',
        loadComponent: () => import('./content/content.component').then((m) => m.ContentComponent),
      },
      {
        path: 'audit-log',
        title: 'Audit log',
        loadComponent: () =>
          import('./audit-log/audit-log.component').then((m) => m.AuditLogComponent),
      },
      {
        path: 'settings',
        title: 'Settings',
        loadComponent: () =>
          import('./settings/settings.component').then((m) => m.SettingsComponent),
      },
    ],
  },
];
