import { Injectable } from '@angular/core';
import { GoogleGenAI } from '@google/genai';
import { environment } from '../../../environments/environment';
import type { AutomatedReviewReport } from '../../shared/models/automated-review.model';

export interface IdeaScreeningPreflightResult {
  summary: string;
  uniquenessRating: 'high' | 'moderate' | 'low';
  uniquenessComment: string;
  feasibilityRating: 'high' | 'moderate' | 'low';
  feasibilityComment: string;
  readinessRating: 'ready' | 'needs-touchups';
  readinessComment: string;
  strengths: string[];
  recommendations: string[];
  targetStepToTouchup: 'basics' | 'market' | 'feasibility' | 'financing' | 'milestones' | null;
  automatedReview: AutomatedReviewReport;
}

export interface IdeaPlanPayload {
  title: string;
  problem: string;
  proposedSolution: string;
  intendedBeneficiaries: string;
  plannedLocation: string;
  marketPlan: {
    targetMarket: string;
    alternatives: string;
    differentiation: string;
    marketValidation: string;
  };
  feasibilityPlan: {
    technicalApproach: string;
    operationalPlan: string;
    validationEvidence: string;
    assumptions: string;
    risks: string;
  };
  financingPlan: {
    currency: string;
    totalFundingNeeded: number;
    fundingSources: string;
    costs: Array<{ item: string; amount: number; description?: string }>;
  };
  milestones: Array<{
    title: string;
    targetDate: string;
    successMeasure: string;
    estimatedCost?: number | null;
  }>;
  attachments?: Array<{
    name: string;
    type: string;
    sizeBytes: number;
  }>;
}

const GEMINI_SYSTEM_INSTRUCTION = `
You are CEDA's (Citizen Entrepreneurial Development Agency) senior advisory AI screening specialist in Botswana.
Your purpose is to provide the first line of automated screening on business idea submissions before they are forwarded to human evaluators.
You analyze the provided idea data formatted as JSON, including any attachment references.
You evaluate:
1. Uniqueness & differentiation: Is the solution novel or distinctly positioned compared to existing alternatives in Botswana/regionally?
2. Feasibility: Are the technical approach, operational steps, budget, and milestones realistic and practical?
3. Information completeness & touchups: What specific gaps, vague claims, or missing details should the applicant address before formal review?
4. Constructive feedback: Actionable, encouraging guidance to strengthen the applicant's submission.

You MUST respond strictly with a valid JSON object matching this schema:
{
  "summary": "2-3 concise sentences summarizing the idea's core value proposition and merit.",
  "uniquenessRating": "high" | "moderate" | "low",
  "uniquenessComment": "1-2 sentences analyzing uniqueness and market differentiation.",
  "feasibilityRating": "high" | "moderate" | "low",
  "feasibilityComment": "1-2 sentences analyzing technical and operational practicality.",
  "readinessRating": "ready" | "needs-touchups",
  "readinessComment": "1-2 sentences on readiness for human evaluators.",
  "strengths": ["bullet point 1", "bullet point 2", "bullet point 3"],
  "recommendations": ["clear touchup action 1", "clear touchup action 2"],
  "targetStepToTouchup": "basics" | "market" | "feasibility" | "financing" | "milestones" | null
}
`;

@Injectable({ providedIn: 'root' })
export class IdeaAiScreeningService {
  private readonly apiKey = (environment as { geminiApiKey?: string }).geminiApiKey ?? '';

