import { Routes } from '@angular/router';

export const EVALUATION_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'review' },
  {
    path: 'review',
    title: 'Evaluation',
    loadComponent: () => import('./review/review.component').then(m => m.ReviewComponent),
  },
];
