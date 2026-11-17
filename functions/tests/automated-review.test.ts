import { describe, expect, it } from 'vitest';
import { parseAutomatedReviewResponse, reportInformationGaps } from '../src/lib/automated-review';
import type { FirestoreTimestampValue } from '../src/shared/automated-review.model';

const criteria = ['market', 'technical', 'operations', 'financial', 'delivery', 'impact'] as const;

function validResponse(): string {
  const finding = {
    status: 'supported',
    evidence: ['The plan names a local supplier.'],
    informationGaps: [],
    evaluatorQuestions: [],
  };
  return JSON.stringify({
    summary: 'The plan describes a local service.',
    criteria: Object.fromEntries(criteria.map((criterion) => [criterion, finding])),
    strengths: ['A local supplier is identified.'],
    informationGaps: [],
    questionsForHumanEvaluator: ['How will maintenance be scheduled?'],
    limitations: ['This is an advisory review.'],
  });
}

describe('parseAutomatedReviewResponse', () => {
  const startedAt = makeTimestamp(1);
  const completedAt = makeTimestamp(2);

  it('validates the complete rubric and returns an AutomatedReviewReport', () => {
    const report = parseAutomatedReviewResponse(validResponse(), startedAt, completedAt);

    expect(report.status).toBe('complete');
    expect(Object.keys(report.criteria ?? {}).sort()).toEqual([...criteria].sort());
    expect(report.startedAt).toBe(startedAt);
    expect(report.completedAt).toBe(completedAt);
    expect(report.failureMessage).toBeNull();
  });

  it('rejects missing rubric fields and unrecognized response fields', () => {
    const missingCriterion = JSON.parse(validResponse()) as Record<string, unknown>;
    const rawCriteria = missingCriterion['criteria'] as Record<string, unknown>;
    delete rawCriteria['impact'];

    expect(() =>
      parseAutomatedReviewResponse(JSON.stringify(missingCriterion), startedAt, completedAt),
    ).toThrow('The criteria fields do not match the required schema.');
    expect(() =>
      parseAutomatedReviewResponse(
        JSON.stringify({ ...JSON.parse(validResponse()), verdict: 'approved' }),
        startedAt,
        completedAt,
      ),
    ).toThrow('The model response fields do not match the required schema.');
  });

  it('rejects invalid finding statuses and oversized arrays', () => {
    const invalidStatus = JSON.parse(validResponse()) as Record<string, unknown>;
    const rawCriteria = invalidStatus['criteria'] as Record<string, Record<string, unknown>>;
    rawCriteria['market']['status'] = 'approved';

    expect(() =>
      parseAutomatedReviewResponse(JSON.stringify(invalidStatus), startedAt, completedAt),
    ).toThrow('The model returned an invalid finding status.');

    const oversizedList = JSON.parse(validResponse()) as Record<string, unknown>;
    oversizedList['strengths'] = Array.from({ length: 13 }, () => 'A bounded strength.');
    expect(() =>
      parseAutomatedReviewResponse(JSON.stringify(oversizedList), startedAt, completedAt),
    ).toThrow('The strengths value is not a bounded list.');
  });

  it('reports criterion-level information gaps for the amendment decision', () => {
    const response = JSON.parse(validResponse()) as Record<string, unknown>;
    const rawCriteria = response['criteria'] as Record<string, Record<string, unknown>>;
    rawCriteria['financial'] = {
      status: 'not-enough-information',
      evidence: [],
      informationGaps: [],
      evaluatorQuestions: [],
    };
    const report = parseAutomatedReviewResponse(
      JSON.stringify(response),
      startedAt,
      completedAt,
    );

    expect(reportInformationGaps(report)).toContain('financial needs more information');
  });
});

function makeTimestamp(milliseconds: number): FirestoreTimestampValue {
  const value = new Date(milliseconds);
  return {
    toDate: () => value,
    toMillis: () => milliseconds,
  };
}
