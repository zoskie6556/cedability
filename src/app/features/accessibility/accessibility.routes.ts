import { Routes } from '@angular/router';

export const ACCESSIBILITY_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'voice-settings' },
  {
    path: 'voice-settings',
    title: 'Accessibility',
    loadComponent: () => import('./voice-settings/voice-settings.component').then(m => m.VoiceSettingsComponent),
  },
];
