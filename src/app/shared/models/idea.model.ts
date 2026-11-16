import type { Timestamp } from 'firebase/firestore';
import type { IdeaStatus } from '../workflow/idea-workflow';
import type {
  AutomatedReviewReport,
  IdeaCategory,
  SimilarityCheckResult,
} from './automated-review.model';

export type { IdeaStatus } from '../workflow/idea-workflow';
export * from './automated-review.model';

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
  category: IdeaCategory | null;
  similarityCheck: SimilarityCheckResult | null;
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
