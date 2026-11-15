import { describe, expect, it } from 'vitest';
import { splitSpeechText } from './speech-player.service';

describe('splitSpeechText', () => {
  it('keeps sentences together until the request limit requires a split', () => {
    const chunks = splitSpeechText('First sentence. Second sentence. Third sentence.', 32);

    expect(chunks).toEqual(['First sentence. Second sentence.', 'Third sentence.']);
  });

  it('splits long words and whitespace-heavy text without exceeding the limit', () => {
    const chunks = splitSpeechText(`  ${'a'.repeat(11)}   short   words  `, 5);

    expect(chunks).toEqual(['aaaaa', 'aaaaa', 'a', 'short', 'words']);
    expect(chunks.every((chunk) => chunk.length <= 5)).toBe(true);
  });
});
