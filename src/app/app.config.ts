import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideAnalytics } from '@angular/fire/analytics';
import { FirebaseApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getFunctions, provideFunctions } from '@angular/fire/functions';
import { getStorage, provideStorage } from '@angular/fire/storage';

import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { getAnalytics } from 'firebase/analytics';
import { initializeApp } from 'firebase/app';

import { routes } from './app.routes';
import { firebaseConfig } from './core/firebase/firebase.config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withInMemoryScrolling({ anchorScrolling: 'enabled' })),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideAuth(() => getAuth(inject(FirebaseApp))),
    provideFirestore(() => getFirestore(inject(FirebaseApp))),
    provideFunctions(() => getFunctions(inject(FirebaseApp))),
    provideAnalytics(() => getAnalytics()),
    provideStorage(() => getStorage(inject(FirebaseApp))),
  ],
};
