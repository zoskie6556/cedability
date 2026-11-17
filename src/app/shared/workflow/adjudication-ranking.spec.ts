import { describe, expect, it } from 'vitest';
import { rankAdjudicationIdeas } from './adjudication-ranking';

describe('rankAdjudicationIdeas', () => {
  it('normalizes scores per evaluator and reports each panel spread', () => {
    const ranked = rankAdjudicationIdeas([
      {
        ideaId: 'idea-a',
        title: 'Idea A',
        category: 'agriculture',
        evaluations: [
          { evaluatorUid: 'evaluator-1', stageId: 'human_review', total: 90 },
          { evaluatorUid: 'evaluator-2', stageId: 'human_review', total: 50 },
        ],
      },
      {
        ideaId: 'idea-b',
        title: 'Idea B',
        category: 'health',
        evaluations: [
          { evaluatorUid: 'evaluator-1', stageId: 'human_review', total: 70 },
          { evaluatorUid: 'evaluator-2', stageId: 'human_review', total: 60 },
        ],
      },
      {
        ideaId: 'idea-c',
        title: 'Idea C',
        category: 'tech',
        evaluations: [
          { evaluatorUid: 'evaluator-1', stageId: 'human_review', total: 50 },
          { evaluatorUid: 'evaluator-2', stageId: 'human_review', total: 65 },
        ],
      },
    ]);

    expect(ranked.map(({ ideaId }) => ideaId)).toEqual(['idea-b', 'idea-a', 'idea-c']);
    expect(ranked.find(({ ideaId }) => ideaId === 'idea-a')?.panel).toMatchObject({
      spread: 40,
      needsAdjudication: true,
    });
    expect(ranked[0].normalizedScore).toBeGreaterThan(ranked[1].normalizedScore ?? -Infinity);
    expect(ranked[0].normalizedScores).toHaveLength(2);
  });

  it('keeps ideas without evaluations last and rejects invalid totals', () => {
    const ranked = rankAdjudicationIdeas([
      { ideaId: 'empty', title: 'Empty', category: null, evaluations: [] },
    ]);
    expect(ranked[0].normalizedScore).toBeNull();
    expect(() =>
      rankAdjudicationIdeas([
        {
          ideaId: 'invalid',
          title: 'Invalid',
          category: null,
          evaluations: [{ evaluatorUid: 'e1', stageId: 's1', total: 101 }],
        },
      ]),
    ).toThrow('An evaluator score is invalid.');
  });
});
