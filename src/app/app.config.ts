import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideAnalytics } from '@angular/fire/analytics';
import { provideFirebaseApp } from '@angular/fire/app';
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
    provideAnalytics(() => getAnalytics()),
  ],
};
