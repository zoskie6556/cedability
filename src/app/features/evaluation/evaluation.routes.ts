import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { AuthService } from '../../core/services/auth.service';
import { UserDataService } from '../../core/services/user-data.service';

export const EVALUATION_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'review' },
  {
    path: 'review',
    title: 'Evaluation',
    providers: [
      provideFirestore(() => getFirestore(inject(FirebaseApp))),
      AuthService,
      UserDataService,
    ],
    loadComponent: () => import('./review/review.component').then(m => m.ReviewComponent),
  },
];
