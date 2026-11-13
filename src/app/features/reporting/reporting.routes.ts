import { Routes } from '@angular/router';

export const REPORTING_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'reports' },
  {
    path: 'reports',
    title: 'Reports',
    loadComponent: () => import('./reports/reports.component').then(m => m.ReportsComponent),
  },
];
