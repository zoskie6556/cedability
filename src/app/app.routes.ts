import { Routes } from '@angular/router';
<<<<<<< HEAD
import { adminGuard } from './core/guards/admin.guard';
=======
import { dashboardRedirectGuard } from './core/guards/dashboard-redirect.guard';
import { roleGuard } from './core/guards/role.guard';
>>>>>>> 65eedde6ea6ed75d8ef3a93b55c4ac03ca0a8c0a

/**
 * Root routes for CEDAbility.
 *
 * RULE: this file only lazy-loads each feature. Page-level routes live in
 * each feature's own routes file (features/<name>/<name>.routes.ts), so teammates
 * rarely need to touch this file and merge conflicts stay minimal.
 *
 * Example URLs:
 *   /account/user/login
 *   /account/user/create-account
 *   /account/user/profile
 *   /submissions/idea
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadChildren: () => import('./features/home/home.routes').then(m => m.HOME_ROUTES),
  },
  {
    path: 'about',
    loadChildren: () => import('./features/about/about.routes').then(m => m.ABOUT_ROUTES),
  },

  {
    path: 'account',
    loadChildren: () => import('./features/account/account.routes').then(m => m.ACCOUNT_ROUTES),
  },
  {
    path: 'dashboard',
    canActivate: [dashboardRedirectGuard],
    loadComponent: () =>
      import('./features/account/user-dashboard/user-dashboard.component').then(
        (m) => m.UserDashboardComponent,
      ),
  },
  {
    path: 'submissions',
    canActivate: [roleGuard('user')],
    loadChildren: () => import('./features/submissions/submissions.routes').then(m => m.SUBMISSIONS_ROUTES),
  },
  {
    path: 'evaluation',
    canActivate: [roleGuard('evaluator')],
    loadChildren: () => import('./features/evaluation/evaluation.routes').then(m => m.EVALUATION_ROUTES),
  },
  {
    path: 'tracking',
    loadChildren: () => import('./features/tracking/tracking.routes').then(m => m.TRACKING_ROUTES),
  },
  {
    path: 'chat',
    loadChildren: () => import('./features/chat/chat.routes').then(m => m.CHAT_ROUTES),
  },
  // {
  //   path: 'admin',
  //   canActivate: [adminGuard],
  //   loadChildren: () => import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES),
  // },
  {
    path: 'admin',
<<<<<<< HEAD
    // canActivate: [adminGuard],
=======
    canActivate: [roleGuard('admin')],
>>>>>>> 65eedde6ea6ed75d8ef3a93b55c4ac03ca0a8c0a
    loadChildren: () => import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES),
  },
  {
    path: 'reporting',
    loadChildren: () => import('./features/reporting/reporting.routes').then(m => m.REPORTING_ROUTES),
  },
  {
    path: 'accessibility',
    loadChildren: () =>
      import('./features/accessibility/accessibility.routes').then(m => m.ACCESSIBILITY_ROUTES),
  },

  { path: '**', redirectTo: '' },
];