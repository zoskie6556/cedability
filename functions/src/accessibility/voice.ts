export type VoiceTheme = 'warm' | 'cool' | 'deep';

export interface VoiceDefinition {
  id: string;
  displayName: string;
  description: string;
  language: string;
  theme: VoiceTheme;
}

export const DEFAULT_VOICES: readonly VoiceDefinition[] = [
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
