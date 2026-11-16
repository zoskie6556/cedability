import { describe, expect, it } from 'vitest';
import { requireIdeaStatus } from './status-parse';

describe('requireIdeaStatus', () => {
  it('accepts every new stage', () => {
    expect(requireIdeaStatus('submitted')).toBe('submitted');
    expect(requireIdeaStatus('needs_amendment')).toBe('needs_amendment');
    expect(requireIdeaStatus('awarded')).toBe('awarded');
  });
  it('maps the old stage names so existing data still loads', () => {
    expect(requireIdeaStatus('under-review')).toBe('human_review');
    expect(requireIdeaStatus('needs-revision')).toBe('needs_amendment');
    expect(requireIdeaStatus('accepted')).toBe('approved');
    expect(requireIdeaStatus('declined')).toBe('rejected');
  });
  it('still rejects nonsense and inherited object keys', () => {
    expect(() => requireIdeaStatus('banana')).toThrow();
    expect(() => requireIdeaStatus(42)).toThrow();
    expect(() => requireIdeaStatus('constructor')).toThrow();
  });
});
