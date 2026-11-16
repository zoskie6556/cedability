import { Routes } from '@angular/router';
import { VoiceAccessibilityModalComponent } from './voice-accessibility-modal/voice-accessibility-modal';
import { VoiceSettingsComponent } from './voice-settings/voice-settings.component';

export const ACCESSIBILITY_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'voice-settings' },
  {
    path: 'voice-settings',
    title: 'Accessibility',
    loadComponent: () => import('./voice-settings/voice-settings.component').then(m => m.VoiceSettingsComponent),
  },
  { path: 'voice-settings', component: VoiceSettingsComponent },
  { path: 'voice-assistant', component: VoiceAccessibilityModalComponent },
];
