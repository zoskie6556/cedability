import { inject } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';
import { AuthService } from '../../core/services/auth.service';
import { UserDataService } from '../../core/services/user-data.service';

const evaluationProviders = [
  provideFirestore(() => getFirestore(inject(FirebaseApp))),
  AuthService,
  UserDataService,
];

export const EVALUATION_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'worklist' },
  { path: 'review', pathMatch: 'full', redirectTo: 'worklist' },
  {
    path: 'worklist',
    title: 'Evaluator Worklist',
    canActivate: [roleGuard('evaluator')],
    providers: evaluationProviders,
    loadComponent: () =>
      import('./evaluator-worklist/evaluator-worklist.component').then(
        (module) => module.EvaluatorWorklistComponent,
      ),
  },
  {
    path: 'adjudication',
    title: 'Adjudication',
    canActivate: [roleGuard(['adjudicator', 'admin'])],
    providers: evaluationProviders,
    loadComponent: () =>
      import('./adjudication/adjudication.component').then(
        (module) => module.AdjudicationComponent,
      ),
  },
  {
    path: ':assignmentId',
    title: 'Evaluate Idea',
    canActivate: [roleGuard('evaluator')],
    providers: evaluationProviders,
    loadComponent: () =>
      import('./evaluate-idea/evaluate-idea.component').then(
        (module) => module.EvaluateIdeaComponent,
      ),
  },
];
