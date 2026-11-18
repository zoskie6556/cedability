import { FormBuilder } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import {
  buildIdeaForm,
  completenessOf,
  newCostGroup,
  newMilestoneGroup,
  sumCosts,
  toIdeaFormValue,
  toNewIdea,
} from './idea-form';
import type { Idea } from '../../../shared/models/idea.model';

function makeForm() {
  const fb = new FormBuilder().nonNullable;
  return { fb, form: buildIdeaForm(fb) };
}

function fillEverything(form: ReturnType<typeof makeForm>['form']) {
  form.patchValue({
    basics: {
      title: '  Solar cold rooms ',
      problem: 'Vegetables rot.',
      proposedSolution: 'Solar cold rooms.',
      intendedBeneficiaries: '200 farmers',
      plannedLocation: 'Francistown',
    },
    market: { targetMarket: 'Farmers', alternatives: 'None', differentiation: 'Cheaper', marketValidation: 'Asked 20' },
    feasibility: {
      technicalApproach: 'Panels', operationalPlan: 'Daily', validationEvidence: 'Pilot', assumptions: 'Sun', risks: 'Theft',
    },
    financing: { currency: 'BWP', fundingSources: 'Savings' },
    consent: { aiAnalysis: true },
  });
  form.controls.financing.controls.costs.at(0).patchValue({ item: 'Panels', amount: 1000.5 });
  form.controls.milestones.at(0).patchValue({ title: 'Install', targetDate: '2027-03-01', successMeasure: '5 rooms' });
}

describe('idea form', () => {
  it('starts invalid with one cost row and one milestone row (the rules need at least one of each)', () => {
    const { form } = makeForm();
    expect(form.valid).toBe(false);
    expect(form.controls.financing.controls.costs.length).toBe(1);
    expect(form.controls.milestones.length).toBe(1);
  });

  it('rejects whitespace-only answers', () => {
    const { form } = makeForm();
    form.controls.basics.controls.title.setValue('    ');
    expect(form.controls.basics.controls.title.hasError('blank')).toBe(true);
  });

  it('requires the AI consent tick', () => {
    const { form } = makeForm();
    fillEverything(form);
    expect(form.valid).toBe(true);
    form.controls.consent.controls.aiAnalysis.setValue(false);
    expect(form.valid).toBe(false);
  });

  it('counts only required fields in completeness and ignores optional ones', () => {
    const { form } = makeForm();
    const empty = completenessOf(form);
    expect(empty.filled).toBe(1); // currency has a default
    fillEverything(form);
    const full = completenessOf(form);
    expect(full.filled).toBe(full.total);
    // estimatedCost and cost notes are optional, so a new empty row only adds its required fields
    const before = completenessOf(form).total;
    form.controls.milestones.push(newMilestoneGroup(new FormBuilder().nonNullable));
    expect(completenessOf(form).total).toBe(before + 3);
  });

  it('maps to the NewIdea contract, trims text and sums the costs', () => {
    const { fb, form } = makeForm();
    fillEverything(form);
    form.controls.financing.controls.costs.push(newCostGroup(fb));
    form.controls.financing.controls.costs.at(1).patchValue({ item: 'Fans', amount: 99.5 });

    const idea = toNewIdea(form, 'uid-1', 'Thato');
    expect(idea.title).toBe('Solar cold rooms');
    expect(idea.ownerId).toBe('uid-1');
    expect(idea.financingPlan.totalFundingNeeded).toBe(1100);
    expect(idea.financingPlan.costs).toHaveLength(2);
    expect(idea.milestones[0].estimatedCost).toBeNull();
    expect(idea.aiAnalysisConsent).toBe(true);
    // exactly the keys the create rule allows (status/createdAt/automatedReview are added by the service)
    expect(Object.keys(idea).sort()).toEqual(
      ['aiAnalysisConsent', 'feasibilityPlan', 'financingPlan', 'intendedBeneficiaries', 'marketPlan',
       'milestones', 'attachments', 'ownerId', 'ownerName', 'plannedLocation', 'problem', 'proposedSolution', 'title'].sort(),
    );
  });

  it('prefills all plan sections and repeated rows from an existing idea', () => {
    const { fb, form } = makeForm();
    fillEverything(form);
    form.controls.financing.controls.costs.push(newCostGroup(fb));
    form.controls.financing.controls.costs.at(1).patchValue({
      item: 'Fans',
      amount: 99.5,
      description: 'Ventilation',
    });
    form.controls.milestones.push(newMilestoneGroup(fb));
    form.controls.milestones.at(1).patchValue({
      title: 'Plant first crop',
      targetDate: '2027-07-01',
      successMeasure: 'First harvest ready',
      estimatedCost: 250,
    });

    const newIdea = toNewIdea(form, 'uid-1', 'Thato');
    const idea: Idea = {
      ...newIdea,
      id: 'idea-1',
      category: null,
      similarityCheck: null,
      automatedReview: null,
      status: 'needs_amendment',
      version: 2,
      createdAt: null,
      submittedAt: null,
      updatedAt: null,
    };
    const { fb: targetFb, form: targetForm } = makeForm();
    targetForm.controls.financing.controls.costs.push(newCostGroup(targetFb));
    targetForm.controls.milestones.push(newMilestoneGroup(targetFb));
    targetForm.patchValue(toIdeaFormValue(idea));

    expect(targetForm.controls.basics.controls.title.value).toBe('Solar cold rooms');
    expect(targetForm.controls.financing.controls.costs.length).toBe(2);
    expect(targetForm.controls.financing.controls.costs.at(1).controls.item.value).toBe('Fans');
    expect(targetForm.controls.milestones.length).toBe(2);
    expect(targetForm.controls.milestones.at(1).controls.title.value).toBe('Plant first crop');
    expect(targetForm.controls.consent.controls.aiAnalysis.value).toBe(true);
  });

  it('sums money without floating point noise', () => {
    expect(sumCosts([{ amount: 0.1 }, { amount: 0.2 }, { amount: null }, {}])).toBe(0.3);
  });
});
