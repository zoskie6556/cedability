export interface ScreeningInput {
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
    costs: Array<{ item: string; amount: number; description: string }>;
  };
  milestones: Array<{
    title: string;
    targetDate: string;
    successMeasure: string;
    estimatedCost: number | null;
  }>;
}

const REQUIRED_TEXT_FIELDS = [
  { path: ['title'], label: 'idea title', maximumLength: 120 },
  { path: ['problem'], label: 'problem description', maximumLength: 2000 },
  { path: ['proposedSolution'], label: 'proposed solution', maximumLength: 2000 },
  { path: ['intendedBeneficiaries'], label: 'intended beneficiaries', maximumLength: 500 },
  { path: ['plannedLocation'], label: 'planned location', maximumLength: 500 },
  { path: ['marketPlan', 'targetMarket'], label: 'target market', maximumLength: 2000 },
  { path: ['marketPlan', 'alternatives'], label: 'current alternatives', maximumLength: 2000 },
  { path: ['marketPlan', 'differentiation'], label: 'market differentiation', maximumLength: 2000 },
  { path: ['marketPlan', 'marketValidation'], label: 'market validation', maximumLength: 2000 },
  { path: ['feasibilityPlan', 'technicalApproach'], label: 'technical approach', maximumLength: 2000 },
  { path: ['feasibilityPlan', 'operationalPlan'], label: 'operational plan', maximumLength: 2000 },
  { path: ['feasibilityPlan', 'validationEvidence'], label: 'validation evidence', maximumLength: 2000 },
  { path: ['feasibilityPlan', 'assumptions'], label: 'assumptions', maximumLength: 2000 },
  { path: ['feasibilityPlan', 'risks'], label: 'risks', maximumLength: 2000 },
  { path: ['financingPlan', 'currency'], label: 'funding currency', maximumLength: 10 },
  { path: ['financingPlan', 'fundingSources'], label: 'funding sources', maximumLength: 500 },
] as const;

export function findMissingInformation(value: unknown): string[] {
  const idea = asRecord(value);
  if (!idea) {
    return ['idea details'];
  }

  const missing: string[] = REQUIRED_TEXT_FIELDS
    .filter(({ path, maximumLength }) => {
      const fieldValue = readPath(idea, path);
      return (
        typeof fieldValue !== 'string' ||
        fieldValue.trim().length === 0 ||
        fieldValue.length > maximumLength
      );
    })
    .map(({ label }) => label);

  const financing = asRecord(idea['financingPlan']);
  const costs = financing?.['costs'];
  if (!Array.isArray(costs) || costs.length === 0) {
    missing.push('at least one cost item');
  } else {
    if (costs.length > 10) missing.push('no more than ten cost items');
    costs.forEach((value, index) => {
      const cost = asRecord(value);
      if (!hasText(cost?.['item'], 120) || !isPositiveNumber(cost?.['amount'])) {
        missing.push(`cost item ${index + 1}`);
      }
    });
  }

  const totalFundingNeeded = financing?.['totalFundingNeeded'];
  if (!isPositiveNumber(totalFundingNeeded)) {
    missing.push('a valid total funding amount');
  }

  const milestones = idea['milestones'];
  if (!Array.isArray(milestones) || milestones.length === 0) {
    missing.push('at least one milestone');
  } else {
    if (milestones.length > 10) missing.push('no more than ten milestones');
    milestones.forEach((value, index) => {
      const milestone = asRecord(value);
      if (
        !hasText(milestone?.['title'], 120) ||
        !hasText(milestone?.['targetDate'], 40) ||
        !hasText(milestone?.['successMeasure'], 1000)
      ) {
        missing.push(`milestone ${index + 1}`);
      }
    });
  }

  return [...new Set(missing)].slice(0, 20);
}

