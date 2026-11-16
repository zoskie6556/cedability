export type AccessibilityVoiceTheme = 'warm' | 'cool' | 'deep';

export interface AccessibilityVoice {
  id: string;
  displayName: string;
  description: string;
  language: string;
  theme: AccessibilityVoiceTheme;
}

export const DEFAULT_ACCESSIBILITY_VOICES: readonly AccessibilityVoice[] = [
  {
    id: 'en-GB-Neural2-A',
    displayName: 'Clear',
    description: 'A clear, measured English voice.',
    language: 'en-GB',
    theme: 'warm',
  },
  {
    id: 'en-GB-Neural2-B',
    displayName: 'Steady',
    description: 'A steady voice for longer passages.',
    language: 'en-GB',
    theme: 'cool',
  },
  {
    id: 'en-GB-Neural2-C',
    displayName: 'Bright',
    description: 'A bright voice for short updates.',
    language: 'en-GB',
    theme: 'deep',
  },
];

export type VoiceSessionState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'speaking'
  | 'error';

export interface IdeaDraftEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}
