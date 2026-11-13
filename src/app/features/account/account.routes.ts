import { Routes } from '@angular/router';

export const ACCOUNT_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'user/login' },
  {
    path: 'user',
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'login' },
      {
        path: 'login',
        title: 'Log in',
        loadComponent: () => import('./user/login/login.component').then(m => m.LoginComponent),
      },
      {
        path: 'create-account',
        title: 'Create account',
        loadComponent: () =>
          import('./user/create-account/create-account.component').then(m => m.CreateAccountComponent),
      },
      {
        path: 'forgot-password',
        title: 'Forgot password',
        loadComponent: () =>
          import('./user/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent),
      },
      {
        path: 'verify',
        title: 'Verify account',
        loadComponent: () => import('./user/verify/verify.component').then(m => m.VerifyComponent),
      },
      {
        // URL: /account/user/profile  (component lives in account/profile/)
        path: 'profile',
        title: 'My profile',
        loadComponent: () => import('./profile/profile.component').then(m => m.ProfileComponent),
      },
    ],
  },
];
