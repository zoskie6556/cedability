import { IDEA_CATEGORIES, type IdeaCategory } from '../shared/automated-review.model';

const CATEGORY_KEYWORDS: Readonly<Record<Exclude<IdeaCategory, 'other'>, readonly string[]>> = {
  health: [
    'health',
    'healthcare',
    'clinic',
    'medical',
    'medicine',
    'hospital',
    'patient',
    'nurse',
    'wellness',
    'diagnostic',
    'pharmacy',
  ],
  agriculture: [
    'agriculture',
    'farm',
    'farmer',
    'crop',
    'livestock',
    'irrigation',
    'seed',
    'harvest',
    'garden',
    'ranch',
  ],
  tech: [
    'technology',
    'tech',
    'software',
    'app',
    'digital',
    'platform',
    'mobile',
    'internet',
    'data',
    'artificial',
    'automation',
  ],
  business: [
    'business',
    'enterprise',
    'startup',
    'manufacturing',
    'production',
    'service',
    'company',
    'industry',
  ],
  marketing: [
    'marketing',
    'advertising',
    'brand',
    'promotion',
    'campaign',
    'publicity',
    'social',
    'media',
  ],
  sales: ['sales', 'sell', 'selling', 'retail', 'store', 'shop', 'marketplace', 'commerce'],
};

const CATEGORY_ORDER = IDEA_CATEGORIES.filter(
  (category): category is Exclude<IdeaCategory, 'other'> => category !== 'other',
);

export function categorizeIdea(planText: string): IdeaCategory {
  const words = new Set(tokenize(planText));
  let selected: IdeaCategory = 'other';
  let selectedCount = 0;

  for (const category of CATEGORY_ORDER) {
    const count = CATEGORY_KEYWORDS[category].reduce(
      (total, keyword) => total + (words.has(keyword) ? 1 : 0),
      0,
    );
    if (count > selectedCount) {
      selected = category;
      selectedCount = count;
    }
  }

  return selected;
}

export function extractIdeaPlanText(value: unknown): string {
  const idea = asRecord(value);
  if (!idea) {
    return '';
  }

  const parts = [
    readText(idea, 'title'),
    readText(idea, 'problem'),
    readText(idea, 'proposedSolution'),
    readText(idea, 'intendedBeneficiaries'),
    readText(idea, 'plannedLocation'),
  ];

  for (const sectionName of ['marketPlan', 'feasibilityPlan', 'financingPlan']) {
    const section = asRecord(idea[sectionName]);
    if (section) {
      parts.push(...Object.values(section).filter(isText));
    }
  }

  const costs = idea['financingPlan'];
  const costRows = asRecord(costs)?.['costs'];
  if (Array.isArray(costRows)) {
    for (const row of costRows) {
      const cost = asRecord(row);
      if (cost) {
        parts.push(readText(cost, 'item'), readText(cost, 'description'));
      }
    }
  }

  const milestones = idea['milestones'];
  if (Array.isArray(milestones)) {
    for (const row of milestones) {
      const milestone = asRecord(row);
      if (milestone) {
        parts.push(readText(milestone, 'title'), readText(milestone, 'successMeasure'));
      }
    }
  }

  return parts.filter((part) => part.trim().length > 0).join(' ');
}

function tokenize(value: string): string[] {
  return value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readText(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return isText(value) ? value : '';
}

function isText(value: unknown): value is string {
  return typeof value === 'string';
}
