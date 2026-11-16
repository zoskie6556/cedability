import { describe, expect, it } from 'vitest';
import { categorizeIdea, extractIdeaPlanText } from '../src/lib/idea-analysis';

describe('idea analysis helpers', () => {
  it.each([
    ['A clinic providing medicine and patient care', 'health'],
    ['Irrigation tools for small-scale farmers', 'agriculture'],
    ['A mobile software platform', 'tech'],
    ['A manufacturing startup', 'business'],
    ['Advertising and brand campaigns', 'marketing'],
    ['Retail sales and local shops', 'sales'],
    ['A community arts program', 'other'],
  ] as const)('categorizes plan text as %s', (planText, expected) => {
    expect(categorizeIdea(planText)).toBe(expected);
  });

  it('extracts plan fields without including owner identity fields', () => {
    const text = extractIdeaPlanText({
      ownerId: 'uid-private',
      ownerName: 'Private Person',
      email: 'private@example.test',
      title: 'Solar irrigation',
      problem: 'Farmers need reliable water.',
      proposedSolution: 'Install solar water pumps.',
      marketPlan: { targetMarket: 'Small farmers' },
    });

    expect(text).toContain('Solar irrigation');
    expect(text).toContain('Small farmers');
    expect(text).not.toContain('uid-private');
    expect(text).not.toContain('Private Person');
    expect(text).not.toContain('private@example.test');
  });
});
