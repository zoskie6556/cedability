import { Routes } from '@angular/router';

export const TRACKING_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'status' },
  {
    path: 'status',
    title: 'Submission status',
    loadComponent: () => import('./status/status.component').then(m => m.StatusComponent),
  },
];
