/**
 * Idea workflow: the single source of truth for
 *   1. which stages exist,
 *   2. who may move an idea from one stage to another,
 *   3. how each stage maps to a progress % and a traffic-light colour.
 *
 * Pure TypeScript with NO imports, so the Angular app and the Cloud Functions
 * can use the exact same file (see scripts/sync-shared.mjs).
 */
export const IDEA_STATUSES = [
  'submitted',
  'ai_screening',
  'needs_amendment',
  'ceda_criteria',
  'human_review',
  'adjudication',
  'approved',
  'awarded',
  'rejected',
] as const;

export type IdeaStatus = (typeof IDEA_STATUSES)[number];
export type WorkflowActor = 'system' | 'owner' | 'evaluator' | 'adjudicator' | 'admin';
export type HealthColour = 'green' | 'yellow' | 'red';

export interface StageInfo {
  readonly label: string;
  /** null = the idea is closed, so a percentage would be misleading. */
  readonly progress: number | null;
  readonly health: HealthColour;
  /** Plain-language help text, also read by screen readers. */
  readonly help: string;
}

export const STAGES: Readonly<Record<IdeaStatus, StageInfo>> = {
  submitted: {
    label: 'Submitted',
    progress: 10,
    health: 'green',
    help: 'We have your idea and it is waiting for the automated check.',
  },
  ai_screening: {
    label: 'Automated screening',
    progress: 25,
    health: 'green',
    help: 'We are checking your idea for similar ideas, risks and the right field.',
  },
  needs_amendment: {
    label: 'Changes needed',
    progress: 35,
    health: 'yellow',
    help: 'Something is missing or unclear. Please read the feedback and update your idea.',
  },
  ceda_criteria: {
    label: 'CEDA criteria check',
    progress: 50,
    health: 'green',
    help: 'We are checking your idea against CEDA requirements and documents.',
  },
  human_review: {
    label: 'Evaluator review',
    progress: 65,
    health: 'green',
    help: 'Evaluators are reading and scoring your idea.',
  },
  adjudication: {
    label: 'Adjudication',
    progress: 80,
    health: 'green',
    help: 'The adjudicators are making the final decision.',
  },
  approved: {
    label: 'Approved',
    progress: 90,
    health: 'green',
    help: 'Your idea was approved and is waiting for the award.',
  },
  awarded: {
    label: 'Awarded',
    progress: 100,
    health: 'green',
    help: 'Congratulations, your idea has been awarded.',
  },
  rejected: {
    label: 'Not successful',
    progress: null,
    health: 'red',
    help: 'Your idea is not valid or did not pass. Read the feedback for the reasons.',
  },
};

type TransitionMap = Readonly<
  Record<IdeaStatus, Readonly<Partial<Record<IdeaStatus, readonly WorkflowActor[]>>>>
>;

/**
 * from -> to -> actors allowed to make that move.
 * Anything not listed here is illegal. Cloud Functions enforce this table.
 */
export const TRANSITIONS: TransitionMap = {
  submitted: { ai_screening: ['system', 'admin'] },
  ai_screening: {
    needs_amendment: ['system', 'evaluator', 'admin'],
    // Also used when the AI call fails: the idea carries on to human review, as the README promises.
    ceda_criteria: ['system', 'admin'],
    // The AI is advisory only, so 'system' can never reject. A human must.
    rejected: ['evaluator', 'admin'],
  },
  // The owner "resubmits": the idea goes back through the automated check.
  needs_amendment: { ai_screening: ['owner', 'admin'], rejected: ['admin'] },
  ceda_criteria: {
    needs_amendment: ['system', 'evaluator', 'admin'],
    human_review: ['system', 'admin'],
    rejected: ['evaluator', 'admin'],
  },
  human_review: {
    needs_amendment: ['evaluator', 'admin'],
    adjudication: ['evaluator', 'admin'],
    rejected: ['evaluator', 'admin'],
  },
  adjudication: {
    approved: ['adjudicator', 'admin'],
    needs_amendment: ['adjudicator', 'admin'],
    rejected: ['adjudicator', 'admin'],
  },
  approved: { awarded: ['admin'] },
  awarded: {},
  rejected: {},
};

/** Moves that must carry a written reason, so feedback is never empty. */
export const NOTE_REQUIRED: readonly IdeaStatus[] = ['needs_amendment', 'rejected'];

export function canTransition(from: IdeaStatus, to: IdeaStatus, actor: WorkflowActor): boolean {
  return TRANSITIONS[from][to]?.includes(actor) ?? false;
}

export function allowedNextStatuses(from: IdeaStatus, actor: WorkflowActor): IdeaStatus[] {
  return (Object.keys(TRANSITIONS[from]) as IdeaStatus[]).filter((to) =>
    canTransition(from, to, actor),
  );
}

export function isIdeaStatus(value: unknown): value is IdeaStatus {
  return typeof value === 'string' && (IDEA_STATUSES as readonly string[]).includes(value);
}

/** Stages that the system should finish on its own; used for the "still processing" message. */
const AUTOMATED: readonly IdeaStatus[] = ['submitted', 'ai_screening', 'ceda_criteria'];

/**
 * The default message the brief asks for when a human stage is slow.
 * `ageMs` is "now minus statusUpdatedAt"; pass it in, never call Date.now() in here,
 * so the function stays pure and easy to test.
 */
export function processingMessage(status: IdeaStatus, ageMs: number): string | null {
  const minutes = ageMs / 60_000;
  if (AUTOMATED.includes(status) && minutes > 10) {
    return 'Your submission is still being processed.';
  }
  if (status === 'human_review' && minutes > 24 * 60) {
    return 'Your submission is still being processed. Evaluators have not finished yet.';
  }
  return null;
}
