import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import type { NewIdea } from '../../../shared/models/idea.model';

/**
 * The idea form's STRUCTURE, validation and mapping, kept out of the component so it
 * is easy to read, test and debug. The shape mirrors `NewIdea` and the create rule in
 * firestore.rules (every plan field present, at least 1 cost, at least 1 milestone,
 * AI consent true).
 */
export const TITLE_MAX = 120;
export const SHORT_MAX = 500;
export const LONG_MAX = 2000;

/** `Validators.required` accepts "   ". This one does not. */
export function notBlank(control: AbstractControl): ValidationErrors | null {
  return typeof control.value === 'string' && control.value.trim().length === 0
    ? { blank: true }
    : null;
}

export type CostGroup = FormGroup<{
  item: FormControl<string>;
  amount: FormControl<number | null>;
  description: FormControl<string>;
}>;

export type MilestoneGroup = FormGroup<{
  title: FormControl<string>;
  targetDate: FormControl<string>;
  successMeasure: FormControl<string>;
  estimatedCost: FormControl<number | null>;
}>;

export type IdeaFormGroup = ReturnType<typeof buildIdeaForm>;

/** One step of the form: its heading, help text, and the form-group key it validates. */
export const STEPS = [
  { key: 'basics', label: 'Your idea', intro: 'Tell us what your idea is and who it helps.' },
  { key: 'market', label: 'Your market', intro: 'Who will use or buy it, and why will they choose you?' },
  { key: 'feasibility', label: 'Can it work?', intro: 'Show how you will build it and what could go wrong.' },
  { key: 'financing', label: 'The money', intro: 'List what it will cost. We add up the total for you.' },
  { key: 'milestones', label: 'Milestones', intro: 'Break the work into steps with dates.' },
  { key: 'consent', label: 'Review and send', intro: 'Check everything, then send your idea.' },
] as const;

export type StepKey = (typeof STEPS)[number]['key'];

export function buildIdeaForm(fb: NonNullableFormBuilder) {
  const text = (max: number) => fb.control('', [Validators.required, notBlank, Validators.maxLength(max)]);

  return fb.group({
    basics: fb.group({
      title: text(TITLE_MAX),
      problem: text(LONG_MAX),
      proposedSolution: text(LONG_MAX),
      intendedBeneficiaries: text(SHORT_MAX),
      plannedLocation: text(SHORT_MAX),
    }),
    market: fb.group({
      targetMarket: text(LONG_MAX),
      alternatives: text(LONG_MAX),
      differentiation: text(LONG_MAX),
      marketValidation: text(LONG_MAX),
    }),
    feasibility: fb.group({
      technicalApproach: text(LONG_MAX),
      operationalPlan: text(LONG_MAX),
      validationEvidence: text(LONG_MAX),
      assumptions: text(LONG_MAX),
      risks: text(LONG_MAX),
    }),
    financing: fb.group({
      currency: fb.control('BWP', [Validators.required]),
      fundingSources: text(SHORT_MAX),
      // The rules require at least one cost item, so we start with one row.
      costs: fb.array<CostGroup>([newCostGroup(fb)], [minRows(1)]),
    }),
    milestones: fb.array<MilestoneGroup>([newMilestoneGroup(fb)], [minRows(1)]),
    consent: fb.group({
      aiAnalysis: fb.control(false, [Validators.requiredTrue]),
    }),
  });
}

export function newCostGroup(fb: NonNullableFormBuilder): CostGroup {
  return fb.group({
    item: fb.control('', [Validators.required, notBlank, Validators.maxLength(SHORT_MAX)]),
    amount: fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    description: fb.control('', [Validators.maxLength(SHORT_MAX)]),
  });
}

export function newMilestoneGroup(fb: NonNullableFormBuilder): MilestoneGroup {
  return fb.group({
    title: fb.control('', [Validators.required, notBlank, Validators.maxLength(SHORT_MAX)]),
    targetDate: fb.control('', [Validators.required]),
    successMeasure: fb.control('', [Validators.required, notBlank, Validators.maxLength(SHORT_MAX)]),
    // Optional: the model allows null.
    estimatedCost: fb.control<number | null>(null, [Validators.min(0)]),
  });
}

function minRows(min: number) {
  return (control: AbstractControl): ValidationErrors | null =>
    control instanceof FormArray && control.length < min ? { minRows: { min } } : null;
}

export function sumCosts(costs: ReadonlyArray<{ amount?: number | null }>): number {
  const total = costs.reduce((sum, cost) => sum + (cost.amount ?? 0), 0);
  return Math.round(total * 100) / 100;
}

/**
 * How many REQUIRED fields are filled in correctly. Powers the "form completeness" meter.
 * Optional fields (no required validator) are not counted, so they never lower the %.
 */
export function completenessOf(control: AbstractControl): { filled: number; total: number } {
  if (control instanceof FormGroup) {
    return Object.values(control.controls).reduce(
      (acc, child) => addCounts(acc, completenessOf(child)),
      { filled: 0, total: 0 },
    );
  }
  if (control instanceof FormArray) {
    return control.controls.reduce((acc, child) => addCounts(acc, completenessOf(child)), {
      filled: 0,
      total: 0,
    });
  }
  const required =
    control.hasValidator(Validators.required) || control.hasValidator(Validators.requiredTrue);
  if (!required) return { filled: 0, total: 0 };
  return { filled: control.valid ? 1 : 0, total: 1 };
}

function addCounts(
  a: { filled: number; total: number },
  b: { filled: number; total: number },
): { filled: number; total: number } {
  return { filled: a.filled + b.filled, total: a.total + b.total };
}

/** Turn the validated form into the exact object `UserDataService.createIdea` expects. */
export function toNewIdea(form: IdeaFormGroup, ownerId: string, ownerName: string): NewIdea {
  const v = form.getRawValue();
  const trim = (s: string) => s.trim();
  const costs = v.financing.costs.map((c) => ({
    item: trim(c.item),
    amount: c.amount ?? 0,
    description: trim(c.description),
  }));

  return {
    ownerId,
    ownerName,
    title: trim(v.basics.title),
    problem: trim(v.basics.problem),
    proposedSolution: trim(v.basics.proposedSolution),
    intendedBeneficiaries: trim(v.basics.intendedBeneficiaries),
    plannedLocation: trim(v.basics.plannedLocation),
    marketPlan: {
      targetMarket: trim(v.market.targetMarket),
      alternatives: trim(v.market.alternatives),
      differentiation: trim(v.market.differentiation),
      marketValidation: trim(v.market.marketValidation),
    },
    feasibilityPlan: {
      technicalApproach: trim(v.feasibility.technicalApproach),
      operationalPlan: trim(v.feasibility.operationalPlan),
      validationEvidence: trim(v.feasibility.validationEvidence),
      assumptions: trim(v.feasibility.assumptions),
      risks: trim(v.feasibility.risks),
    },
    financingPlan: {
      currency: v.financing.currency,
      // Always the sum of the cost rows, so the two can never disagree.
      totalFundingNeeded: sumCosts(costs),
      fundingSources: trim(v.financing.fundingSources),
      costs,
    },
    milestones: v.milestones.map((m) => ({
      title: trim(m.title),
      targetDate: m.targetDate,
      successMeasure: trim(m.successMeasure),
      estimatedCost: m.estimatedCost,
    })),
    aiAnalysisConsent: v.consent.aiAnalysis,
  };
}
