import type { Timestamp } from 'firebase/firestore';
import type { IdeaStatus } from '../workflow/idea-workflow';

export type { IdeaStatus } from '../workflow/idea-workflow';
export type ReviewFindingStatus = 'supported' | 'unclear' | 'risk' | 'not-enough-information';
export type AutomatedReviewStatus = 'queued' | 'running' | 'complete' | 'failed';
export type AutomatedReviewCriterion =
  | 'market'
  | 'technical'
  | 'operations'
  | 'financial'
  | 'delivery'
  | 'impact';

export interface IdeaMarketPlan {
  targetMarket: string;
  alternatives: string;
  differentiation: string;
  marketValidation: string;
}

export interface IdeaFeasibilityPlan {
  technicalApproach: string;
  operationalPlan: string;
  validationEvidence: string;
  assumptions: string;
  risks: string;
}

export interface IdeaCostItem {
  item: string;
  amount: number;
  description: string;
}

export interface IdeaFinancingPlan {
  currency: string;
  totalFundingNeeded: number;
  fundingSources: string;
  costs: IdeaCostItem[];
}

export interface IdeaMilestone {
  title: string;
  targetDate: string;
  successMeasure: string;
  estimatedCost: number | null;
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
  startedAt: Timestamp | null;
  completedAt: Timestamp | null;
  failureMessage: string | null;
}

export interface IdeaDocument {
  ownerId: string;
  ownerName: string;
  title: string;
  problem: string;
  proposedSolution: string;
  intendedBeneficiaries: string;
  plannedLocation: string;
  marketPlan: IdeaMarketPlan;
  feasibilityPlan: IdeaFeasibilityPlan;
  financingPlan: IdeaFinancingPlan;
  milestones: IdeaMilestone[];
  aiAnalysisConsent: boolean;
  automatedReview: AutomatedReviewReport | null;
  status: IdeaStatus;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Idea extends IdeaDocument {
  id: string;
}

export type NewIdea = Pick<
  IdeaDocument,
  | 'ownerId'
  | 'ownerName'
  | 'title'
  | 'problem'
  | 'proposedSolution'
  | 'intendedBeneficiaries'
  | 'plannedLocation'
  | 'marketPlan'
  | 'feasibilityPlan'
  | 'financingPlan'
  | 'milestones'
  | 'aiAnalysisConsent'
>;
