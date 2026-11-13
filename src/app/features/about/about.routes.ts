import { Routes } from '@angular/router';

export const ABOUT_ROUTES: Routes = [
  {
    path: '',
    title: 'About Cedability',
    loadComponent: () => import('./about.component').then(m => m.AboutComponent),
  },
];
