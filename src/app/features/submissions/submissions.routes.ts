import { Routes } from '@angular/router';

export const SUBMISSIONS_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'idea' },
  {
    path: 'idea',
    title: 'Submit an idea',
    loadComponent: () => import('./idea/idea.component').then(m => m.IdeaComponent),
  },
];
