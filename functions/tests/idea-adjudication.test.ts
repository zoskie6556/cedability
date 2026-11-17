import { describe, expect, it } from 'vitest';
import {
  adjudicationTargetStatus,
  isAdjudicationRole,
  parseAwardIdeaInput,
  parseRecordAdjudicationInput,
} from '../src/lib/idea-adjudication';

describe('idea adjudication input', () => {
  it('permits only adjudicators and admins and maps decisions to workflow statuses', () => {
    expect(isAdjudicationRole('adjudicator')).toBe(true);
    expect(isAdjudicationRole('admin')).toBe(true);
    expect(isAdjudicationRole('evaluator')).toBe(false);
    expect(adjudicationTargetStatus('advance')).toBe('approved');
    expect(adjudicationTargetStatus('reject')).toBe('rejected');
    expect(adjudicationTargetStatus('revise')).toBe('needs_amendment');
  });

  it('requires a bounded note for every adjudication decision', () => {
    expect(
      parseRecordAdjudicationInput({
        ideaId: 'idea-1',
        decision: 'advance',
        note: 'Strong panel support.',
      }),
    ).toEqual({
      ideaId: 'idea-1',
      decision: 'advance',
      note: 'Strong panel support.',
    });
    expect(() =>
      parseRecordAdjudicationInput({ ideaId: 'idea-1', decision: 'revise', note: '  ' }),
    ).toThrow('An adjudication note is required.');
    expect(() =>
      parseRecordAdjudicationInput({
        ideaId: 'idea-1',
        decision: 'reject',
        note: 'x'.repeat(501),
      }),
    ).toThrow('The note is invalid.');
    expect(() =>
      parseRecordAdjudicationInput({
        ideaId: 'ideas/other',
        decision: 'advance',
        note: 'Supported.',
      }),
    ).toThrow('The ideaId is invalid.');
  });

  it('validates award fields before a server write', () => {
    expect(
      parseAwardIdeaInput({
        ideaId: 'idea-1',
        title: 'Innovation grant',
        type: 'grant',
        citation: 'For community impact.',
        isPublic: false,
      }).isPublic,
    ).toBe(false);
    expect(() =>
      parseAwardIdeaInput({
        ideaId: 'idea-1',
        title: 'Grant',
        type: 'grant',
        citation: 'Citation',
        isPublic: 'true',
      }),
    ).toThrow('The award visibility is invalid.');
    expect(() =>
      parseAwardIdeaInput({
        ideaId: 'idea-1',
        title: 'Grant',
        type: 'grant',
        citation: 'Citation',
        isPublic: false,
        awardedBy: 'attacker',
      }),
    ).toThrow('The request contains unsupported fields.');
  });
});
