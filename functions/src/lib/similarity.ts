import type {
  SimilarityCheckResult,
  SimilarIdeaMatch,
} from '../shared/automated-review.model';

const STOP_WORDS = new Set([
  'about',
  'after',
  'also',
  'and',
  'are',
  'because',
  'been',
  'being',
  'between',
  'from',
  'have',
  'into',
  'its',
  'more',
  'that',
  'their',
  'them',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'using',
  'will',
  'with',
  'would',
  'your',
]);

export const MAX_SIMILARITY_MATCHES = 5;
export const MIN_SHARED_KEYWORDS = 2;
export const MIN_JACCARD_SIMILARITY = 0.15;

export interface SimilarityCandidate {
  ideaId: string;
  title: string;
  planText: string;
}

export function findSimilarIdeas(
  planText: string,
  candidates: readonly SimilarityCandidate[],
  truncated = false,
): SimilarityCheckResult {
  const sourceTokens = tokenize(planText);
  const matches: SimilarIdeaMatch[] = [];

  for (const candidate of candidates) {
    const candidateTokens = tokenize(candidate.planText);
    const matchingKeywords = [...sourceTokens]
      .filter((token) => candidateTokens.has(token))
      .sort();
    const unionSize = new Set([...sourceTokens, ...candidateTokens]).size;
    const jaccardSimilarity = unionSize === 0 ? 0 : matchingKeywords.length / unionSize;

    if (
      matchingKeywords.length >= MIN_SHARED_KEYWORDS &&
      jaccardSimilarity >= MIN_JACCARD_SIMILARITY
    ) {
      matches.push({
        ideaId: candidate.ideaId,
        title: candidate.title,
        jaccardSimilarity: roundScore(jaccardSimilarity),
        matchingKeywords,
      });
    }
  }

  matches.sort(
    (first, second) =>
      second.jaccardSimilarity - first.jaccardSimilarity ||
      first.ideaId.localeCompare(second.ideaId),
  );

  return {
    status: 'complete',
    comparedIdeas: candidates.length,
    truncated,
    matches: matches.slice(0, MAX_SIMILARITY_MATCHES),
    failureMessage: null,
  };
}

function tokenize(value: string): Set<string> {
  return new Set(
    (value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter(
      (token) => !STOP_WORDS.has(token),
    ),
  );
}

function roundScore(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
