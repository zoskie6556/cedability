import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';

export const REPORTING_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'reports' },
  {
    path: 'reports',
    title: 'Reports',
    canActivate: [roleGuard(['admin', 'adjudicator'])],
    loadComponent: () => import('./reports/reports.component').then(m => m.ReportsComponent),
  },
];
