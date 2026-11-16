export const IDEA_CATEGORIES = [
  'health',
  'agriculture',
  'tech',
  'business',
  'marketing',
  'sales',
  'other',
] as const;

export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];
export type ReviewFindingStatus = 'supported' | 'unclear' | 'risk' | 'not-enough-information';
export type AutomatedReviewStatus = 'queued' | 'running' | 'complete' | 'failed';
export type AutomatedReviewCriterion =
  | 'market'
  | 'technical'
  | 'operations'
  | 'financial'
  | 'delivery'
  | 'impact';

export interface FirestoreTimestampValue {
  toDate(): Date;
  toMillis(): number;
}

export interface AutomatedReviewFinding {
  status: ReviewFindingStatus;
  evidence: string[];
  informationGaps: string[];
  evaluatorQuestions: string[];
}

export interface AutomatedReviewReport {
  status: AutomatedReviewStatus;
  model: string;
  rubricVersion: string;
  summary: string;
  criteria: Record<AutomatedReviewCriterion, AutomatedReviewFinding> | null;
  strengths: string[];
  informationGaps: string[];
  questionsForHumanEvaluator: string[];
  limitations: string[];
  startedAt: FirestoreTimestampValue | null;
  completedAt: FirestoreTimestampValue | null;
  failureMessage: string | null;
}

export type SimilarityCheckStatus = 'complete' | 'failed';

export interface SimilarIdeaMatch {
  ideaId: string;
  title: string;
  jaccardSimilarity: number;
  matchingKeywords: string[];
}

export interface SimilarityCheckResult {
  status: SimilarityCheckStatus;
  comparedIdeas: number;
  truncated: boolean;
  matches: SimilarIdeaMatch[];
  failureMessage: string | null;
}

export function isIdeaCategory(value: unknown): value is IdeaCategory {
  return typeof value === 'string' && (IDEA_CATEGORIES as readonly string[]).includes(value);
}
