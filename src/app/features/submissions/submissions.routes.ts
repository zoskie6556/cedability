import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getStorage, provideStorage } from '@angular/fire/storage';
import { AuthService } from '../../core/services/auth.service';
import { UserDataService } from '../../core/services/user-data.service';

export const SUBMISSIONS_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'idea' },
  {
    path: 'idea',
    title: 'Submit an idea',
    providers: [
      provideFirestore(() => getFirestore(inject(FirebaseApp))),
      provideStorage(() => getStorage(inject(FirebaseApp))),
      AuthService,
      UserDataService,
    ],
    loadComponent: () => import('./idea/idea.component').then(m => m.IdeaComponent),
  },
];
