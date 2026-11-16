import { describe, expect, it } from 'vitest';
import { summarisePanel, weightedScore, zScore, type Criterion } from './evaluation-scoring';

const criteria: Criterion[] = [
  { id: 'impact', label: 'Impact', weight: 40, maxScore: 10 },
  { id: 'feasibility', label: 'Feasibility', weight: 30, maxScore: 10 },
  { id: 'innovation', label: 'Innovation', weight: 30, maxScore: 5 },
];

describe('weightedScore', () => {
  it('scores full marks as 100 and zero as 0', () => {
    expect(weightedScore({ impact: 10, feasibility: 10, innovation: 5 }, criteria)).toBe(100);
    expect(weightedScore({ impact: 0, feasibility: 0, innovation: 0 }, criteria)).toBe(0);
  });
  it('applies weights (40*0.5 + 30*0.5 + 30*1 = 65)', () => {
    expect(weightedScore({ impact: 5, feasibility: 5, innovation: 5 }, criteria)).toBe(65);
  });
  it('rejects incomplete, out-of-range or empty input instead of guessing', () => {
    expect(weightedScore({ impact: 5, feasibility: 5 }, criteria)).toBeNull();
    expect(weightedScore({ impact: 11, feasibility: 5, innovation: 5 }, criteria)).toBeNull();
    expect(weightedScore({}, [])).toBeNull();
  });
});

describe('zScore', () => {
  it('makes a harsh and a generous marker comparable', () => {
    expect(zScore(60, [40, 50, 60])).toBe(zScore(90, [70, 80, 90]));
  });
  it('is neutral with one score or zero variance', () => {
    expect(zScore(50, [50])).toBe(0);
    expect(zScore(50, [50, 50, 50])).toBe(0);
  });
});

describe('summarisePanel', () => {
  it('handles an empty panel', () => {
    expect(summarisePanel([])).toEqual({ count: 0, mean: null, spread: 0, needsAdjudication: false });
  });
  it('flags large disagreement only with 2+ evaluators', () => {
    expect(summarisePanel([70]).needsAdjudication).toBe(false);
    expect(summarisePanel([70, 75]).needsAdjudication).toBe(false);
    expect(summarisePanel([40, 80]).needsAdjudication).toBe(true);
    expect(summarisePanel([40, 80]).mean).toBe(60);
  });
});
