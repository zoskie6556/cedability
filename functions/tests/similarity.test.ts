import { describe, expect, it } from 'vitest';
import { findSimilarIdeas } from '../src/lib/similarity';

describe('findSimilarIdeas', () => {
  it('calculates the Jaccard score over unique non-stopword tokens', () => {
    const result = findSimilarIdeas('solar cold storage farmers grow vegetables', [
      {
        ideaId: 'idea-a',
        title: 'Solar cold storage',
        planText: 'solar cold storage farmers',
      },
    ]);

    expect(result.matches).toEqual([
      {
        ideaId: 'idea-a',
        title: 'Solar cold storage',
        jaccardSimilarity: 0.6667,
        matchingKeywords: ['cold', 'farmers', 'solar', 'storage'],
      },
    ]);
  });

  it('requires both the keyword overlap and similarity threshold', () => {
    const result = findSimilarIdeas('solar storage farmers', [
      { ideaId: 'one-word', title: 'One word', planText: 'solar irrigation' },
      {
        ideaId: 'low-score',
        title: 'Low score',
        planText:
          'solar storage irrigation infrastructure distribution marketing operations agriculture health finance delivery advisory evaluator application customer',
      },
      { ideaId: 'unrelated', title: 'Unrelated', planText: 'health clinic patient records' },
    ]);

    expect(result.matches).toEqual([]);
  });

  it('limits returned matches and records when the candidate scan was truncated', () => {
    const candidates = Array.from({ length: 7 }, (_, index) => ({
      ideaId: `idea-${index}`,
      title: `Solar idea ${index}`,
      planText: 'solar cold storage farmers',
    }));
    const result = findSimilarIdeas('solar cold storage farmers', candidates, true);

    expect(result.comparedIdeas).toBe(7);
    expect(result.truncated).toBe(true);
    expect(result.matches).toHaveLength(5);
  });
});
