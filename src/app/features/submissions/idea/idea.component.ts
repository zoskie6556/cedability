import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserDataService } from '../../../core/services/user-data.service';

@Component({
  selector: 'app-idea',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './idea.component.html',
  styleUrl: './idea.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IdeaComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);
  private readonly userDataService = inject(UserDataService);

  protected readonly user = signal<{ uid: string; displayName: string | null } | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly isSubmitting = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly submitError = signal<string | null>(null);
  protected readonly currentStep = signal(0);
  protected readonly stepTitles = [
    'The idea',
    'The market',
    'Feasibility',
    'Financing and delivery',
  ];

  protected readonly form = this.formBuilder.nonNullable.group({
    basics: this.formBuilder.nonNullable.group({
      title: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(120)]],
      problem: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(2000)]],
      proposedSolution: [
        '',
        [Validators.required, Validators.pattern(/\S/), Validators.maxLength(3000)],
      ],
      intendedBeneficiaries: [
        '',
        [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1000)],
      ],
      plannedLocation: [
        '',
        [Validators.required, Validators.pattern(/\S/), Validators.maxLength(160)],
      ],
    }),
    market: this.formBuilder.nonNullable.group({
      targetMarket: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1500)]],
      alternatives: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1500)]],
      differentiation: [
        '',
        [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1500)],
      ],
      marketValidation: [
        '',
        [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1500)],
      ],
    }),
    feasibility: this.formBuilder.nonNullable.group({
      technicalApproach: [
        '',
        [Validators.required, Validators.pattern(/\S/), Validators.maxLength(2000)],
      ],
      operationalPlan: [
        '',
        [Validators.required, Validators.pattern(/\S/), Validators.maxLength(2000)],
      ],
      validationEvidence: ['', Validators.maxLength(2000)],
      assumptions: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1500)]],
      risks: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1500)]],
    }),
    financing: this.formBuilder.nonNullable.group({
      currency: ['BWP', [Validators.required, Validators.maxLength(3)]],
      totalFundingNeeded: [0, [Validators.required, Validators.min(0.01)]],
      fundingSources: [
        '',
        [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1500)],
      ],
      costs: this.formBuilder.array([this.createCostItemForm()]),
      milestones: this.formBuilder.array([this.createMilestoneForm()]),
      aiAnalysisConsent: [false, Validators.requiredTrue],
    }),
  });

  ngOnInit(): void {
    void this.loadUser();
  }

  protected async loadUser(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const currentUser = await this.authService.getCurrentUser();
      this.user.set(
        currentUser
          ? {
              uid: currentUser.uid,
              displayName: currentUser.displayName,
            }
          : null,
      );
    } catch {
      this.loadError.set('We could not confirm your sign-in. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.currentStep.set(this.form.controls.basics.invalid ? 0
        : this.form.controls.market.invalid ? 1
          : this.form.controls.feasibility.invalid ? 2 : 3);
      return;
    }

    const user = this.user();
    if (!user || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set(null);

    try {
      const values = this.form.getRawValue();
      await this.userDataService.createIdea({
        ownerId: user.uid,
        ownerName: user.displayName?.trim() || 'Cedability member',
        title: values.basics.title.trim(),
        problem: values.basics.problem.trim(),
        proposedSolution: values.basics.proposedSolution.trim(),
        intendedBeneficiaries: values.basics.intendedBeneficiaries.trim(),
        plannedLocation: values.basics.plannedLocation.trim(),
        marketPlan: {
          targetMarket: values.market.targetMarket.trim(),
          alternatives: values.market.alternatives.trim(),
          differentiation: values.market.differentiation.trim(),
          marketValidation: values.market.marketValidation.trim(),
        },
        feasibilityPlan: {
          technicalApproach: values.feasibility.technicalApproach.trim(),
          operationalPlan: values.feasibility.operationalPlan.trim(),
          validationEvidence: values.feasibility.validationEvidence.trim(),
          assumptions: values.feasibility.assumptions.trim(),
          risks: values.feasibility.risks.trim(),
        },
        financingPlan: {
          currency: values.financing.currency.trim().toUpperCase(),
          totalFundingNeeded: values.financing.totalFundingNeeded,
          fundingSources: values.financing.fundingSources.trim(),
          costs: values.financing.costs.map((cost) => ({
            item: cost.item.trim(),
            amount: cost.amount,
            description: cost.description.trim(),
          })),
        },
        milestones: values.financing.milestones.map((milestone) => ({
          title: milestone.title.trim(),
          targetDate: milestone.targetDate,
          successMeasure: milestone.successMeasure.trim(),
          estimatedCost: milestone.estimatedCost > 0 ? milestone.estimatedCost : null,
        })),
        aiAnalysisConsent: values.financing.aiAnalysisConsent,
      });

      this.toastService.success('Your idea has been submitted.');
      await this.router.navigateByUrl('/account/user/profile');
    } catch {
      this.submitError.set('We could not submit your idea. Your answers are still here; please try again.');
      this.toastService.error('We could not submit your idea. Please try again.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected nextStep(): void {
    const groups = [
      this.form.controls.basics,
      this.form.controls.market,
      this.form.controls.feasibility,
      this.form.controls.financing,
    ];
    const currentGroup = groups[this.currentStep()];
    currentGroup.markAllAsTouched();
    if (currentGroup.invalid) {
      return;
    }

    this.currentStep.update((step) => Math.min(step + 1, groups.length - 1));
  }

  protected previousStep(): void {
    this.currentStep.update((step) => Math.max(step - 1, 0));
  }

  protected addCostItem(): void {
    const costs = this.form.controls.financing.controls.costs;
    if (costs.length < 10) {
      costs.push(this.createCostItemForm());
    }
  }

  protected removeCostItem(index: number): void {
    const costs = this.form.controls.financing.controls.costs;
    if (costs.length > 1) {
      costs.removeAt(index);
    }
  }

  protected addMilestone(): void {
    const milestones = this.form.controls.financing.controls.milestones;
    if (milestones.length < 10) {
      milestones.push(this.createMilestoneForm());
    }
  }

  protected removeMilestone(index: number): void {
    const milestones = this.form.controls.financing.controls.milestones;
    if (milestones.length > 1) {
      milestones.removeAt(index);
    }
  }

  private createCostItemForm() {
    return this.formBuilder.nonNullable.group({
      item: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(120)]],
      amount: [0, [Validators.required, Validators.min(0.01)]],
      description: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(500)]],
    });
  }

  private createMilestoneForm() {
    return this.formBuilder.nonNullable.group({
      title: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(120)]],
      targetDate: ['', [Validators.required, Validators.pattern(/^\d{4}-\d{2}$/)]],
      successMeasure: [
        '',
        [Validators.required, Validators.pattern(/\S/), Validators.maxLength(500)],
      ],
      estimatedCost: [0, Validators.min(0)],
    });
  }
}
