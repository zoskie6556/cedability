import { summarisePanel, zScore } from './evaluation-scoring';
import type { PanelSummary } from './evaluation-scoring';

export interface AdjudicationEvaluationScore {
  readonly evaluatorUid: string;
  readonly stageId: string;
  readonly total: number;
}

export interface AdjudicationCandidate {
  readonly ideaId: string;
  readonly title: string;
  readonly category: string | null;
  readonly evaluations: readonly AdjudicationEvaluationScore[];
}

export interface NormalizedEvaluatorScore extends AdjudicationEvaluationScore {
  readonly zScore: number;
}

export interface RankedAdjudicationIdea extends AdjudicationCandidate {
  readonly panel: PanelSummary;
  readonly normalizedScores: readonly NormalizedEvaluatorScore[];
  readonly normalizedScore: number | null;
}

/** Ranks each idea by the mean of its evaluators' z-scores across the panel. */
export function rankAdjudicationIdeas(
  candidates: readonly AdjudicationCandidate[],
): RankedAdjudicationIdea[] {
  const scoresByEvaluator = new Map<string, number[]>();
  for (const candidate of candidates) {
    for (const evaluation of candidate.evaluations) {
      if (
        !evaluation.evaluatorUid.trim() ||
        !evaluation.stageId.trim() ||
        !Number.isFinite(evaluation.total) ||
        evaluation.total < 0 ||
        evaluation.total > 100
      ) {
        throw new Error('An evaluator score is invalid.');
      }

      const evaluatorKey = evaluatorKeyFor(evaluation.stageId, evaluation.evaluatorUid);
      const scores = scoresByEvaluator.get(evaluatorKey) ?? [];
      scores.push(evaluation.total);
      scoresByEvaluator.set(evaluatorKey, scores);
    }
  }

  return candidates
    .map((candidate) => {
      const panel = summarisePanel(candidate.evaluations.map(({ total }) => total));
      const normalizedScores = candidate.evaluations
        .map((evaluation) => ({
          ...evaluation,
          zScore: zScore(
            evaluation.total,
            scoresByEvaluator.get(evaluatorKeyFor(evaluation.stageId, evaluation.evaluatorUid)) ??
              [],
          ),
        }))
        .sort(
          (left, right) =>
            left.stageId.localeCompare(right.stageId) ||
            left.evaluatorUid.localeCompare(right.evaluatorUid),
        );
      const normalizedScore =
        normalizedScores.length === 0
          ? null
          : round(
              normalizedScores.reduce((sum, evaluation) => sum + evaluation.zScore, 0) /
                normalizedScores.length,
              3,
            );

      return { ...candidate, panel, normalizedScores, normalizedScore };
    })
    .sort((left, right) => {
      if (left.normalizedScore === null) {
        return right.normalizedScore === null ? left.title.localeCompare(right.title) : 1;
      }
      if (right.normalizedScore === null) return -1;
      return (
        right.normalizedScore - left.normalizedScore ||
        (right.panel.mean ?? -Infinity) - (left.panel.mean ?? -Infinity) ||
        left.title.localeCompare(right.title)
      );
    });
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function evaluatorKeyFor(stageId: string, evaluatorUid: string): string {
  return JSON.stringify([stageId, evaluatorUid]);
}