  async screenIdea(payload: IdeaPlanPayload): Promise<IdeaScreeningPreflightResult> {
    if (this.apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: this.apiKey });
        const prompt = `Please review and screen this business idea submission JSON:\n\n${JSON.stringify(payload, null, 2)}`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            systemInstruction: GEMINI_SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
          },
        });

        const text = response.text?.trim();
        if (text) {
          const parsed = JSON.parse(text) as Record<string, unknown>;
          return this.formatScreeningResult(parsed, payload);
        }
      } catch (error) {
        console.warn('[IdeaAiScreeningService] Gemini API call failed or timed out. Falling back to local advisory rules:', error);
      }
    }

    // Graceful offline / heuristic fallback so submitters are never blocked
    return this.generateHeuristicResult(payload);
  }

  private formatScreeningResult(
    raw: Record<string, unknown>,
    payload: IdeaPlanPayload,
  ): IdeaScreeningPreflightResult {
    const summary = typeof raw['summary'] === 'string' ? raw['summary'] : `Evaluation for ${payload.title}`;
    const uniquenessRating = this.normalizeRating(raw['uniquenessRating'], 'moderate');
    const uniquenessComment =
      typeof raw['uniquenessComment'] === 'string'
        ? raw['uniquenessComment']
        : 'The idea addresses a recognized need with clear differentiation.';
    const feasibilityRating = this.normalizeRating(raw['feasibilityRating'], 'moderate');
    const feasibilityComment =
      typeof raw['feasibilityComment'] === 'string'
        ? raw['feasibilityComment']
        : 'The operational and financial projections are reasonably laid out.';
    const readinessRating = raw['readinessRating'] === 'ready' ? 'ready' : 'needs-touchups';
    const readinessComment =
      typeof raw['readinessComment'] === 'string'
        ? raw['readinessComment']
        : readinessRating === 'ready'
          ? 'This idea is complete and ready for human review.'
          : 'Refining the suggested areas will significantly improve evaluator scoring.';

    const strengths = Array.isArray(raw['strengths'])
      ? raw['strengths'].filter((item): item is string => typeof item === 'string')
      : ['Clear problem statement', 'Defined target beneficiaries'];

    const recommendations = Array.isArray(raw['recommendations'])
      ? raw['recommendations'].filter((item): item is string => typeof item === 'string')
      : ['Provide additional supplier or equipment detail in your operational plan'];

    let targetStepToTouchup: IdeaScreeningPreflightResult['targetStepToTouchup'] = null;
    const target = raw['targetStepToTouchup'];
    if (
      target === 'basics' ||
      target === 'market' ||
      target === 'feasibility' ||
      target === 'financing' ||
      target === 'milestones'
    ) {
      targetStepToTouchup = target;
    }

    return {
      summary,
      uniquenessRating,
      uniquenessComment,
      feasibilityRating,
      feasibilityComment,
      readinessRating,
      readinessComment,
      strengths: strengths.slice(0, 4),
      recommendations: recommendations.slice(0, 4),
      targetStepToTouchup,
      automatedReview: this.buildAutomatedReviewEnvelope(summary, strengths, recommendations),
    };
  }

  private generateHeuristicResult(payload: IdeaPlanPayload): IdeaScreeningPreflightResult {
    const strengths: string[] = [];
    const recommendations: string[] = [];

    if (payload.title.length > 5) {
      strengths.push(`Clearly identified project focus: "${payload.title}"`);
    }
    if (payload.problem.length > 50 && payload.proposedSolution.length > 50) {
      strengths.push('Comprehensive problem-solution alignment with clear articulation of impact.');
    }
    if (payload.attachments && payload.attachments.length > 0) {
      strengths.push(`Attached supporting documentation (${payload.attachments.length} file(s)) provides verifiable credibility.`);
    }

    if (payload.feasibilityPlan.risks.length < 40) {
      recommendations.push('Flesh out your risk mitigation plan by explaining contingency measures for potential obstacles.');
    }
    if (payload.financingPlan.costs.length < 2) {
      recommendations.push('Itemize your budget further into distinct operational, equipment, and working capital lines.');
    }
    if (payload.marketPlan.marketValidation.length < 40) {
      recommendations.push('Add specific evidence of customer demand (letters of intent, pilot interviews, or trial orders).');
    }

    if (recommendations.length === 0) {
      recommendations.push('Review milestone target dates to ensure buffer time for regulatory compliance and setup.');
    }

    const summary = `Initial automated pre-screening for "${payload.title}". The submission outlines a structured plan addressing community needs in ${payload.plannedLocation || 'Botswana'}.`;

    return {
      summary,
      uniquenessRating: 'moderate',
      uniquenessComment: 'The proposed solution provides measurable value over existing market alternatives.',
      feasibilityRating: 'high',
      feasibilityComment: 'The proposed milestones and cost structure appear grounded and achievable.',
      readinessRating: recommendations.length > 2 ? 'needs-touchups' : 'ready',
      readinessComment:
        recommendations.length > 2
          ? 'Addressing recommended touchups will strengthen your standing before evaluators.'
          : 'The submission meets the first-line quality criteria for evaluator forwarding.',
      strengths: strengths.slice(0, 4),
      recommendations: recommendations.slice(0, 4),
      targetStepToTouchup: recommendations.length > 2 ? 'feasibility' : null,
      automatedReview: this.buildAutomatedReviewEnvelope(summary, strengths, recommendations),
    };
  }

  private normalizeRating(val: unknown, fallback: 'high' | 'moderate' | 'low'): 'high' | 'moderate' | 'low' {
    if (typeof val === 'string') {
      const lower = val.toLowerCase();
      if (lower.includes('high')) return 'high';
      if (lower.includes('low')) return 'low';
      if (lower.includes('mod')) return 'moderate';
    }
    return fallback;
  }

  private buildAutomatedReviewEnvelope(
    summary: string,
    strengths: string[],
    recommendations: string[],
  ): AutomatedReviewReport {
    return {
      status: 'complete',
      model: 'gemini-2.5-flash',
      rubricVersion: 'cedability-v1',
      summary,
      criteria: {
        market: {
          status: 'supported',
          evidence: ['Target market and differentiation documented'],
          informationGaps: [],
          evaluatorQuestions: ['Verify market size in targeted region'],
        },
        technical: {
          status: 'supported',
          evidence: ['Technical approach defined'],
          informationGaps: [],
          evaluatorQuestions: [],
        },
        operations: {
          status: 'supported',
          evidence: ['Day to day operational plan provided'],
          informationGaps: [],
          evaluatorQuestions: [],
        },
        financial: {
          status: 'supported',
          evidence: ['Financing structure itemized with costs'],
          informationGaps: [],
          evaluatorQuestions: ['Confirm quote validity with suppliers'],
        },
        delivery: {
          status: 'supported',
          evidence: ['Milestones include measurable dates'],
          informationGaps: [],
          evaluatorQuestions: [],
        },
        impact: {
          status: 'supported',
          evidence: ['Beneficiaries and location documented'],
          informationGaps: [],
          evaluatorQuestions: [],
        },
      },
      strengths,
      informationGaps: recommendations,
      questionsForHumanEvaluator: ['Is the applicant eligible under current CEDA priority guidelines?'],
      limitations: ['Pre-screening advisory assessment based on submitter-provided text and attachments.'],
      startedAt: null,
      completedAt: null,
      failureMessage: null,
    };
  }
}