export function parseScreeningInput(value: unknown): ScreeningInput {
  const idea = requireRecord(value, 'idea');
  const market = requireRecord(idea['marketPlan'], 'marketPlan');
  const feasibility = requireRecord(idea['feasibilityPlan'], 'feasibilityPlan');
  const financing = requireRecord(idea['financingPlan'], 'financingPlan');
  const costs = requireArray(financing['costs'], 'costs').map((value) => {
    const cost = requireRecord(value, 'cost');
    return {
      item: requireText(cost['item'], 'cost.item', 120),
      amount: requireNumber(cost['amount'], 'cost.amount'),
      description: requireText(cost['description'], 'cost.description', 1000, true),
    };
  });
  const milestones = requireArray(idea['milestones'], 'milestones').map((value) => {
    const milestone = requireRecord(value, 'milestone');
    const estimatedCost = milestone['estimatedCost'];
    const parsedEstimatedCost =
      estimatedCost === null
        ? null
        : requireNumber(estimatedCost, 'milestone.estimatedCost');
    if (parsedEstimatedCost !== null && parsedEstimatedCost < 0) {
      throw new Error('The milestone estimated cost cannot be negative.');
    }
    return {
      title: requireText(milestone['title'], 'milestone.title', 120),
      targetDate: requireText(milestone['targetDate'], 'milestone.targetDate', 40),
      successMeasure: requireText(milestone['successMeasure'], 'milestone.successMeasure', 1000),
      estimatedCost: parsedEstimatedCost,
    };
  });
  if (costs.length > 10 || milestones.length > 10) {
    throw new Error('The plan contains too many cost items or milestones.');
  }

  return {
    title: requireText(idea['title'], 'title', 120),
    problem: requireText(idea['problem'], 'problem', 2000),
    proposedSolution: requireText(idea['proposedSolution'], 'proposedSolution', 2000),
    intendedBeneficiaries: requireText(idea['intendedBeneficiaries'], 'intendedBeneficiaries', 500),
    plannedLocation: requireText(idea['plannedLocation'], 'plannedLocation', 500),
    marketPlan: {
      targetMarket: requireText(market['targetMarket'], 'marketPlan.targetMarket', 2000),
      alternatives: requireText(market['alternatives'], 'marketPlan.alternatives', 2000),
      differentiation: requireText(market['differentiation'], 'marketPlan.differentiation', 2000),
      marketValidation: requireText(market['marketValidation'], 'marketPlan.marketValidation', 2000),
    },
    feasibilityPlan: {
      technicalApproach: requireText(
        feasibility['technicalApproach'],
        'feasibilityPlan.technicalApproach',
        2000,
      ),
      operationalPlan: requireText(
        feasibility['operationalPlan'],
        'feasibilityPlan.operationalPlan',
        2000,
      ),
      validationEvidence: requireText(
        feasibility['validationEvidence'],
        'feasibilityPlan.validationEvidence',
        2000,
      ),
      assumptions: requireText(feasibility['assumptions'], 'feasibilityPlan.assumptions', 2000),
      risks: requireText(feasibility['risks'], 'feasibilityPlan.risks', 2000),
    },
    financingPlan: {
      currency: requireText(financing['currency'], 'financingPlan.currency', 10),
      totalFundingNeeded: requireNumber(
        financing['totalFundingNeeded'],
        'financingPlan.totalFundingNeeded',
      ),
      fundingSources: requireText(financing['fundingSources'], 'financingPlan.fundingSources', 500),
      costs,
    },
    milestones,
  };
}

export function serializePlan(value: ScreeningInput): string {
  return JSON.stringify(value);
}

function readPath(record: Record<string, unknown>, path: readonly string[]): unknown {
  let value: unknown = record;
  for (const key of path) {
    const nested = asRecord(value);
    if (!nested) {
      return undefined;
    }
    value = nested[key];
  }
  return value;
}

function hasText(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maximumLength
  );
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  const record = asRecord(value);
  if (!record) {
    throw new Error(`The ${field} value is not an object.`);
  }
  return record;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`The ${field} value is not a list.`);
  }
  return value;
}

function requireText(
  value: unknown,
  field: string,
  maximumLength: number,
  optional = false,
): string {
  if (optional && (value === undefined || value === null || value === '')) {
    return '';
  }
  if (!hasText(value, maximumLength)) {
    throw new Error(`The ${field} value is missing or invalid.`);
  }
  return value.trim();
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`The ${field} value is not a finite number.`);
  }
  return value;
}
