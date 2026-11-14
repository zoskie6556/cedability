import type { Timestamp } from 'firebase/firestore';

export type EvaluationCriterion = 'innovation' | 'feasibility' | 'impact' | 'sustainability';
export type EvaluationRecommendation = 'pending' | 'advance' | 'revise' | 'decline';

export interface IdeaEvaluation {
  id: string;
  ideaId: string;
  evaluatorId: string;
  scores: Partial<Record<EvaluationCriterion, number>>;
  comments: string;
  recommendation: EvaluationRecommendation;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface IdeaQuestion {
  id: string;
  ideaId: string;
  askedBy: string;
  question: string;
  createdAt: Timestamp | null;
  response: string | null;
  respondedBy: string | null;
  respondedAt: Timestamp | null;
}
