import { describe, expect, it } from 'vitest';
import { canTransition, NOTE_REQUIRED } from '../src/shared/idea-workflow';
import {
  parseRequestChangesInput,
  parseResubmissionInput,
  readIdeaVersion,
} from '../src/lib/idea-resubmission';

describe('idea feedback and resubmission workflow', () => {
  it('requires a bounded evaluator note before requesting an amendment', () => {
    expect(
      parseRequestChangesInput({
        ideaId: 'idea-1',
        assignmentId: 'idea-1_human_review_evaluator-1',
        stageId: 'human_review',
        message: '  Please clarify your delivery timeline.  ',
      }).message,
    ).toBe('Please clarify your delivery timeline.');
    expect(() =>
      parseRequestChangesInput({
        ideaId: 'idea-1',
        assignmentId: 'assignment-1',
        stageId: 'human_review',
        message: '   ',
      }),
    ).toThrow('The message must be between 1 and 500 characters.');
    expect(NOTE_REQUIRED).toContain('needs_amendment');
  });

  it('permits only the intended evaluator request and owner resubmission transitions', () => {
    expect(canTransition('human_review', 'needs_amendment', 'evaluator')).toBe(true);
    expect(canTransition('needs_amendment', 'ai_screening', 'owner')).toBe(true);
    expect(canTransition('approved', 'ai_screening', 'owner')).toBe(false);
  });

  it('normalizes the resubmitted plan and calculates its total from costs', () => {
    const result = parseResubmissionInput(
      {
        ideaId: 'idea-1',
        expectedVersion: 1,
        idea: validIdea(),
      },
      'owner-1',
    );

    expect(result.expectedVersion).toBe(1);
    expect(result.plan.financingPlan.totalFundingNeeded).toBe(15.3);
    expect(result.plan.title).toBe('Community garden');
    expect(result.plan).not.toHaveProperty('ownerId');
  });

  it('rejects forged ownership, missing consent, malformed dates, and invalid versions', () => {
    expect(() =>
      parseResubmissionInput(
        { ideaId: 'idea-1', expectedVersion: 1, idea: { ...validIdea(), ownerId: 'other' } },
        'owner-1',
      ),
    ).toThrow('The submitted idea identity is invalid.');
    expect(() =>
      parseResubmissionInput(
        {
          ideaId: 'idea-1',
          expectedVersion: 1,
          idea: { ...validIdea(), aiAnalysisConsent: false },
        },
        'owner-1',
      ),
    ).toThrow('Consent is required before automated screening.');
    expect(() =>
      parseResubmissionInput(
        {
          ideaId: 'idea-1',
          expectedVersion: 1,
          idea: {
            ...validIdea(),
            milestones: [{ ...validIdea().milestones[0], targetDate: '2027-02-31' }],
          },
        },
        'owner-1',
      ),
    ).toThrow('A milestone date is invalid.');
    expect(readIdeaVersion(undefined)).toBe(1);
    expect(() => readIdeaVersion(0)).toThrow('The stored idea version is invalid.');
  });
});

function validIdea() {
  return {
    ownerId: 'owner-1',
    ownerName: 'Applicant',
    title: '  Community garden ',
    problem: 'Families need fresh food.',
    proposedSolution: 'Build shared gardens.',
    intendedBeneficiaries: 'Families',
    plannedLocation: 'Gaborone',
    marketPlan: {
      targetMarket: 'Local families',
      alternatives: 'Distant shops',
      differentiation: 'Locally grown food',
      marketValidation: 'Families asked for this',
    },
    feasibilityPlan: {
      technicalApproach: 'Raised beds and irrigation',
      operationalPlan: 'Weekly volunteer sessions',
      validationEvidence: 'Two growers offered advice',
      assumptions: 'Water is available',
      risks: 'Drought risk',
    },
    financingPlan: {
      currency: 'BWP',
      totalFundingNeeded: 999999,
      fundingSources: 'Community grants',
      costs: [
        { item: 'Irrigation', amount: 10.1, description: '' },
        { item: 'Seeds', amount: 5.2, description: 'First season' },
      ],
    },
    milestones: [
      {
        title: 'Prepare beds',
        targetDate: '2027-06-01',
        successMeasure: 'Three beds ready',
        estimatedCost: null,
      },
    ],
    aiAnalysisConsent: true,
  };
}
