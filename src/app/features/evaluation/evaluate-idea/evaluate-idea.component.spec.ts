import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserDataService } from '../../../core/services/user-data.service';
import type { EvaluationContext } from '../../../shared/models/idea-evaluation.model';
import { EvaluateIdeaComponent } from './evaluate-idea.component';

describe('EvaluateIdeaComponent change requests', () => {
  const authService = { getCurrentUser: vi.fn() };
  const toastService = { success: vi.fn(), error: vi.fn() };
  const userDataService = {
    getEvaluationContext: vi.fn(),
    getQuestionsForIdea: vi.fn(),
    getPanelEvaluations: vi.fn(),
    requestIdeaChanges: vi.fn(),
  };
  let fixture: ComponentFixture<EvaluateIdeaComponent>;

  beforeEach(async () => {
    vi.clearAllMocks();
    authService.getCurrentUser.mockResolvedValue({ uid: 'evaluator-1' });
    userDataService.getEvaluationContext.mockResolvedValue(makeContext());
    userDataService.getQuestionsForIdea.mockResolvedValue([]);
    userDataService.getPanelEvaluations.mockResolvedValue([]);
    userDataService.requestIdeaChanges.mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [EvaluateIdeaComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'idea-1_human_review_evaluator-1' } } },
        },
        { provide: AuthService, useValue: authService },
        { provide: ToastService, useValue: toastService },
        { provide: UserDataService, useValue: userDataService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EvaluateIdeaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('requires a written note and submits it against the current assignment', async () => {
    await vi.waitFor(() =>
      expect(userDataService.getEvaluationContext).toHaveBeenCalledWith(
        'evaluator-1',
        'idea-1_human_review_evaluator-1',
      ),
    );
    fixture.detectChanges();
    const form = fixture.nativeElement.querySelector('.changes-form') as HTMLFormElement;
    const button = form.querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    const note = form.querySelector('textarea') as HTMLTextAreaElement;
    note.value = 'Please clarify the delivery timeline.';
    const EventConstructor = note.ownerDocument.defaultView?.Event;
    if (!EventConstructor) throw new Error('Could not access the form event constructor.');
    note.dispatchEvent(new EventConstructor('input', { bubbles: true }));
    fixture.detectChanges();
    expect(button.disabled).toBe(false);

    form.dispatchEvent(new EventConstructor('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(userDataService.requestIdeaChanges).toHaveBeenCalledWith(
      'idea-1',
      'idea-1_human_review_evaluator-1',
      'human_review',
      'Please clarify the delivery timeline.',
    );
    expect(toastService.success).toHaveBeenCalledWith(
      'Your feedback was saved. The submitter can view it in tracking; email alerts are not configured yet.',
    );
  });
});

function makeContext(): EvaluationContext {
  return {
    assignment: {
      id: 'idea-1_human_review_evaluator-1',
      ideaId: 'idea-1',
      stageId: 'human_review',
      evaluatorUid: 'evaluator-1',
      status: 'pending',
      dueAt: null,
      assignedBy: 'admin-1',
      createdAt: null,
      updatedAt: null,
    },
    idea: {
      title: 'Community garden',
      category: null,
      problem: 'Families need fresh food.',
      proposedSolution: 'Build shared gardens.',
      intendedBeneficiaries: 'Families',
      plannedLocation: 'Gaborone',
      marketPlan: {
        targetMarket: 'Families',
        alternatives: 'Distant shops',
        differentiation: 'Locally grown food',
        marketValidation: 'Community interviews',
      },
      feasibilityPlan: {
        technicalApproach: 'Raised beds',
        operationalPlan: 'Weekly sessions',
        validationEvidence: 'A pilot plot',
        assumptions: 'Water is available',
        risks: 'Drought',
      },
      financingPlan: {
        currency: 'BWP',
        totalFundingNeeded: 100,
        fundingSources: 'Grant',
        costs: [{ item: 'Seeds', amount: 100, description: '' }],
      },
      milestones: [],
      automatedReview: null,
    },
    stageName: 'Human review',
    criteriaSet: {
      id: 'criteria-1',
      name: 'Human review criteria',
      criteria: [{ id: 'market', label: 'Market', description: 'Market fit', maxScore: 10, weight: 1 }],
    },
    evaluatorType: 'internal',
  };
}
