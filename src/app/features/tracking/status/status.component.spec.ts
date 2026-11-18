import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { User as FirebaseUser } from '@angular/fire/auth';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserDataService } from '../../../core/services/user-data.service';
import type { Idea, IdeaFeedback } from '../../../shared/models/idea.model';
import { StatusComponent } from './status.component';

describe('StatusComponent', () => {
  const authUser = { uid: 'submitter-1' } as FirebaseUser;
  const authService = {
    getCurrentUser: vi.fn<() => Promise<FirebaseUser | null>>(),
  };
  const userDataService = {
    watchIdeasForUser:
      vi.fn<
        (
          uid: string,
          onIdeas: (ideas: Idea[]) => void,
          onError: (error: unknown) => void,
        ) => () => void
      >(),
    getFeedbackForIdea: vi.fn<() => Promise<IdeaFeedback[]>>().mockResolvedValue([]),
    replyToFeedback: vi.fn<() => Promise<void>>().mockResolvedValue(),
  };
  const toastService = { error: vi.fn() };
  let fixture: ComponentFixture<StatusComponent>;
  let emitIdeas: ((ideas: Idea[]) => void) | null;

  beforeEach(() => {
    emitIdeas = null;
    authService.getCurrentUser.mockReset().mockResolvedValue(authUser);
    userDataService.watchIdeasForUser.mockReset().mockImplementation((_uid, onIdeas) => {
      emitIdeas = onIdeas;
      return vi.fn();
    });
    userDataService.getFeedbackForIdea.mockReset().mockResolvedValue([]);
    userDataService.replyToFeedback.mockReset().mockResolvedValue();
    toastService.error.mockReset();

    TestBed.configureTestingModule({
      imports: [StatusComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: UserDataService, useValue: userDataService },
        { provide: ToastService, useValue: toastService },
      ],
    });

    fixture = TestBed.createComponent(StatusComponent);
  });

  it('shows the signed-in user’s ideas and their current workflow stage', async () => {
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(userDataService.watchIdeasForUser).toHaveBeenCalledWith(
        'submitter-1',
        expect.any(Function),
        expect.any(Function),
      ),
    );

    emitIdeas?.([makeIdea()]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Solar cold rooms');
    expect(fixture.nativeElement.textContent).toContain('Automated screening');
    expect(fixture.nativeElement.textContent).toContain('On track');
    const progress: HTMLProgressElement | null = fixture.nativeElement.querySelector('progress');
    expect(progress?.value).toBe(25);
    expect(progress?.getAttribute('aria-label')).toBe('Overall progress for Solar cold rooms');
  });

  it('shows a sign-in prompt when there is no authenticated user', async () => {
    authService.getCurrentUser.mockResolvedValue(null);
    fixture.detectChanges();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Sign in to track your ideas');
    });
    expect(userDataService.watchIdeasForUser).not.toHaveBeenCalled();
  });

  it('shows evaluator feedback, a reply box, and the resubmission route', async () => {
    userDataService.getFeedbackForIdea.mockResolvedValue([
      {
        id: 'feedback-1',
        ideaId: 'idea-1',
        stageId: 'human_review',
        evaluatorUid: 'evaluator-1',
        evaluatorName: 'Evaluator',
        message: 'Please explain the delivery timeline.',
        requiresResubmission: true,
        reply: null,
        createdAt: null,
      },
    ]);

    fixture.detectChanges();
    await vi.waitFor(() => expect(emitIdeas).not.toBeNull());
    emitIdeas?.([{ ...makeIdea(), status: 'needs_amendment' }]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Please explain the delivery timeline.');
    });

    expect(fixture.nativeElement.querySelector('.reply-form textarea')).not.toBeNull();
    const updateLink = fixture.nativeElement.querySelector(
      'a[href="/submissions/idea/idea-1/update"]',
    ) as HTMLAnchorElement | null;
    expect(updateLink?.textContent).toContain('Update and resubmit');
  });
});

function makeIdea(): Idea {
  return {
    id: 'idea-1',
    ownerId: 'submitter-1',
    ownerName: 'Ada Lovelace',
    title: 'Solar cold rooms',
    problem: 'Farmers lose produce without cold storage.',
    proposedSolution: 'Build solar-powered cold rooms.',
    intendedBeneficiaries: 'Smallholder farmers',
    plannedLocation: 'Gaborone',
    marketPlan: {
      targetMarket: 'Local farmers',
      alternatives: 'Diesel refrigeration',
      differentiation: 'Renewable power',
      marketValidation: 'Interviews with farmers',
    },
    feasibilityPlan: {
      technicalApproach: 'Solar panels and insulated rooms',
      operationalPlan: 'Local maintenance team',
      validationEvidence: 'Prototype design',
      assumptions: 'Reliable sunlight',
      risks: 'Equipment costs',
    },
    financingPlan: {
      currency: 'BWP',
      totalFundingNeeded: 1000,
      fundingSources: 'Grant',
      costs: [{ item: 'Equipment', amount: 1000, description: 'Initial setup' }],
    },
    milestones: [],
    attachments: [],
    aiAnalysisConsent: true,
    category: null,
    similarityCheck: null,
    automatedReview: null,
    status: 'ai_screening',
    version: 1,
    createdAt: null,
    submittedAt: null,
    updatedAt: null,
  };
}
