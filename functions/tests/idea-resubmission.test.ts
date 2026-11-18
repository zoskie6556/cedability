import { describe, expect, it } from 'vitest';
import { parseResubmissionInput } from '../src/lib/idea-resubmission';

const ownerUid = 'owner-1';
const ideaId = 'idea-1';
const attachment = {
  id: '0f881e52-7649-4873-8290-15a663d8d568',
  name: 'project-plan.pdf',
  storagePath:
    'users/owner-1/thato/ideas/idea-1/images/0f881e52-7649-4873-8290-15a663d8d568.pdf',
  contentType: 'application/pdf',
  sizeBytes: 128,
};

function requestWithAttachments(attachments: unknown) {
  return {
    ideaId,
    expectedVersion: 1,
    idea: {
      ownerId: ownerUid,
      ownerName: 'Thato',
      title: 'Community garden',
      problem: 'Fresh food is difficult to access.',
      proposedSolution: 'Build a shared garden.',
      intendedBeneficiaries: 'Local families',
      plannedLocation: 'Gaborone',
      marketPlan: {
        targetMarket: 'Families',
        alternatives: 'Nearby shops',
        differentiation: 'Locally grown produce',
        marketValidation: 'Families asked for this',
      },
      feasibilityPlan: {
        technicalApproach: 'Raised beds',
        operationalPlan: 'Weekly sessions',
        validationEvidence: 'Two growers offered support',
        assumptions: 'Water is available',
        risks: 'Drought',
      },
      financingPlan: {
        currency: 'BWP',
        fundingSources: 'Community grants',
        costs: [{ item: 'Tools', amount: 100, description: '' }],
      },
      milestones: [
        {
          title: 'Prepare beds',
          targetDate: '2027-06-01',
          successMeasure: 'Three beds ready',
          estimatedCost: null,
        },
      ],
      attachments,
      aiAnalysisConsent: true,
    },
  };
}

describe('idea resubmission attachments', () => {
  it('accepts valid owner-scoped file references', () => {
    const parsed = parseResubmissionInput(requestWithAttachments([attachment]), ownerUid);
    expect(parsed.plan.attachments).toEqual([attachment]);
  });

  it('rejects attachment paths owned by another user or idea', () => {
    const wrongOwner = { ...attachment, storagePath: attachment.storagePath.replace('owner-1', 'other-1') };
    expect(() => parseResubmissionInput(requestWithAttachments([wrongOwner]), ownerUid)).toThrow(
      'An attachment is invalid.',
    );
  });
});
