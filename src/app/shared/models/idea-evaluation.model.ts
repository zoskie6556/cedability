import type { Timestamp } from 'firebase/firestore';
import type {
  IdeaFeasibilityPlan,
  IdeaFinancingPlan,
  IdeaMarketPlan,
  IdeaMilestone,
} from './idea.model';
import type { AutomatedReviewReport, IdeaCategory } from './automated-review.model';

export type EvaluatorType = 'internal' | 'external';
export type EvaluationRecommendation = 'advance' | 'revise' | 'decline';
export type EvaluationAssignmentStatus = 'pending' | 'in_progress' | 'done';

export interface EvaluationCriterion {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly maxScore: number;
  readonly weight: number;
}

export interface EvaluationCriteriaSet {
  readonly id: string;
  readonly name: string;
  readonly criteria: readonly EvaluationCriterion[];
}

export function parseEvaluationCriteriaSet(id: string, value: unknown): EvaluationCriteriaSet {
  const record = asRecord(value, 'criteria set');
  if (typeof record['name'] !== 'string' || record['name'].trim().length === 0) {
    throw new Error('The criteria set name is invalid.');
  }
  if (!Array.isArray(record['criteria']) || record['criteria'].length === 0 || record['criteria'].length > 10) {
    throw new Error('The criteria set must contain between one and ten criteria.');
  }

  const criteria = record['criteria'].map((value) => {
    const criterion = asRecord(value, 'criterion');
    const weight = criterion['weight'];
    const maxScore = criterion['maxScore'];
    if (
      typeof criterion['id'] !== 'string' ||
      !/^[A-Za-z0-9_-]{1,60}$/.test(criterion['id']) ||
      typeof criterion['label'] !== 'string' ||
      criterion['label'].trim().length === 0 ||
      criterion['label'].length > 120 ||
      typeof criterion['description'] !== 'string' ||
      criterion['description'].length > 1000 ||
      typeof maxScore !== 'number' ||
      !Number.isFinite(maxScore) ||
      maxScore <= 0 ||
      maxScore > 100 ||
      typeof weight !== 'number' ||
      !Number.isFinite(weight) ||
      weight <= 0 ||
      weight > 100
    ) {
      throw new Error('A scoring criterion is invalid.');
    }

    return {
      id: criterion['id'],
      label: criterion['label'],
      description: criterion['description'],
      maxScore,
      weight,
    };
  });
  if (new Set(criteria.map((criterion) => criterion.id)).size !== criteria.length) {
    throw new Error('Criterion identifiers must be unique.');
  }

  return { id, name: record['name'], criteria };
}

export interface EvaluationStage {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly criteriaSetId: string;
  readonly evaluatorUids: readonly string[];
  readonly requiresAdjudication: boolean;
  readonly isActive: boolean;
}

export interface IdeaAssignment {
  readonly id: string;
  readonly ideaId: string;
  readonly stageId: string;
  readonly evaluatorUid: string;
  readonly status: EvaluationAssignmentStatus;
  readonly dueAt: Timestamp | null;
  readonly assignedBy: string;
  readonly createdAt: Timestamp | null;
  readonly updatedAt: Timestamp | null;
}

export interface EvaluationIdeaDetails {
  readonly title: string;
  readonly category: IdeaCategory | null;
  readonly problem: string;
  readonly proposedSolution: string;
  readonly intendedBeneficiaries: string;
  readonly plannedLocation: string;
  readonly marketPlan: IdeaMarketPlan;
  readonly feasibilityPlan: IdeaFeasibilityPlan;
  readonly financingPlan: IdeaFinancingPlan;
  readonly milestones: readonly IdeaMilestone[];
  readonly automatedReview: AutomatedReviewReport | null;
}

export interface EvaluatorIdeaView extends EvaluationIdeaDetails {
  readonly ideaId: string;
  readonly assignmentId: string;
  readonly evaluatorUid: string;
  readonly stageId: string;
  readonly stageName: string;
  readonly criteriaSetId: string;
  readonly criteriaSet: EvaluationCriteriaSet;
  readonly createdAt: Timestamp | null;
}

export interface EvaluationWorklistItem {
  readonly assignment: IdeaAssignment;
  readonly title: string;
  readonly category: IdeaCategory | null;
}

export interface EvaluationContext {
  readonly assignment: IdeaAssignment;
  readonly idea: EvaluationIdeaDetails;
  readonly stageName: string;
  readonly criteriaSet: EvaluationCriteriaSet;
  readonly evaluatorType: EvaluatorType;
}

export interface IdeaEvaluation {
  readonly id: string;
  readonly ideaId: string;
  readonly stageId: string;
  readonly evaluatorUid: string;
  readonly scores: Readonly<Record<string, number>>;
  readonly comments: string;
  readonly recommendation: EvaluationRecommendation;
  readonly total: number;
  readonly submittedAt: Timestamp | null;
}

export interface IdeaQuestion {
  readonly id: string;
  readonly ideaId: string;
  readonly stageId: string | null;
  readonly askedBy: string;
  readonly question: string;
  readonly createdAt: Timestamp | null;
  readonly response: string | null;
  readonly respondedBy: string | null;
  readonly respondedAt: Timestamp | null;
}

export type AdjudicationDecision = 'advance' | 'reject' | 'revise';

export interface IdeaAdjudication {
  readonly id: string;
  readonly ideaId: string;
  readonly stageId: string;
  readonly ideaVersion: number;
  readonly adjudicatorUid: string;
  readonly decision: AdjudicationDecision;
  readonly finalScore: number | null;
  readonly note: string;
  readonly decidedAt: Timestamp | null;
}

export interface IdeaAward {
  readonly id: string;
  readonly ideaId: string;
  readonly ownerId: string;
  readonly title: string;
  readonly type: string;
  readonly citation: string;
  readonly awardedBy: string;
  readonly awardedAt: Timestamp | null;
  readonly isPublic: boolean;
}

export interface AwardCandidate {
  readonly ideaId: string;
  readonly ownerId: string;
  readonly title: string;
  readonly category: IdeaCategory | null;
}

function asRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`The Firestore ${fieldName} data is not a valid object.`);
  }
  return value as Record<string, unknown>;
}
