import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserDataService } from '../../../core/services/user-data.service';
import { IdeaComponent } from './idea.component';

describe('IdeaComponent', () => {
  const authService = {
    getCurrentUser: vi.fn(),
  };
  const toastService = {
    success: vi.fn(),
    error: vi.fn(),
  };
  const userDataService = {
    createIdea: vi.fn(),
  };
  let router: Router;

  beforeEach(async () => {
    authService.getCurrentUser.mockReset();
    toastService.success.mockReset();
    toastService.error.mockReset();
    userDataService.createIdea.mockReset();
    authService.getCurrentUser.mockResolvedValue({
      uid: 'user-123',
      displayName: 'Casey Example',
      email: 'casey@example.com',
      emailVerified: false,
    });

    await TestBed.configureTestingModule({
      imports: [IdeaComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: ToastService, useValue: toastService },
        { provide: UserDataService, useValue: userDataService },
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  it('submits a detailed plan with consent under the authenticated user', async () => {
    userDataService.createIdea.mockResolvedValue('idea-123');
    const fixture = TestBed.createComponent(IdeaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const setInput = (selector: string, value: string): void => {
      const input = fixture.nativeElement.querySelector(selector) as
        | HTMLInputElement
        | HTMLTextAreaElement;
      expect(input, selector).not.toBeNull();
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    };

    const continueStep = async (): Promise<void> => {
      const button = fixture.nativeElement.querySelector('.form-actions button:last-child') as HTMLButtonElement;
      button.click();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    setInput('#idea-title', 'Community garden');
    setInput('#idea-problem', 'Families have limited access to fresh food.');
    setInput('#idea-solution', 'Create a shared garden and growing workshops.');
    setInput('#idea-beneficiaries', 'Families and local growers.');
    setInput('#idea-location', 'Gaborone');
    await continueStep();

    setInput('#idea-target-market', 'Families in the neighborhood.');
    setInput('#idea-alternatives', 'Families currently travel to distant shops.');
    setInput('#idea-differentiation', 'A shared local garden with training.');
    setInput('#idea-market-validation', 'Ten families and two growers expressed interest.');
    await continueStep();

    setInput('#idea-technical-approach', 'Use raised beds and drip irrigation.');
    setInput('#idea-operational-plan', 'Local growers will coordinate weekly sessions.');
    setInput('#idea-validation-evidence', 'Two growers offered to advise.');
    setInput('#idea-assumptions', 'Water will be available throughout the season.');
    setInput('#idea-risks', 'Drought risk can be reduced with water storage.');
    await continueStep();

    setInput('#idea-currency', 'BWP');
    setInput('#idea-funding-needed', '25000');
    setInput('#idea-funding-sources', 'Community grants and local contributions.');
    setInput('#idea-cost-item-0', 'Irrigation equipment');
    setInput('#idea-cost-amount-0', '9000');
    setInput('#idea-cost-description-0', 'Tanks, pipes, and drip lines.');
    setInput('#idea-milestone-title-0', 'Prepare the garden');
    setInput('#idea-milestone-date-0', '2027-06');
    setInput('#idea-milestone-measure-0', 'Three raised beds ready for planting.');
    setInput('#idea-milestone-cost-0', '8000');
    const consent = fixture.nativeElement.querySelector('#idea-ai-consent') as HTMLInputElement;
    consent.checked = true;
    consent.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(userDataService.createIdea).toHaveBeenCalledWith({
      ownerId: 'user-123',
      ownerName: 'Casey Example',
      title: 'Community garden',
      problem: 'Families have limited access to fresh food.',
      proposedSolution: 'Create a shared garden and growing workshops.',
      intendedBeneficiaries: 'Families and local growers.',
      plannedLocation: 'Gaborone',
      marketPlan: {
        targetMarket: 'Families in the neighborhood.',
        alternatives: 'Families currently travel to distant shops.',
        differentiation: 'A shared local garden with training.',
        marketValidation: 'Ten families and two growers expressed interest.',
      },
      feasibilityPlan: {
        technicalApproach: 'Use raised beds and drip irrigation.',
        operationalPlan: 'Local growers will coordinate weekly sessions.',
        validationEvidence: 'Two growers offered to advise.',
        assumptions: 'Water will be available throughout the season.',
        risks: 'Drought risk can be reduced with water storage.',
      },
      financingPlan: {
        currency: 'BWP',
        totalFundingNeeded: 25000,
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
          targetDate: '2027-06',
          successMeasure: 'Three raised beds ready for planting.',
          estimatedCost: 8000,
        },
      ],
      aiAnalysisConsent: true,
    });
    expect(toastService.success).toHaveBeenCalledWith('Your idea has been submitted.');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/account/user/profile');
  });
});
