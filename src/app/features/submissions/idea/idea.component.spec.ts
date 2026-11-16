import { FormBuilder } from '@angular/forms';
import { Auth, user } from '@angular/fire/auth';
import type { User as FirebaseUser } from '@angular/fire/auth';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserDataService } from '../../../core/services/user-data.service';
import { SpeechService } from '../../../core/services/speech.service';
import { IdeaComponent } from './idea.component';
import { IdeaDraftService } from './idea-draft.service';
import { buildIdeaForm, toNewIdea } from './idea-form';

vi.mock('@angular/fire/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/fire/auth')>();
  return { ...actual, user: vi.fn() };
});

const authenticatedUser = {
  uid: 'user-123',
  displayName: 'Casey Example',
  email: 'casey@example.com',
  emailVerified: true,
} as FirebaseUser;

const answers = {
  basics: {
    title: 'Community garden',
    problem: 'Families have limited access to fresh food.',
    proposedSolution: 'Create a shared garden and growing workshops.',
    intendedBeneficiaries: 'Families and local growers.',
    plannedLocation: 'Gaborone',
  },
  market: {
    targetMarket: 'Families in the neighborhood.',
    alternatives: 'Families currently travel to distant shops.',
    differentiation: 'A shared local garden with training.',
    marketValidation: 'Ten families and two growers expressed interest.',
  },
  feasibility: {
    technicalApproach: 'Use raised beds and drip irrigation.',
    operationalPlan: 'Local growers will coordinate weekly sessions.',
    validationEvidence: 'Two growers offered to advise.',
    assumptions: 'Water will be available throughout the season.',
    risks: 'Drought risk can be reduced with water storage.',
  },
  financing: {
    currency: 'BWP',
    fundingSources: 'Community grants and local contributions.',
    costs: [
      {
        item: 'Irrigation equipment',
        amount: 9000,
        description: 'Tanks, pipes, and drip lines.',
      },
    ],
  },
  milestones: [
    {
      title: 'Prepare the garden',
      targetDate: '2027-06-01',
      successMeasure: 'Three raised beds ready for planting.',
      estimatedCost: 8000,
    },
  ],
  consent: { aiAnalysis: true },
};

describe('IdeaComponent', () => {
  const toastService = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  };
  const userDataService = {
    getOrCreateUser: vi.fn(),
    createIdea: vi.fn(),
  };
  const draftService = {
    load: vi.fn(),
    save: vi.fn(),
    clear: vi.fn(),
  };
  const speechService = {
    listening: signal(false),
    owner: signal<unknown>(null),
    transcript: signal(''),
    start: vi.fn(),
    stop: vi.fn(),
    speak: vi.fn(),
  };
  const router = {
    navigate: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(user).mockReturnValue(of(authenticatedUser));
    userDataService.getOrCreateUser.mockResolvedValue({ fullName: 'Casey Example' });
    userDataService.createIdea.mockResolvedValue('idea-123');
    draftService.load.mockReturnValue(null);
    router.navigate.mockResolvedValue(true);

    await TestBed.configureTestingModule({
      imports: [IdeaComponent],
      providers: [
        { provide: Auth, useValue: {} },
        { provide: ToastService, useValue: toastService },
        { provide: UserDataService, useValue: userDataService },
        { provide: IdeaDraftService, useValue: draftService },
        { provide: SpeechService, useValue: speechService },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();
  });

  it('blocks Next while the current step is empty', async () => {
    const fixture = TestBed.createComponent(IdeaComponent);
    fixture.detectChanges();

    const next = fixture.nativeElement.querySelector('.actions .primary') as HTMLButtonElement;
    next.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h2')?.textContent).toContain('Step 1 of 6');
    expect(toastService.info).toHaveBeenCalledWith(
      'Please fix the highlighted answers before continuing.',
    );
    expect(userDataService.createIdea).not.toHaveBeenCalled();
  });

  it('submits the toNewIdea output for the authenticated user', async () => {
    const fixture = TestBed.createComponent(IdeaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const setInput = (id: string, value: string): void => {
      const input = fixture.nativeElement.querySelector(`#${id}`) as
        | HTMLInputElement
        | HTMLTextAreaElement;
      expect(input, id).not.toBeNull();
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    };

    const continueStep = async (): Promise<void> => {
      const next = fixture.nativeElement.querySelector('.actions .primary') as HTMLButtonElement;
      next.click();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    setInput('title', answers.basics.title);
    setInput('problem', answers.basics.problem);
    setInput('solution', answers.basics.proposedSolution);
    setInput('beneficiaries', answers.basics.intendedBeneficiaries);
    setInput('location', answers.basics.plannedLocation);
    await continueStep();

    setInput('target-market', answers.market.targetMarket);
    setInput('alternatives', answers.market.alternatives);
    setInput('differentiation', answers.market.differentiation);
    setInput('validation', answers.market.marketValidation);
    await continueStep();

    setInput('technical', answers.feasibility.technicalApproach);
    setInput('operations', answers.feasibility.operationalPlan);
    setInput('evidence', answers.feasibility.validationEvidence);
    setInput('assumptions', answers.feasibility.assumptions);
    setInput('risks', answers.feasibility.risks);
    await continueStep();

    setInput('cost-0-item', answers.financing.costs[0].item);
    setInput('cost-0-amount', String(answers.financing.costs[0].amount));
    setInput('cost-0-desc', answers.financing.costs[0].description);
    setInput('funding-sources', answers.financing.fundingSources);
    await continueStep();

    setInput('ms-0-title', answers.milestones[0].title);
    setInput('ms-0-date', answers.milestones[0].targetDate);
    setInput('ms-0-measure', answers.milestones[0].successMeasure);
    setInput('ms-0-cost', String(answers.milestones[0].estimatedCost));
    await continueStep();

    const consent = fixture.nativeElement.querySelector('#ai-consent') as HTMLInputElement;
    consent.checked = true;
    consent.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    const expectedForm = buildIdeaForm(new FormBuilder().nonNullable);
    expectedForm.patchValue(answers);
    expect(userDataService.createIdea).toHaveBeenCalledWith(
      toNewIdea(expectedForm, authenticatedUser.uid, 'Casey Example'),
    );
    expect(toastService.success).toHaveBeenCalledWith('Your idea was submitted.');
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });
});
