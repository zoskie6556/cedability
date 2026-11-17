import { FormBuilder } from '@angular/forms';
import { Auth, user } from '@angular/fire/auth';
import type { User as FirebaseUser } from '@angular/fire/auth';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserDataService } from '../../../core/services/user-data.service';
import { SpeechService } from '../../../core/services/speech.service';
import { IdeaComponent } from './idea.component';
import { IdeaDraftService } from './idea-draft.service';
import { buildIdeaForm, toNewIdea } from './idea-form';
import type { Idea } from '../../../shared/models/idea.model';

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
  let routeIdeaId: string | null;
  const routeParams = new BehaviorSubject({ get: (_name: string) => routeIdeaId });
  const toastService = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  };
  const userDataService = {
    getOrCreateUser: vi.fn(),
    createIdea: vi.fn(),
    getIdeaById: vi.fn(),
    resubmitIdea: vi.fn(),
  };
  const draftService = {
    load: vi.fn(),
    save: vi.fn(),
    clear: vi.fn(),
  };
  const speechService = {
    supported: vi.fn().mockReturnValue(false),
    canSpeak: vi.fn().mockReturnValue(false),
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
    routeIdeaId = null;
    routeParams.next({ get: (_name: string) => routeIdeaId });
    vi.mocked(user).mockReturnValue(of(authenticatedUser));
    userDataService.getOrCreateUser.mockResolvedValue({ fullName: 'Casey Example' });
    userDataService.createIdea.mockResolvedValue('idea-123');
    userDataService.getIdeaById.mockResolvedValue(null);
    userDataService.resubmitIdea.mockResolvedValue({ ideaId: 'idea-123', version: 5 });
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
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => routeIdeaId } },
            paramMap: routeParams.asObservable(),
          },
        },
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

    const formModel = Reflect.get(fixture.componentInstance, 'form') as ReturnType<
      typeof buildIdeaForm
    >;
    formModel.patchValue(answers);
    fixture.detectChanges();

    let expectedStep = 1;
    const continueStep = async (): Promise<void> => {
      const next = fixture.nativeElement.querySelector('.actions .primary') as HTMLButtonElement;
      next.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expectedStep += 1;
      expect(fixture.nativeElement.querySelector('h2')?.textContent).toContain(
        `Step ${expectedStep} of 6`,
      );
    };

    for (let index = 0; index < 5; index += 1) {
      await continueStep();
    }

    const consent = fixture.nativeElement.querySelector('#ai-consent') as HTMLInputElement;
    consent.checked = true;
    consent.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    const EventConstructor = form.ownerDocument.defaultView?.Event;
    if (!EventConstructor) throw new Error('Could not access the form event constructor.');
    form.dispatchEvent(new EventConstructor('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    const expectedForm = buildIdeaForm(new FormBuilder().nonNullable);
    expectedForm.patchValue(answers);
    expect(userDataService.createIdea).toHaveBeenCalledWith(
      toNewIdea(expectedForm, authenticatedUser.uid, 'Casey Example'),
    );
    expect(toastService.success).toHaveBeenCalledWith('Your idea was submitted.');
    expect(router.navigate).toHaveBeenCalledWith(['/tracking/status']);
  });

  it('prefills an amendment and resubmits the same idea at its expected version', async () => {
    routeIdeaId = 'idea-123';
    routeParams.next({ get: (_name: string) => routeIdeaId });
    const existingForm = buildIdeaForm(new FormBuilder().nonNullable);
    existingForm.patchValue(answers);
    const existingIdea: Idea = {
      ...toNewIdea(existingForm, authenticatedUser.uid, 'Casey Example'),
      id: 'idea-123',
      category: null,
      similarityCheck: null,
      automatedReview: null,
      status: 'needs_amendment',
      version: 4,
      createdAt: null,
      submittedAt: null,
      updatedAt: null,
    };
    userDataService.getIdeaById.mockResolvedValue(existingIdea);

    const fixture = TestBed.createComponent(IdeaComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(userDataService.getIdeaById).toHaveBeenCalledWith('idea-123'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Update and resubmit your idea');
    const formModel = Reflect.get(fixture.componentInstance, 'form') as ReturnType<
      typeof buildIdeaForm
    >;
    expect(formModel.getRawValue()).toEqual(answers);

    const continueStep = async (): Promise<void> => {
      const next = fixture.nativeElement.querySelector('.actions .primary') as HTMLButtonElement;
      next.click();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    for (let index = 0; index < 5; index += 1) {
      await continueStep();
    }

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    const EventConstructor = form.ownerDocument.defaultView?.Event;
    if (!EventConstructor) throw new Error('Could not access the form event constructor.');
    form.dispatchEvent(new EventConstructor('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    const expectedForm = buildIdeaForm(new FormBuilder().nonNullable);
    expectedForm.patchValue(answers);
    expect(userDataService.resubmitIdea).toHaveBeenCalledWith(
      'idea-123',
      4,
      toNewIdea(expectedForm, authenticatedUser.uid, 'Casey Example'),
    );
    expect(userDataService.createIdea).not.toHaveBeenCalled();
    expect(toastService.success).toHaveBeenCalledWith('Your updated idea was resubmitted.');
  });
});
