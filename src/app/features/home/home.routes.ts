import { Routes } from '@angular/router';

export const HOME_ROUTES: Routes = [
  {
    path: '',
    title: 'Home',
    loadComponent: () => import('./home.component').then(m => m.HomeComponent),
  },
];
