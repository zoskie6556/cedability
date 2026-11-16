import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { authGuard } from '../../core/guards/auth.guard';
import { roleGuard } from '../../core/guards/role.guard';
import { AuthService } from '../../core/services/auth.service';
import { UserDataService } from '../../core/services/user-data.service';

export const ACCOUNT_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'user/login' },
  {
    path: 'user',
    providers: [
      provideFirestore(() => getFirestore(inject(FirebaseApp))),
      AuthService,
      UserDataService,
    ],
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
        path: 'change-password',
        title: 'Change password',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./user/change-password/change-password.component').then(m => m.ChangePasswordComponent),
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
      {
        path: 'dashboard',
        title: 'User Dashboard',
        canActivate: [roleGuard('submitter')],
        loadComponent: () =>
          import('./user-dashboard/user-dashboard.component').then(
            (m) => m.UserDashboardComponent,
          ),
      },
    ],
  },
];
