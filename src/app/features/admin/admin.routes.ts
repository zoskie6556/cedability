import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';

export const ADMIN_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'admin-dashboard' },
  {
    path: 'admin-dashboard',
    title: 'Admin Dashboard',
    canActivate: [roleGuard('admin')],
    loadComponent: () => import('./admin-dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent),
  },
];
