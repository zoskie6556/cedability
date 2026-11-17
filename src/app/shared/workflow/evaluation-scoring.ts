/**
 * Scoring maths for the evaluation module. Pure functions, no Angular, no Firebase.
 * Keeping the maths separate means we can unit-test it and explain it to the judges.
 */
export interface Criterion {
  readonly id: string;
  readonly label: string;
  /** Relative importance. Weights do NOT need to add up to 100; we normalise. */
  readonly weight: number;
  /** Highest mark an evaluator can give for this criterion, e.g. 5 or 10. */
  readonly maxScore: number;
}

/** criterionId -> mark given by one evaluator. */
export type ScoreSheet = Readonly<Record<string, number>>;

/**
 * Weighted total on a 0-100 scale:
 *   total = 100 * sum(weight_i * mark_i / max_i) / sum(weight_i)
 * Returns null if any criterion is missing or out of range, so an incomplete
 * sheet can never be saved as a silent low score.
 */
export function weightedScore(sheet: ScoreSheet, criteria: readonly Criterion[]): number | null {
  if (criteria.length === 0) return null;
  let earned = 0;
  let possible = 0;
  for (const c of criteria) {
    const mark = sheet[c.id];
    if (typeof mark !== 'number' || Number.isNaN(mark) || mark < 0 || mark > c.maxScore) {
      return null;
    }
    earned += c.weight * (mark / c.maxScore);
    possible += c.weight;
  }
  return possible === 0 ? null : round((earned / possible) * 100);
}

/**
 * z-score per evaluator: (score - evaluatorMean) / evaluatorStdDev.
 * Makes a harsh marker and a generous marker comparable before ranking.
 * Needs at least 2 scores from that evaluator; otherwise returns 0 (neutral).
 */
export function zScore(score: number, evaluatorScores: readonly number[]): number {
  if (evaluatorScores.length < 2) return 0;
  const mean = average(evaluatorScores);
  const sd = stdDev(evaluatorScores);
  return sd === 0 ? 0 : round((score - mean) / sd, 3);
}

export interface PanelSummary {
  readonly count: number;
  readonly mean: number | null;
  /** highest total minus lowest total */
  readonly spread: number;
  /** true when evaluators disagree enough that adjudicators should look closely */
  readonly needsAdjudication: boolean;
}

export const DEFAULT_SPREAD_THRESHOLD = 20;

export function summarisePanel(
  totals: readonly number[],
  spreadThreshold: number = DEFAULT_SPREAD_THRESHOLD,
): PanelSummary {
  if (totals.length === 0) {
    return { count: 0, mean: null, spread: 0, needsAdjudication: false };
  }
  const spread = Math.max(...totals) - Math.min(...totals);
  return {
    count: totals.length,
    mean: round(average(totals)),
    spread: round(spread),
    // One evaluator cannot disagree with themselves, so only flag from 2 up.
    needsAdjudication: totals.length >= 2 && spread > spreadThreshold,
  };
}

function average(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: readonly number[]): number {
  const mean = average(values);
  return Math.sqrt(average(values.map((v) => (v - mean) ** 2)));
}

function round(value: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}
