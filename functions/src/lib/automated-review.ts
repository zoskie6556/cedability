import type {
  AutomatedReviewCriterion,
  AutomatedReviewFinding,
  AutomatedReviewReport,
  FirestoreTimestampValue,
  ReviewFindingStatus,
} from '../shared/automated-review.model';

export const MODEL = 'gemini-3.5-flash-lite';
export const RUBRIC_VERSION = 'cedability-v1';
export const CRITERIA = [
  'market',
  'technical',
  'operations',
  'financial',
  'delivery',
  'impact',
] as const satisfies readonly AutomatedReviewCriterion[];

const MAX_SUMMARY_LENGTH = 1500;
const MAX_ITEM_LENGTH = 600;
const MAX_LIST_ITEMS = 12;

const findingSchema = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['supported', 'unclear', 'risk', 'not-enough-information'],
    },
    evidence: { type: 'array', items: { type: 'string' } },
    informationGaps: { type: 'array', items: { type: 'string' } },
    evaluatorQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['status', 'evidence', 'informationGaps', 'evaluatorQuestions'],
};

export const AUTOMATED_REVIEW_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    criteria: {
      type: 'object',
      properties: Object.fromEntries(CRITERIA.map((criterion) => [criterion, findingSchema])),
      required: [...CRITERIA],
    },
    strengths: { type: 'array', items: { type: 'string' } },
    informationGaps: { type: 'array', items: { type: 'string' } },
    questionsForHumanEvaluator: { type: 'array', items: { type: 'string' } },
    limitations: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'summary',
    'criteria',
    'strengths',
    'informationGaps',
    'questionsForHumanEvaluator',
    'limitations',
  ],
};

export function createRunningReport(startedAt: FirestoreTimestampValue): AutomatedReviewReport {
  return {
    status: 'running',
    model: MODEL,
    rubricVersion: RUBRIC_VERSION,
    summary: '',
    criteria: null,
    strengths: [],
    informationGaps: [],
    questionsForHumanEvaluator: [],
    limitations: [],
    startedAt,
    completedAt: null,
    failureMessage: null,
  };
}

export function createFailedReport(
  startedAt: FirestoreTimestampValue,
  completedAt: FirestoreTimestampValue,
  failureMessage: string,
  informationGaps: string[] = [],
): AutomatedReviewReport {
  return {
    status: 'failed',
    model: MODEL,
    rubricVersion: RUBRIC_VERSION,
    summary: '',
    criteria: null,
    strengths: [],
    informationGaps,
    questionsForHumanEvaluator: [],
    limitations: [],
    startedAt,
    completedAt,
    failureMessage,
  };
}

export function parseAutomatedReviewResponse(
  value: string | undefined,
  startedAt: FirestoreTimestampValue,
  completedAt: FirestoreTimestampValue,
): AutomatedReviewReport {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('The model returned an empty response.');
  }

  const output = requireRecord(JSON.parse(value) as unknown, 'model response');
  requireExactKeys(
    output,
    [
      'summary',
      'criteria',
      'strengths',
      'informationGaps',
      'questionsForHumanEvaluator',
      'limitations',
    ],
    'model response',
  );
  const rawCriteria = requireRecord(output['criteria'], 'criteria');
  requireExactKeys(rawCriteria, CRITERIA, 'criteria');

  return {
    status: 'complete',
    model: MODEL,
    rubricVersion: RUBRIC_VERSION,
    summary: requireText(output['summary'], 'summary', MAX_SUMMARY_LENGTH),
    criteria: {
      market: parseFinding(rawCriteria['market']),
      technical: parseFinding(rawCriteria['technical']),
      operations: parseFinding(rawCriteria['operations']),
      financial: parseFinding(rawCriteria['financial']),
      delivery: parseFinding(rawCriteria['delivery']),
      impact: parseFinding(rawCriteria['impact']),
    },
    strengths: requireTextArray(output['strengths'], 'strengths'),
    informationGaps: requireTextArray(output['informationGaps'], 'informationGaps'),
    questionsForHumanEvaluator: requireTextArray(
      output['questionsForHumanEvaluator'],
      'questionsForHumanEvaluator',
    ),
    limitations: requireTextArray(output['limitations'], 'limitations'),
    startedAt,
    completedAt,
    failureMessage: null,
  };
}

export function reportInformationGaps(report: AutomatedReviewReport): string[] {
  const gaps = new Set(report.informationGaps);
  if (!report.criteria) {
    return [...gaps];
  }

  for (const criterion of CRITERIA) {
    const finding = report.criteria[criterion];
    for (const gap of finding.informationGaps) {
      gaps.add(gap);
    }
    if (finding.status === 'not-enough-information' && finding.informationGaps.length === 0) {
      gaps.add(`${criterion} needs more information`);
    }
  }
  return [...gaps];
}

function parseFinding(value: unknown): AutomatedReviewFinding {
  const finding = requireRecord(value, 'finding');
  requireExactKeys(
    finding,
    ['status', 'evidence', 'informationGaps', 'evaluatorQuestions'],
    'finding',
  );
  const status = finding['status'];
  if (!isReviewFindingStatus(status)) {
    throw new Error('The model returned an invalid finding status.');
  }

  return {
    status,
    evidence: requireTextArray(finding['evidence'], 'evidence'),
    informationGaps: requireTextArray(finding['informationGaps'], 'finding informationGaps'),
    evaluatorQuestions: requireTextArray(finding['evaluatorQuestions'], 'evaluatorQuestions'),
  };
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`The ${field} value is not an object.`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  field: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`The ${field} fields do not match the required schema.`);
  }
}

function requireText(value: unknown, field: string, maximumLength: number): string {
  if (typeof value !== 'string') {
    throw new Error(`The ${field} value is not text.`);
  }
  const text = value.trim();
  if (text.length === 0 || text.length > maximumLength) {
    throw new Error(`The ${field} value is empty or too long.`);
  }
  return text;
}

function requireTextArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) {
    throw new Error(`The ${field} value is not a bounded list.`);
  }
  return value.map((item) => requireText(item, field, MAX_ITEM_LENGTH));
}

function isReviewFindingStatus(value: unknown): value is ReviewFindingStatus {
  return (
    value === 'supported' ||
    value === 'unclear' ||
    value === 'risk' ||
    value === 'not-enough-information'
  );
}
