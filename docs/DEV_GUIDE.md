# CEDAbility: Developer Guide for Submission, Evaluation, Tracking and Reporting

Written for the CEDA Innovation Management Portal hackathon (hacking window 13 to 23 Nov 2026, final submission by **23 Nov, 17:00 CAT**). Built around your team's real stack: Angular 21, signals, AngularFire, Firestore, Firebase Storage and Cloud Functions with Gemini.

> **How to use this file.** Drop it in the repo as `docs/DEV_GUIDE.md`. Each module has (1) why it exists, (2) a short **Copilot prompt** to paste into VS Code Copilot Chat (Agent mode), (3) verified code where I wrote it, and (4) a "done when" checklist.

---

## 0. Read this first

### 0.1 What I checked in your repo

| Finding | Why it matters | Action |
|---|---|---|
| `firestore.rules` has `allow update, delete: if false` on `/ideas` | Feedback, resubmission, stage changes and scoring are all impossible from the client | Stage changes go through a **Cloud Function** (Module 0). Resubmission gets one narrow rule |
| Roles are only `user`, `evaluator`, `admin` | The brief needs submitters, evaluators (internal and external), adjudicators, admins and committee viewers | Add `adjudicator` and `evaluatorType: internal or external` |
| Every evaluator can read **every** idea | The brief says to protect IP, and external evaluators (e.g. LEA staff) should not see everything | Add `assignedEvaluatorIds` on ideas, checked in rules |
| `AGENTS.md` describes a second copy at `/users/{uid}/ideas/{ideaId}`, but rules and README only cover `/ideas` | The rules deny the second path by default | Decide with your team: implement it (rules and batch writes) or drop it from `AGENTS.md` |
| `firebase.json` has no `storage` or `emulators` block | `AGENTS.md` requires Storage rules and emulator tests for uploads, and `TEAM_NOTES.md` says to work on the emulator | Added in Module 0 |
| `TEAM_NOTES.md` says "only edit your own feature folder", but the owner table is blank and your role spans submissions, evaluation and reporting | Shared files (models, rules, functions) need one agreed owner | Do Module 0 as **one small "contract" PR today** so everyone builds on it |
| `AGENTS.md` says main is the integration branch, `TEAM_NOTES.md` says never push to main | Conflicting rules | Follow `TEAM_NOTES.md`: feature branch, PR, review. Every prompt below says "do not commit" |
| README says the AI "does not score, rank, decide eligibility" | The brief wants automated first-stage checks | I kept the AI **advisory**. It can ask for amendments (missing info) but cannot reject. A human must. This is also a strong "human in the loop" point for the defence |

I did **not** see `src/` (models, `user-data.service.ts`, `app.routes.ts`, the idea form). Every prompt therefore starts with "inspect existing code first". Paste those files to me later and I will tailor the next round.

### 0.2 Judging weights: build in this order

| Criteria (points) | Where it lives in this guide |
|---|---|
| Technical 25: RBAC 5, response time 5, **audit trail 5**, security 5, cross-browser 2.5, scalability 2.5 | Modules 0, 3, 6 |
| Functionality 20: multi-level evaluation 3, feedback 3, dashboards 3, alerts 2, chat 2, admin content 3, FAQs 2 | Modules 3, 4, 5 (chat/FAQ/admin belong to teammates) |
| General 15: self-register with email/phone validation, OTP or biometrics, password reset, **cloud provider, region and storage costs**, 24/7 hosting | Module 6 and demo checklist |
| UX 15 | Modules 1, 4, 7 |
| Presentation 15 and Innovation 10 | Module 1 (voice, language, camera, guide bot), Module 8 |

**Golden-path rule.** Before any extra features, get this one flow working end to end on the live URL:
`submit → screening → feedback → resubmit → review → adjudicate → approve → award → report`.
Voice, camera and translation are innovation points. They only count if the golden path already works in the demo.

### 0.3 Calendar (today is Sun 15 Nov)

| Day | Goal |
|---|---|
| Sun 15 | Module 0 contract PR merged. Prepare questions for the 16 Nov clarification meeting |
| Mon 16 | Tracking page and timeline (Module 4). Clarification meeting |
| Tue 17 | Submission improvements: completeness meter, drafts (Module 1) |
| Wed 18 | Screening function: category, similarity, report (Module 2) |
| Thu 19 | Evaluation: criteria, score sheet, blind scoring, adjudication (Module 3) |
| Fri 20 | Feedback loop and resubmission, notifications. Clarification meeting |
| Sat 21 | Reporting and dashboards (Module 5). Accessibility pass (Module 7) |
| Sun 22 | Deploy, seed demo data, security pass, video, manual, README (Module 8) |
| Mon 23 | Freeze at noon. Submit by 15:00, not 16:59 |

**Ask at the 16 Nov clarification meeting:** (1) who counts as an "external evaluator" and how they should log in; (2) whether hosting region matters (judging asks for it); (3) whether CEDA branding tokens are available; (4) whether the live chat is expected to be staffed during the demo.

---

## 1. Module map: which code goes where

| Module | Code lives in | Firestore / Storage | Cloud Functions |
|---|---|---|---|
| **0 Contract** (everyone depends on it) | `src/app/shared/workflow/`, `firestore.rules`, `storage.rules`, `functions/src/` | users, ideas, events | `transitionIdea`, `setUserRole` |
| **1 Submission** | `features/submissions/` | `ideas`, `users/{uid}/drafts`, Storage images | `translateToEnglish`, `transcribeAudio`, `extractTextFromImage`, `fieldHelper` |
| **2 Screening** | `functions/src/screening.ts` | `ideas.automatedReview`, `ideaEmbeddings` (server only) | `screenIdea` |
| **3 Evaluation** (internal and external) | `features/evaluation/` | `evaluationConfigs`, `ideas/{id}/evaluations` | `submitEvaluation`, `assignEvaluators` |
| **4 Tracking** | `features/tracking/` + shared `app-idea-progress` | `ideas/{id}/events`, `notifications` | (reads only) |
| **5 Reporting** | `features/reporting/` | `stats/overview` | `onEventWritten` counter |
| **6 Security** | `firestore.rules`, `storage.rules`, rules tests | all | `setUserRole` |
| **7 Accessibility** | `features/accessibility/` + every template | `users.profile` preferences | none |

### 1.1 Reading the Angular code (cheat sheet)

| You see | It means | Why we use it |
|---|---|---|
| `input()` / `output()` | Data in, events out of a component | Replaces old `@Input` decorators (team rule) |
| `signal()` / `computed()` | Reactive state / values derived from it | Auto-updates the screen, no manual change detection |
| `inject(Service)` | Get a service | Replaces constructor injection (team rule) |
| `ChangeDetectionStrategy.OnPush` | Re-render only when signals or inputs change | Faster, required by `AGENTS.md` |
| `@if`, `@for ... track` | Template control flow | Replaces `*ngIf`/`*ngFor` (team rule) |
| `[class.green]="..."`, `[style.width.%]="..."` | Class and style bindings | `ngClass`/`ngStyle` are banned by `AGENTS.md` |

### 1.2 The Copilot prompt shape that works

Use this skeleton every time. Short, specific, with limits:

```text
CONTEXT: Read AGENTS.md, TEAM_NOTES.md and docs/DEV_GUIDE.md section <N> first. Inspect existing src/app/shared and src/app/core before adding anything; reuse ToastService, app-idea-loader and UserDataService.
TASK: <one deliverable>
FILES: <exact paths it may touch>
RULES: standalone components (no standalone:true), signals, inject(), OnPush, reactive forms, @if/@for, class/style bindings, strict TypeScript, no any. Loading state + error toast for every async call. Comment the WHY, not the WHAT.
DONE WHEN: <checklist>. Run `npx ng build`. Do NOT commit or push.
```

Tip: ask Copilot to **"list the files you will change and why, wait for my OK"** before it edits. You are learning, so review the plan first.

---

## Module 0. The contract (do this first, as one small PR)

**Why:** three people are building against the same idea lifecycle. If stages, roles and permissions are defined in one place, nobody's code drifts apart, and the judges' "RBAC", "audit trail" and "data integrity" criteria are covered by design.

**Design in one picture**

```
Applicant ──(writes idea)──► Firestore /ideas
                                    │
Anyone who changes a stage ──► callable transitionIdea (Cloud Function)
                                    │ checks: signed in? right role? legal move? note given?
                                    ▼  ONE transaction writes:
                      idea.status  +  ideas/{id}/events (audit)  +  notifications/{uid}
```

### 0.1 `src/app/shared/workflow/idea-workflow.ts`  (new, tested)

The single source of truth for stages, who may move an idea, the progress % and the traffic-light colour. It has **no imports**, so the Angular app and the Cloud Functions use the identical file.

```ts
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
```

**Why it is written this way**
- `TRANSITIONS` is a lookup table, not nested `if`s, so adding a stage is one line and every rule is visible at a glance.
- `canTransition` is pure, so the browser can hide illegal buttons **and** the server can enforce them with the same logic.
- Colour never carries meaning alone: every stage also has a label, a percentage and help text (accessibility).
- `processingMessage` takes the age as a parameter instead of calling the clock, so it is trivially testable.

### 0.2 `src/app/shared/workflow/evaluation-scoring.ts`  (new, tested)

```ts
/**
 * Scoring maths for the evaluation module. Pure functions, no Angular, no Firebase.
 * Keeping the maths separate means we can unit-test it and explain it to the judges.
 */
export interface Criterion {
  readonly id: string;
  readonly label: string;
  /** Relative importance. Weights do NOT need to add up to 100; we normalise. */
  readonly weight: number;
  /** Highest mark an evaluator can give for this criterion, e.g. 5 or 10. */
  readonly maxScore: number;
}

/** criterionId -> mark given by one evaluator. */
export type ScoreSheet = Readonly<Record<string, number>>;

/**
 * Weighted total on a 0-100 scale:
 *   total = 100 * sum(weight_i * mark_i / max_i) / sum(weight_i)
 * Returns null if any criterion is missing or out of range, so an incomplete
 * sheet can never be saved as a silent low score.
 */
export function weightedScore(sheet: ScoreSheet, criteria: readonly Criterion[]): number | null {
  if (criteria.length === 0) return null;
  let earned = 0;
  let possible = 0;
  for (const c of criteria) {
    const mark = sheet[c.id];
    if (typeof mark !== 'number' || Number.isNaN(mark) || mark < 0 || mark > c.maxScore) {
      return null;
    }
    earned += c.weight * (mark / c.maxScore);
    possible += c.weight;
  }
  return possible === 0 ? null : round((earned / possible) * 100);
}

/**
 * z-score per evaluator: (score - evaluatorMean) / evaluatorStdDev.
 * Makes a harsh marker and a generous marker comparable before ranking.
 * Needs at least 2 scores from that evaluator; otherwise returns 0 (neutral).
 */
export function zScore(score: number, evaluatorScores: readonly number[]): number {
  if (evaluatorScores.length < 2) return 0;
  const mean = average(evaluatorScores);
  const sd = stdDev(evaluatorScores);
  return sd === 0 ? 0 : round((score - mean) / sd, 3);
}

export interface PanelSummary {
  readonly count: number;
  readonly mean: number | null;
  /** highest total minus lowest total */
  readonly spread: number;
  /** true when evaluators disagree enough that adjudicators should look closely */
  readonly needsAdjudication: boolean;
}

export const DEFAULT_SPREAD_THRESHOLD = 20;

export function summarisePanel(
  totals: readonly number[],
  spreadThreshold: number = DEFAULT_SPREAD_THRESHOLD,
): PanelSummary {
  if (totals.length === 0) {
    return { count: 0, mean: null, spread: 0, needsAdjudication: false };
  }
  const spread = Math.max(...totals) - Math.min(...totals);
  return {
    count: totals.length,
    mean: round(average(totals)),
    spread: round(spread),
    // One evaluator cannot disagree with themselves, so only flag from 2 up.
    needsAdjudication: totals.length >= 2 && spread > spreadThreshold,
  };
}

function average(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: readonly number[]): number {
  const mean = average(values);
  return Math.sqrt(average(values.map((v) => (v - mean) ** 2)));
}

function round(value: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}
```

**Why:** `weightedScore` returns `null` for an incomplete sheet instead of silently scoring 0. `zScore` corrects for harsh versus generous markers. `summarisePanel` is the "disagreement → adjudication" trigger.

### 0.3 Unit tests (Vitest, matches `ng test`)

`src/app/shared/workflow/idea-workflow.spec.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  IDEA_STATUSES,
  STAGES,
  TRANSITIONS,
  allowedNextStatuses,
  canTransition,
  processingMessage,
  type IdeaStatus,
  type WorkflowActor,
} from './idea-workflow';

describe('idea workflow', () => {
  it('has stage info and a transition row for every status', () => {
    for (const status of IDEA_STATUSES) {
      expect(STAGES[status]).toBeDefined();
      expect(TRANSITIONS[status]).toBeDefined();
      for (const target of Object.keys(TRANSITIONS[status])) {
        expect(IDEA_STATUSES as readonly string[]).toContain(target);
      }
    }
  });

  const happyPath: [IdeaStatus, IdeaStatus, WorkflowActor][] = [
    ['submitted', 'ai_screening', 'system'],
    ['ai_screening', 'ceda_criteria', 'system'],
    ['ceda_criteria', 'human_review', 'system'],
    ['human_review', 'adjudication', 'evaluator'],
    ['adjudication', 'approved', 'adjudicator'],
    ['approved', 'awarded', 'admin'],
  ];

  it.each(happyPath)('allows %s -> %s for %s and progress increases', (from, to, actor) => {
    expect(canTransition(from, to, actor)).toBe(true);
    expect(STAGES[to].progress!).toBeGreaterThan(STAGES[from].progress!);
  });

  it('lets the owner resubmit after feedback, but not self-advance', () => {
    expect(canTransition('needs_amendment', 'ai_screening', 'owner')).toBe(true);
    expect(canTransition('human_review', 'adjudication', 'owner')).toBe(false);
  });

  it('only adjudicators or admins approve', () => {
    expect(canTransition('adjudication', 'approved', 'evaluator')).toBe(false);
  });

  it('never leaves a terminal stage', () => {
    expect(allowedNextStatuses('awarded', 'admin')).toEqual([]);
    expect(allowedNextStatuses('rejected', 'admin')).toEqual([]);
  });

  it('uses the agreed colours', () => {
    expect(STAGES.needs_amendment.health).toBe('yellow');
    expect(STAGES.rejected.health).toBe('red');
    expect(STAGES.human_review.health).toBe('green');
  });

  it('shows the processing message only when a stage is slow', () => {
    expect(processingMessage('ai_screening', 5 * 60_000)).toBeNull();
    expect(processingMessage('ai_screening', 11 * 60_000)).toBe('Your submission is still being processed.');
    expect(processingMessage('approved', 99 * 3_600_000)).toBeNull();
  });
});

describe('AI stays advisory', () => {
  it('never lets the system reject an idea', () => {
    for (const status of IDEA_STATUSES) {
      expect(canTransition(status, 'rejected', 'system')).toBe(false);
    }
  });
});
```

`src/app/shared/workflow/evaluation-scoring.spec.ts`

```ts
import { describe, expect, it } from 'vitest';
import { summarisePanel, weightedScore, zScore, type Criterion } from './evaluation-scoring';

const criteria: Criterion[] = [
  { id: 'impact', label: 'Impact', weight: 40, maxScore: 10 },
  { id: 'feasibility', label: 'Feasibility', weight: 30, maxScore: 10 },
  { id: 'innovation', label: 'Innovation', weight: 30, maxScore: 5 },
];

describe('weightedScore', () => {
  it('scores full marks as 100 and zero as 0', () => {
    expect(weightedScore({ impact: 10, feasibility: 10, innovation: 5 }, criteria)).toBe(100);
    expect(weightedScore({ impact: 0, feasibility: 0, innovation: 0 }, criteria)).toBe(0);
  });
  it('applies weights (40*0.5 + 30*0.5 + 30*1 = 65)', () => {
    expect(weightedScore({ impact: 5, feasibility: 5, innovation: 5 }, criteria)).toBe(65);
  });
  it('rejects incomplete, out-of-range or empty input instead of guessing', () => {
    expect(weightedScore({ impact: 5, feasibility: 5 }, criteria)).toBeNull();
    expect(weightedScore({ impact: 11, feasibility: 5, innovation: 5 }, criteria)).toBeNull();
    expect(weightedScore({}, [])).toBeNull();
  });
});

describe('zScore', () => {
  it('makes a harsh and a generous marker comparable', () => {
    expect(zScore(60, [40, 50, 60])).toBe(zScore(90, [70, 80, 90]));
  });
  it('is neutral with one score or zero variance', () => {
    expect(zScore(50, [50])).toBe(0);
    expect(zScore(50, [50, 50, 50])).toBe(0);
  });
});

describe('summarisePanel', () => {
  it('handles an empty panel', () => {
    expect(summarisePanel([])).toEqual({ count: 0, mean: null, spread: 0, needsAdjudication: false });
  });
  it('flags large disagreement only with 2+ evaluators', () => {
    expect(summarisePanel([70]).needsAdjudication).toBe(false);
    expect(summarisePanel([70, 75]).needsAdjudication).toBe(false);
    expect(summarisePanel([40, 80]).needsAdjudication).toBe(true);
    expect(summarisePanel([40, 80]).mean).toBe(60);
  });
});
```

### 0.4 `functions/src/transition-idea.ts`  (new, type-checked)

```ts
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import {
  NOTE_REQUIRED,
  STAGES,
  canTransition,
  isIdeaStatus,
  type WorkflowActor,
} from './shared/idea-workflow';

if (getApps().length === 0) initializeApp();

type UserRole = 'user' | 'evaluator' | 'adjudicator' | 'admin';

interface TransitionRequest {
  ideaId: string;
  to: string;
  note?: string;
}

/**
 * WHY a Cloud Function and not a client write?
 * firestore.rules sets `allow update: if false` on /ideas, so users can never edit
 * a stage themselves. This function is the ONLY door between stages: it checks the
 * caller, validates the move against TRANSITIONS, then writes the idea, an audit
 * event and a notification in ONE transaction, so they can never disagree.
 */
export const transitionIdea = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in.');

  const { ideaId, to, note } = request.data as Partial<TransitionRequest>;
  if (typeof ideaId !== 'string' || ideaId.length === 0 || !isIdeaStatus(to)) {
    throw new HttpsError('invalid-argument', 'ideaId and a valid target status are required.');
  }
  const cleanNote = typeof note === 'string' ? note.trim() : '';
  if (cleanNote.length > 2000) {
    throw new HttpsError('invalid-argument', 'The note must be 2000 characters or fewer.');
  }
  if (NOTE_REQUIRED.includes(to) && cleanNote.length === 0) {
    throw new HttpsError('invalid-argument', 'Please explain this decision so the applicant can act on it.');
  }

  const db = getFirestore();
  const ideaRef = db.doc(`ideas/${ideaId}`);

  try {
    await db.runTransaction(async (tx) => {
      const [ideaSnap, userSnap] = await Promise.all([
        tx.get(ideaRef),
        tx.get(db.doc(`users/${uid}`)),
      ]);
      if (!ideaSnap.exists) throw new HttpsError('not-found', 'Idea not found.');

      const idea = ideaSnap.data() ?? {};
      const user = userSnap.data() ?? {};
      const from = idea['status'];
      if (!isIdeaStatus(from)) throw new HttpsError('data-loss', 'Idea has an unknown status.');

      const actor = resolveActor(uid, idea['ownerId'], user['role'] as UserRole | undefined);
      if (actor === null) throw new HttpsError('permission-denied', 'You cannot change this idea.');

      // External evaluators (e.g. LEA staff) only see ideas they were assigned.
      if (actor === 'evaluator' && user['evaluatorType'] === 'external') {
        const assigned: unknown = idea['assignedEvaluatorIds'];
        if (!Array.isArray(assigned) || !assigned.includes(uid)) {
          throw new HttpsError('permission-denied', 'This idea is not assigned to you.');
        }
      }

      if (!canTransition(from, to, actor)) {
        throw new HttpsError('failed-precondition', `A ${actor} cannot move an idea from ${from} to ${to}.`);
      }

      const update: Record<string, unknown> = {
        status: to,
        statusUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      // Every resubmission after feedback is a new revision.
      if (from === 'needs_amendment' && to === 'ai_screening') {
        update['revision'] = FieldValue.increment(1);
      }
      tx.update(ideaRef, update);

      // Append-only audit trail: feeds the timeline UI, the reports and the judges' audit-trail criterion.
      tx.set(ideaRef.collection('events').doc(), {
        type: 'status_changed',
        from,
        to,
        actorId: uid,
        actorRole: actor,
        note: cleanNote || null,
        createdAt: FieldValue.serverTimestamp(),
      });

      // In-app notification for the owner (email can be layered on top of this document).
      if (typeof idea['ownerId'] === 'string' && idea['ownerId'] !== uid) {
        tx.set(db.collection('notifications').doc(), {
          userId: idea['ownerId'],
          ideaId,
          title: STAGES[to].label,
          body: cleanNote || STAGES[to].help,
          health: STAGES[to].health,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    // Log the real cause for debugging; show the user a safe message.
    logger.error('transitionIdea failed', { ideaId, to, uid, error });
    throw new HttpsError('internal', 'We could not update this idea. Please try again.');
  }

  return { ok: true };
});

/**
 * The owner is ALWAYS treated as the owner, even if they also hold an evaluator role.
 * That is the conflict-of-interest rule: nobody evaluates their own idea.
 */
function resolveActor(uid: string, ownerId: unknown, role: UserRole | undefined): WorkflowActor | null {
  if (uid === ownerId) return 'owner';
  switch (role) {
    case 'evaluator':
      return 'evaluator';
    case 'adjudicator':
      return 'adjudicator';
    case 'admin':
      return 'admin';
    default:
      return null;
  }
}
```

Export it from `functions/src/index.ts`: `export { transitionIdea } from './transition-idea';`

**Why it is written this way**
- Clients cannot edit stages (`allow update: if false`), so **this function is the only door**. Judges can see the audit story: every move has an actor, a role, a time and a note.
- One **transaction** writes idea, event and notification together, so they can never disagree.
- Conflict of interest is built in: the owner is always the owner, even if they are also an evaluator.
- `HttpsError` messages are safe for users. The real error goes to `logger.error` for you to debug in the Firebase console.
- `resolveActor` never returns `'system'`, so no client can pose as the system. System moves (e.g. `submitted → ai_screening`) are made only by trusted triggers in Module 2, which reuse the same transition logic.
- Import note: if `functions/package.json` has `"type": "module"`, imports need a `.js` suffix (`'./shared/idea-workflow.js'`).

### 0.5 Sharing the workflow file with the functions

Cloud Functions cannot import from `src/app`, so copy the file at build time. `scripts/sync-shared.mjs`:

```js
// Copies the pure workflow file into the functions project so both use identical logic.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const src = 'src/app/shared/workflow/idea-workflow.ts';
const dest = 'functions/src/shared/idea-workflow.ts';
mkdirSync('functions/src/shared', { recursive: true });
copyFileSync(src, dest);
writeFileSync(dest, `// GENERATED from ${src} by scripts/sync-shared.mjs. Do not edit.\n${readFileSync(dest, 'utf8')}`);
console.log(`synced ${src} -> ${dest}`);
```

`package.json` → add `"sync:shared": "node scripts/sync-shared.mjs"`.
`firebase.json` → run it before the functions build and add emulators and storage:

```json
{
  "functions": {
    "source": "functions",
    "codebase": "default",
    "ignore": ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log", "*.local"],
    "predeploy": ["node scripts/sync-shared.mjs", "npm --prefix \"$RESOURCE_DIR\" run build"]
  },
  "firestore": { "rules": "firestore.rules" },
  "storage": { "rules": "storage.rules" },
  "emulators": {
    "auth": { "port": 9099 },
    "functions": { "port": 5001 },
    "firestore": { "port": 8080 },
    "storage": { "port": 9199 },
    "ui": { "enabled": true }
  }
}
```

### 0.6 `firestore.rules` changes

> I could not run the Firebase emulator in my environment, so **these rules are written carefully but untested**. The test prompt below is mandatory before you merge.

**Replace** `isEvaluator()` and `canReadIdea()` with this block (and update the three callers):

```
function userDoc() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
}
function hasRole(roles) {
  return request.auth != null
    && exists(/databases/$(database)/documents/users/$(request.auth.uid))
    && userDoc().role in roles;
}
function isStaff() { return hasRole(['evaluator', 'adjudicator', 'admin']); }
function isAdmin() { return hasRole(['admin']); }

// External evaluators (e.g. LEA) only see ideas assigned to them. Internal staff see all.
function isExternalEvaluator() {
  return hasRole(['evaluator']) && userDoc().get('evaluatorType', 'internal') == 'external';
}
function isAssigned(idea) {
  return 'assignedEvaluatorIds' in idea && request.auth.uid in idea.assignedEvaluatorIds;
}
// `idea` is the idea's data map, e.g. resource.data
function canReadIdea(idea) {
  return request.auth != null
    && (request.auth.uid == idea.ownerId
        || (isStaff() && (!isExternalEvaluator() || isAssigned(idea))));
}
```

**In `match /ideas/{ideaId}`**, change reads and the update rule:

```
allow get, list: if canReadIdea(resource.data);

// The owner may edit content ONLY while feedback is outstanding, and can never touch status.
allow update: if signedInAs(resource.data.ownerId)
  && resource.data.status == 'needs_amendment'
  && request.resource.data.status == resource.data.status
  && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
       'title', 'problem', 'proposedSolution', 'intendedBeneficiaries', 'plannedLocation',
       'marketPlan', 'feasibilityPlan', 'financingPlan', 'milestones', 'updatedAt'])
  && request.resource.data.updatedAt == request.time;   // plus the same shape checks as create
allow delete: if false;
```

Ask Copilot to extract the create rule's `marketPlan`/`feasibilityPlan`/`financingPlan`/`milestones` shape checks into a `validIdeaContent(data)` function and call it from **both** create and update, otherwise an owner could resubmit a malformed plan.

**Add inside `match /ideas/{ideaId}`:**

```
function parentIdea() { return get(/databases/$(database)/documents/ideas/$(ideaId)).data; }

// Audit trail: readable by people who can read the idea, written only by Cloud Functions.
match /events/{eventId} {
  allow read: if canReadIdea(parentIdea());
  allow write: if false;
}

// Blind-first scoring: you see colleagues' scores only after submitting your own.
// Only Cloud Functions write (they recompute the total server-side).
match /evaluations/{evaluatorId} {
  allow read: if isAdmin() || hasRole(['adjudicator'])
    || (isStaff() && request.auth.uid == evaluatorId)
    || (isStaff() && exists(/databases/$(database)/documents/ideas/$(ideaId)/evaluations/$(request.auth.uid)));
  allow write: if false;
}
```

In the existing `questions` block, replace `canReadIdea(parentIdeaOwnerId())` with `canReadIdea(parentIdea())`.

**Add at the top level:**

```
// Scoring criteria are versioned. Create-only, so old evaluations always match their version.
match /evaluationConfigs/{configId} {
  allow read: if isStaff();
  allow create: if isAdmin();
  allow update, delete: if false;
}

match /notifications/{notificationId} {
  allow read: if request.auth != null && resource.data.userId == request.auth.uid;
  allow update: if request.auth != null && resource.data.userId == request.auth.uid
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read']);
  allow create, delete: if false;
}

// Aggregate counters for dashboards (written by a function).
match /stats/{docId} {
  allow read: if isStaff();
  allow write: if false;
}

// Applicant drafts: private, so people can start on a phone and finish later.
match /users/{userId}/drafts/{draftId} {
  allow read, write: if signedInAs(userId);
}
```

> `list` queries must match the rule. A submitter must query `where('ownerId','==',uid)`, and an external evaluator must query `where('assignedEvaluatorIds','array-contains',uid)`, or Firestore rejects the whole query.

### 0.7 `storage.rules` (new)

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function isStaff() {
      return request.auth != null
        && firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role
           in ['evaluator', 'adjudicator', 'admin'];
    }
    // Path from AGENTS.md. The uid segment is the ONLY thing used for authorization.
    match /users/{uid}/{slug}/ideas/{ideaId}/images/{imageId} {
      allow read: if request.auth != null && (request.auth.uid == uid || isStaff());
      allow write: if request.auth != null && request.auth.uid == uid
        && request.resource.size < 5 * 1024 * 1024
        && request.resource.contentType.matches('image/(png|jpeg|webp)');
      allow delete: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

### 0.8 Copilot prompts for Module 0

**Prompt 0.1: wire the workflow into the shared model**
```text
CONTEXT: Read AGENTS.md, TEAM_NOTES.md, firestore.rules and everything in src/app/shared/models and src/app/core/services. I already added src/app/shared/workflow/idea-workflow.ts and evaluation-scoring.ts (+ specs). Do not edit those two files.
TASK: Make the shared idea model use IdeaStatus from idea-workflow.ts (import/re-export, do not duplicate the union). Add OPTIONAL server-written fields to the idea model: field (string), assignedEvaluatorIds (string[]), revision (number), statusUpdatedAt (Timestamp). Add 'adjudicator' to the user role type and optional evaluatorType ('internal'|'external') and organisation (string) to the user model.
RULES: Per AGENTS.md, list every writer, parser, validator, rule and test affected, and the reason for each field. Plan first, wait for my OK.
DONE WHEN: `npx ng build` and `npx ng test` pass. Do NOT commit or push.
```

**Prompt 0.2: rules and rules tests**
```text
CONTEXT: Read AGENTS.md and docs/DEV_GUIDE.md section 0.6 and 0.7.
TASK: Apply the firestore.rules changes in 0.6 and create storage.rules from 0.7. Extract the create rule's plan-shape checks into validIdeaContent(data) and call it from create and the owner update. Add @firebase/rules-unit-testing tests under firestore-tests/ (run against the emulator) for: owner reads own idea; owner cannot read another's; unassigned external evaluator is denied; assigned external evaluator is allowed; internal evaluator reads all; owner can edit content only when status is needs_amendment; nobody can change status from the client; evaluator cannot write evaluations; evaluator sees others' scores only after submitting their own; notification can only flip `read`.
DONE WHEN: all rules tests pass on the emulator. Do NOT commit or push.
```

**Prompt 0.3: functions, roles, emulator**
```text
CONTEXT: Read functions/src/index.ts, firebase.json and docs/DEV_GUIDE.md sections 0.4 and 0.5. I added functions/src/transition-idea.ts and scripts/sync-shared.mjs.
TASK: Export transitionIdea from index.ts. Add a callable setUserRole({uid, role, evaluatorType?, organisation?}) that only an admin can call, validates the role against ['user','evaluator','adjudicator','admin'], writes users/{uid} via the Admin SDK and appends an audit event to a top-level auditLogs collection. Add the sync:shared npm script and update firebase.json (predeploy, storage, emulators) as in the guide. Add scripts/seed.mjs that creates demo users (applicant, internal evaluator, external evaluator, adjudicator, admin) in the Auth and Firestore emulators.
RULES: Functions must not import Angular code. Log errors with firebase-functions/logger. Plan first.
DONE WHEN: `npm --prefix functions run build` passes and the emulators start. Do NOT commit or push.
```

**Bootstrapping the first admin:** `setUserRole` needs an admin to exist. Create the first admin once in the Firebase console (set `role: 'admin'` on that user's document), then use the function for everyone else. Never put admin creation in client code.

**Done when:** specs pass, `ng build` passes, rules tests pass, an illegal move (e.g. an applicant calling `transitionIdea` with `to: 'approved'`) returns `failed-precondition` in the emulator.

---

## Module 1. Submission

**Why:** this is where the brief's "guide, mentor, friend" idea shows. Many applicants will not be comfortable typing English on a laptop. The goal is: start anywhere, in your own language, by typing, speaking, photographing a sketch, or asking the helper. Everything stored is English.

### 1.1 Two meters, don't confuse them

| Meter | Where | Shows |
|---|---|---|
| **Form completeness** | Inside the submission form | % of mandatory fields filled. Client-side only |
| **Workflow progress** | Dashboard and status page | Stage percentage and green/yellow/red, from `STAGES` |

### 1.2 `src/app/shared/components/idea-progress/idea-progress.component.ts`  (new, compiled with strict templates)

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type IdeaStatus, STAGES } from '../../workflow/idea-workflow';

/** Icon per colour so the meaning never depends on colour alone (WCAG 1.4.1). */
const ICONS = { green: '✓', yellow: '!', red: '✕' } as const;

@Component({
  selector: 'app-idea-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap" [class.green]="stage().health === 'green'"
         [class.yellow]="stage().health === 'yellow'" [class.red]="stage().health === 'red'">
      <p class="label">
        <span class="icon" aria-hidden="true">{{ icon() }}</span>
        <strong>{{ stage().label }}</strong>
        @if (stage().progress !== null) {
          <span> · {{ stage().progress }}%</span>
        }
      </p>
      @if (stage().progress !== null) {
        <div class="track" role="progressbar" aria-label="Submission progress"
             [attr.aria-valuenow]="stage().progress" aria-valuemin="0" aria-valuemax="100"
             [attr.aria-valuetext]="stage().label + ', ' + stage().progress + ' percent'">
          <div class="bar" [style.width.%]="stage().progress"></div>
        </div>
      }
      <p class="help">{{ stage().help }}</p>
    </div>
  `,
  styles: `
    .wrap { --c: var(--stage-green, #1b7f3b); }
    .yellow { --c: var(--stage-yellow, #8a6100); }
    .red { --c: var(--stage-red, #b3261e); }
    .label { color: var(--c); margin: 0 0 .25rem; }
    .icon { display: inline-block; width: 1.5em; font-weight: 700; }
    .track { height: .75rem; background: var(--stage-track, #e3e3e3); border-radius: .375rem; overflow: hidden; }
    .bar { height: 100%; background: var(--c); transition: width .4s ease; }
    .help { margin: .25rem 0 0; }
    @media (prefers-reduced-motion: reduce) { .bar { transition: none; } }
  `,
})
export class IdeaProgressComponent {
  readonly status = input.required<IdeaStatus>();
  protected readonly stage = computed(() => STAGES[this.status()]);
  protected readonly icon = computed(() => ICONS[this.stage().health]);
}
```

Use it anywhere: `<app-idea-progress [status]="idea.status" />`. Import `IdeaProgressComponent` in the host component's `imports`.

**Why it is written this way:** `role="progressbar"` with `aria-valuenow`/`aria-valuetext` lets screen readers announce "Changes needed, 35 percent". The icon (`✓ ! ✕`) means colour-blind users are never left guessing. Colours are CSS variables so CEDA's branding tokens drop in without code changes (team rule 6). `prefers-reduced-motion` is honoured.

### 1.3 `src/app/core/services/speech.service.ts`  (new, compiled)

```ts
import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

// The Web Speech API is not in TypeScript's lib.dom, so we declare only what we use.
interface SpeechAlternativeLike { transcript: string }
interface SpeechResultLike { readonly length: number; readonly isFinal: boolean; [index: number]: SpeechAlternativeLike }
interface SpeechResultEventLike { resultIndex: number; results: { readonly length: number; [index: number]: SpeechResultLike } }
interface RecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}
type RecognitionCtor = new () => RecognitionLike;

/** Browser dictation. Chrome and Edge support it; Firefox does not, so callers must handle `supported() === false`. */
@Injectable({ providedIn: 'root' })
export class SpeechService {
  private readonly win = inject(DOCUMENT).defaultView as
    | (Window & { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor })
    | null;
  private recognition: RecognitionLike | null = null;

  private readonly ctor = this.win?.SpeechRecognition ?? this.win?.webkitSpeechRecognition ?? null;
  readonly supported = computed(() => this.ctor !== null);

  readonly listening = signal(false);
  readonly transcript = signal('');
  readonly error = signal<string | null>(null);

  start(languageTag: string): void {
    if (!this.ctor) { this.error.set('Voice input is not supported in this browser.'); return; }
    this.stop();
    const rec = new this.ctor();
    rec.lang = languageTag;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
      this.transcript.set(text);
    };
    rec.onerror = (event) => { this.error.set(event.error); this.listening.set(false); };
    rec.onend = () => this.listening.set(false);
    this.error.set(null);
    this.recognition = rec;
    rec.start();
    this.listening.set(true);
  }

  stop(): void {
    this.recognition?.stop();
    this.recognition = null;
    this.listening.set(false);
  }
}
```

**Why:** dictation helps people with motor impairments and low typing confidence. It is wrapped in a service so components stay small and you can swap the engine later.
**Honest limit:** browser dictation works in Chrome and Edge only, and support for **Setswana** is uncertain. Test `tn-BW` and `tn-ZA` on a real phone early. If unsupported, use the audio-upload fallback in Prompt 1.3, which sends a short recording to Gemini.

### 1.4 Copilot prompts for Module 1

**Prompt 1.1: completeness meter and drafts**
```text
CONTEXT: Read docs/DEV_GUIDE.md section 1 and the existing idea form in src/app/features/submissions/idea.
TASK: Add (a) a form-completeness meter (% of mandatory fields filled, aria-live polite, plain wording) as a computed signal from the reactive form, and (b) draft autosave to users/{uid}/drafts/current, debounced 1.5 s, restored on load, cleared after successful submit. Go through UserDataService; do not add Firestore calls in the component.
FILES: src/app/features/submissions/** and src/app/core/services/user-data.service.ts (draft methods only).
DONE WHEN: reload restores the draft; shared loader shows while saving; failures use ToastService; `npx ng build` passes. Do NOT commit.
```

**Prompt 1.2: language, dictation, read-aloud**
```text
CONTEXT: Read docs/DEV_GUIDE.md sections 1.3 and 7. SpeechService is in src/app/core/services/speech.service.ts.
TASK: In the idea form add (a) an input-language selector (English, Setswana, Ikalanga, Afrikaans, Shona; store the choice in the profile), (b) a "Speak" button on each long text field using SpeechService with the chosen language tag and a visible/announced listening state, (c) a "Read aloud" button using speechSynthesis. If speech is unsupported hide Speak and show a short explanation. Keyboard-operable, visible focus, labels not icon-only.
DONE WHEN: works in Chrome; no console errors in Firefox with Speak hidden; axe has no violations. Do NOT commit.
```

**Prompt 1.3: translate to English and audio/photo input (Cloud Functions)**
```text
CONTEXT: Read functions/src/index.ts (reuse the existing Gemini client, GEMINI_API_KEY secret and model constant) and README "Advisory AI" section.
TASK: Add callables (all require auth, validate input size, log errors with logger, return typed results): translateToEnglish({text, sourceLanguage}) -> {english}; transcribeAudio({audioBase64, mimeType, languageHint}) -> {text} which does NOT store the audio; extractTextFromImage({storagePath}) -> {text} which verifies the path starts with users/{callerUid}/ before reading it with the Admin SDK. Prompts must say: translate faithfully, do not add facts, keep names and numbers unchanged.
RULES: No account email, uid or display name is sent to Gemini. Extend the existing AI consent text in the UI to mention audio and images.
DONE WHEN: functions build; callable errors surface as a toast in the UI. Do NOT commit.
```

**Prompt 1.4: English preview before submit**
```text
CONTEXT: Read docs/DEV_GUIDE.md section 1.
TASK: On the final step, if the input language is not English, call translateToEnglish for each text field, show the English next to the original in an editable preview, and submit ONLY the English to /ideas. Keep the original text in the draft so the user can fix and re-translate.
DONE WHEN: the submitted idea document contains only English; loader and toast patterns are used. Do NOT commit.
```

**Prompt 1.5: sketch and camera**
```text
CONTEXT: AGENTS.md "Firebase Storage and images" section is binding.
TASK: Add an image attach control using <input type="file" accept="image/*" capture="environment"> (works on phones, no permissions code), validate type/size in the UI, upload one object per image to users/{uid}/{displayNameSlug}/ideas/{ideaId}/images/{imageId} via a core service, store references in the idea document, and add an "Extract text from this sketch" button calling extractTextFromImage and appending the result to a chosen field for the user to edit.
DONE WHEN: Storage emulator test for upload rules passes. Do NOT commit.
```

**Prompt 1.6: the field helper (the "mentor")**
```text
TASK: Add a callable fieldHelper({fieldId, currentText, language}) that returns a short, plain-language tip and 2 guiding questions for that field (e.g. for "market validation": "Who have you asked? What did they say?"), in the user's language, no jargon. In the UI, add a "Need help with this?" button per field that shows the tip in an aria-live region. Never send identity data. Rate-limit client calls (one request per field per 10 s).
DONE WHEN: works with the emulator; keyboard accessible. Do NOT commit.
```

**Done when:** a user can start on a phone, speak a field in their language, see English, attach a sketch, submit, and see a colour-coded stage with a percentage.

---

## Module 2. Automated screening (first evaluation stage)

**Why:** the brief wants the platform to check novelty, flag risks, categorise the idea and alert the right evaluator. The honest scope for 8 days: **do not scrape social media or "everything available"** (it breaks site terms, is fragile, and conflicts with the Data Protection Act). Instead build a **pluggable checker interface** (that satisfies "modularity") and implement two providers, listing the rest as roadmap.

| Provider | What it does | Effort |
|---|---|---|
| **Internal similarity** | Embed each idea; cosine similarity against all ideas in CEDA's own database; flag > ~0.85 as "very similar" | Low, brute force is fine for hundreds of ideas |
| **Web check with grounding** | Gemini with Google Search grounding returns existing products and sources, with links | Medium |
| IP pointers | Links and name hints for the Companies and Intellectual Property Authority (CIPA) and WIPO databases, worded as "check this", never "cleared" | Low |
| Roadmap | Start-up pools, social platforms, patent APIs: implement as further providers | Out of scope |

**Output contract** (store inside the existing `automatedReview`, server-written):
`field` (health, agriculture, tech, business, marketing, sales, other), `similarIdeas[]` (id, score, reason), `ipFlags[]`, `existingSolutions[]` (name, url, note), `resources[]` (mentors, funding, how to learn more), `completenessIssues[]`.

**Decision rules (AI stays advisory):**
- Missing mandatory information → `system` moves the idea to `needs_amendment` with a plain-language note (this is objective).
- Everything else → `ceda_criteria` with flags attached. If the AI call fails → still `ceda_criteria`, flag "automated check unavailable".
- Rejection is **human only** (the workflow table enforces this).

**Prompt 2.1: screening function**
```text
CONTEXT: Read functions/src/index.ts (existing Gemini analysis + automatedReview contract), shared idea model, docs/DEV_GUIDE.md Module 2. transitionIdea is in functions/src/transition-idea.ts.
TASK: First refactor the core of transitionIdea into an exported applyTransition(tx, ideaRef, to, actor, actorId, note) so triggers can reuse it (the callable keeps its checks). Then create functions/src/screening.ts with two triggers: onDocumentCreated('ideas/{ideaId}') moves submitted -> ai_screening as 'system' and runs the screening; onDocumentUpdated('ideas/{ideaId}') runs it again when status changes from needs_amendment to ai_screening (a resubmission). Define interface NoveltyProvider { name; check(idea): Promise<NoveltyFinding[]> } and implement InternalSimilarityProvider (Gemini embeddings stored in server-only ideaEmbeddings/{id}, cosine similarity in memory) and GroundedWebProvider (Gemini with Google Search grounding; return source URLs). Classify field into the fixed enum. Extend automatedReview with the output contract in the guide (update rules, model, parsers, tests per AGENTS.md). When screening ends, call applyTransition as 'system' to move to needs_amendment or ceda_criteria, writing an audit event with actorRole 'system'.
RULES: Send plan text only, never identity data. Wrap each provider in try/catch so one failure cannot stop screening. Idempotent: re-running must not duplicate events. Plan first.
DONE WHEN: emulator run moves a test idea submitted -> ai_screening -> ceda_criteria with flags saved; a missing-field idea goes to needs_amendment with a note. Do NOT commit.
```

**Prompt 2.2: report download**
```text
TASK: In features/tracking/status add a "Download my idea report" button that builds a printable HTML report from the idea + automatedReview (similar ideas, IP pointers, existing solutions with links, resources, next steps) and opens window.print() with a print stylesheet (PDF via the browser). No new PDF library (bundle budget).
DONE WHEN: report prints cleanly on A4; loading and error states exist. Do NOT commit.
```

**Prompt 2.3: CEDA criteria check (rule-based, stage `ceda_criteria`)**
```text
TASK: Add a rule-based checker (no AI) in functions/src/ceda-criteria.ts that validates CEDA requirements from a config document: required documents attached, applicant profile skills/education present, financing plan totals match cost items, milestones have dates. Output a checklist stored on the idea (server-written). Pass -> status stays and a human evaluator is assigned (Module 3); gaps -> needs_amendment with the checklist as the note. Make the requirements data-driven from evaluationConfigs so CEDA can change them without code.
DONE WHEN: unit tests cover each check. Do NOT commit.
```

---

## Module 3. Evaluation: multi-level, internal and external, adjudication

**Why:** this is the heart of the functionality score. The design is **config-driven**: CEDA can add a criterion or a level by creating a new config version, with no code change. That is the brief's "flexible modules" requirement.

### 3.1 Roles and levels

| Who | `role` | Extra | Can do |
|---|---|---|---|
| Applicant | `user` | | Submit, respond, resubmit, read own feedback |
| Internal evaluator | `evaluator` | `evaluatorType: 'internal'` | See all ideas (or by field), score, ask questions, request amendments |
| External evaluator (LEA etc.) | `evaluator` | `evaluatorType: 'external'`, `organisation` | **Only assigned ideas**, same actions |
| Adjudicator | `adjudicator` | | See panel summary, decide approve/amend/reject |
| Admin | `admin` | | Assign, configure criteria, award, manage roles |
| Committee observer | `user` or `observer` (optional) | | Read-only dashboard (Module 4) |

### 3.2 Config shape (`evaluationConfigs/{version}`, create-only)

```ts
export interface EvaluationConfig {
  version: string;                 // e.g. 'v1-2026-11'
  criteria: Criterion[];           // from evaluation-scoring.ts
  spreadThreshold: number;         // disagreement trigger, default 20
  passMark: number;                // e.g. 60
  panelSize: number;               // evaluators required before adjudication, e.g. 2
}
```

### 3.3 `src/app/features/evaluation/score-sheet/score-sheet.component.ts`  (new, compiled with strict templates)

```ts
import {
  ChangeDetectionStrategy, Component, computed, effect, input, output, untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, FormRecord, ReactiveFormsModule, Validators } from '@angular/forms';
import { type Criterion, weightedScore } from '../../../shared/workflow/evaluation-scoring';

export interface EvaluationDraft {
  scores: Record<string, number>;
  total: number;
  comment: string;
}

@Component({
  selector: 'app-score-sheet',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <div formGroupName="scores">
        @for (c of criteria(); track c.id) {
          <div class="row">
            <label [for]="'score-' + c.id">{{ c.label }} (0 to {{ c.maxScore }}, weight {{ c.weight }})</label>
            <input [id]="'score-' + c.id" type="number" inputmode="numeric" min="0" [max]="c.maxScore"
                   [formControlName]="c.id" />
          </div>
        }
      </div>
      <label for="comment">Comment for the applicant</label>
      <textarea id="comment" formControlName="comment" rows="4"></textarea>
      <p aria-live="polite">Total: {{ total() ?? 'incomplete' }}</p>
      <button type="submit" [disabled]="total() === null">Save evaluation</button>
    </form>
  `,
})
export class ScoreSheetComponent {
  readonly criteria = input.required<readonly Criterion[]>();
  readonly saved = output<EvaluationDraft>();

  // One stable form object. Controls are added/removed when CEDA changes the criteria,
  // so a new criterion needs no code change.
  private readonly scores = new FormRecord<FormControl<number | null>>({});
  private readonly comment = new FormControl('', { nonNullable: true });
  protected readonly form = new FormGroup({ scores: this.scores, comment: this.comment });

  private readonly scoreValues = toSignal(this.scores.valueChanges, { initialValue: this.scores.value });

  protected readonly total = computed(() =>
    weightedScore(this.toSheet(this.scoreValues()), this.criteria()),
  );

  constructor() {
    effect(() => {
      const criteria = this.criteria();
      untracked(() => this.syncControls(criteria));
    });
  }

  protected submit(): void {
    const total = this.total();
    if (total === null) return; // button is disabled, this is the safety net
    this.saved.emit({
      scores: this.toSheet(this.scores.value),
      total,
      comment: this.comment.value.trim(),
    });
  }

  private syncControls(criteria: readonly Criterion[]): void {
    const wanted = new Set(criteria.map((c) => c.id));
    for (const id of Object.keys(this.scores.controls)) {
      if (!wanted.has(id)) this.scores.removeControl(id);
    }
    for (const c of criteria) {
      if (!this.scores.contains(c.id)) {
        this.scores.addControl(
          c.id,
          new FormControl<number | null>(null, [Validators.required, Validators.min(0), Validators.max(c.maxScore)]),
        );
      }
    }
  }

  private toSheet(values: Record<string, number | null | undefined>): Record<string, number> {
    const sheet: Record<string, number> = {};
    for (const [id, mark] of Object.entries(values)) {
      if (typeof mark === 'number') sheet[id] = mark;
    }
    return sheet;
  }
}
```

**Why it is written this way:** the form is built **from the config**, so a new criterion just appears. The total is a `computed` over the form values using the same `weightedScore` the server uses, and the Save button stays disabled until every criterion is valid. The client total is only a preview: the server recomputes it.

### 3.4 Pages (generate with the command from `TEAM_NOTES.md`)

```bash
npx ng generate component features/evaluation/queue --type=component --style=scss --skip-tests
npx ng generate component features/evaluation/adjudication --type=component --style=scss --skip-tests
```
Then add one route each in `evaluation.routes.ts` (e.g. `queue`, `review/:ideaId`, `adjudication/:ideaId`), never in `app.routes.ts`.

### 3.5 Copilot prompts for Module 3

**Prompt 3.1: server side scoring and assignment**
```text
CONTEXT: Read docs/DEV_GUIDE.md Module 3, functions/src/transition-idea.ts, src/app/shared/workflow/evaluation-scoring.ts. Sync the scoring file into functions the same way as idea-workflow.ts (extend scripts/sync-shared.mjs).
TASK: Add callables in functions/src/evaluation.ts: (1) submitEvaluation({ideaId, configVersion, scores, comment}) -> verifies caller is an evaluator assigned to the idea (external) or staff (internal), idea.status === 'human_review', caller is not the owner, no existing evaluation by caller; loads the config; recomputes the total with weightedScore (reject null); writes ideas/{id}/evaluations/{uid} with total, configVersion, createdAt, evaluatorType; appends an audit event; when evaluation count >= config.panelSize calls the shared transition to 'adjudication' if summarisePanel says needsAdjudication, otherwise keeps 'human_review' for the evaluator to advance. (2) assignEvaluators({ideaId, evaluatorIds}) admin-only, writes assignedEvaluatorIds, excludes the owner, creates notifications. (3) autoAssign: pick evaluators whose field expertise matches idea.field, least-loaded first, never the owner or anyone sharing the owner's organisation.
RULES: No client may write evaluations. Transactions where two writes must agree. Plan first.
DONE WHEN: emulator tests: duplicate evaluation rejected; owner cannot evaluate; unassigned external evaluator rejected; total recomputed server-side ignores a tampered client total. Do NOT commit.
```

**Prompt 3.2: evaluator queue and review page**
```text
CONTEXT: Read docs/DEV_GUIDE.md Module 3 and the existing features/evaluation/review component.
TASK: Build (a) evaluation/queue: list of ideas assigned to me (or my field for internal), with app-idea-progress chips, filters by field and stage, and a "waiting since" time; query correctly for the rules (array-contains for external evaluators). (b) evaluation/review/:ideaId: idea details (read-only), the existing AI report as ADVISORY labelled text, ScoreSheetComponent fed from the latest evaluationConfigs doc, a feedback box, the Q&A thread (existing questions subcollection), and buttons for allowed transitions only (use allowedNextStatuses with the caller's actor). 'Request changes' and 'Reject' require a note. Show other evaluators' scores only after mine are saved (rules already enforce this; show a clear message when hidden).
RULES: Services for data access, no Firestore in components. Loader + toast patterns. Keyboard accessible score entry.
DONE WHEN: an evaluator can score an assigned idea and request changes; the applicant sees the note. Do NOT commit.
```

**Prompt 3.3: adjudication**
```text
TASK: Build evaluation/adjudication/:ideaId for adjudicators/admins: panel summary using summarisePanel (count, mean, spread), per-evaluator scores with z-scores computed per evaluator across their evaluations, a clear banner when spread exceeds the threshold ("evaluators disagree, please discuss"), comments side by side, and Approve / Request changes / Reject actions calling transitionIdea (note required for the last two). Admin-only 'Award' button on approved ideas.
DONE WHEN: the full golden path reaches 'awarded' in the emulator. Do NOT commit.
```

**Prompt 3.4: criteria admin**
```text
TASK: In features/admin (coordinate with the teammate who owns it) add a simple form to create a new evaluationConfigs version by copying the latest and editing criteria (label, weight, max), spreadThreshold, passMark, panelSize. Validate weights > 0 and at least one criterion. Never edit an existing version.
DONE WHEN: a new version is created and the score sheet shows the new criterion with no code change. Do NOT commit.
```

---

## Module 4. Real-time tracking, dashboards and notifications

**Why:** "clear tracking of stages" is a named priority and a Functionality criterion. Firestore listeners give real-time updates for free, and the `events` subcollection gives a proper timeline and the audit trail.

### 4.1 Pages

| Page | Audience | Shows |
|---|---|---|
| `tracking/status` | Applicant | `app-idea-progress`, timeline from `events`, latest feedback, "Your submission is still being processed" via `processingMessage`, questions, report download |
| `tracking/dashboard` (add) | Committee, internal and external stakeholders | Column per stage with counts and cards, filters by field, health chips, live updates |
| Notification bell (app shell, coordinate with the UI teammate) | Everyone | Unread count with `aria-live`, list, mark read |

### 4.2 Prompts

**Prompt 4.1: applicant status page**
```text
CONTEXT: Read docs/DEV_GUIDE.md Module 4 and features/tracking/status.
TASK: Build the page for one idea: <app-idea-progress>, a vertical timeline from ideas/{id}/events (newest first; each entry shows stage label, date, actor role and note), a 'What to do next' box from STAGES[status].help, the 'still being processed' message from processingMessage(), and the feedback note prominently in a yellow-state panel with an 'Update my idea' button (opens the submissions form in edit mode when status is needs_amendment; saving edits writes the idea directly, which the rules allow only in that state) and a separate 'Send for re-check' button that calls transitionIdea with to: 'ai_screening'. Real-time via AngularFire docData/collectionData converted with toSignal. Use a small ClockService (signal updated every 60 s) for 'now' so templates never call Date directly.
DONE WHEN: moving the idea with transitionIdea in the emulator updates the page without refresh. Do NOT commit.
```

**Prompt 4.2: stakeholder dashboard**
```text
TASK: Create features/tracking/dashboard: a board with one column per stage (from IDEA_STATUSES/STAGES), card counts, and cards (title, field, health chip with icon+text, days in stage). Filters by field and health. For observers/external stakeholders show only what the rules allow; handle permission-denied with a friendly message. Responsive: columns scroll horizontally on mobile with a stage selector alternative. Each card is a real link/button, keyboard accessible.
DONE WHEN: counts match Firestore; works at 360 px width. Do NOT commit.
```

**Prompt 4.3: notifications**
```text
TASK: Add a NotificationService (core/services) with an unread-count signal and list from notifications where userId == me, ordered newest first, and markRead(id). Build a bell component for the app shell (ask the UI-theme owner where it goes; do not edit app.html yourself). Announce new notifications with aria-live polite.
Then enable email: install the Firebase 'Trigger Email from Firestore' extension, and in a function that creates notifications ALSO write a mail document for users whose profile allows email alerts (opt-in checkbox in profile, free as the brief requires).
DONE WHEN: a stage change shows a bell notification instantly. Do NOT commit.
```

---

## Module 5. Reporting

**Why:** transparency and "strategic decision making". Event-driven counters keep dashboards fast (one document read) and demonstrate the scalability story.

**Design:** a function on `ideas/{id}/events/{eventId}` creation increments `stats/overview` (counts per status, per field, total submissions, per-day submissions, stage durations in minutes totals and counts). Reports read this one doc in real time. Raw events also support CSV export.

**Prompt 5.1: counters**
```text
CONTEXT: Read docs/DEV_GUIDE.md Module 5 and functions/src/transition-idea.ts.
TASK: Add onDocumentCreated('ideas/{ideaId}/events/{eventId}') in functions/src/stats.ts that updates stats/overview with FieldValue.increment: byStatus[to] +1, byStatus[from] -1 (when from exists), byField, submissionsByDay[YYYY-MM-DD], and stageDurations[from] {totalMinutes, count} computed from the previous event time. Make it idempotent by storing the processed eventId in a small subcollection or using event.id guard.
DONE WHEN: moving 3 test ideas updates counters correctly. Do NOT commit.
```

**Prompt 5.2: reports page**
```text
CONTEXT: Read docs/DEV_GUIDE.md Module 5; features/reporting/reports exists.
TASK: Build sections: (1) Participation: total submissions, by field, by day. (2) Pipeline funnel: counts per stage and conversion between stages. (3) Turnaround: average days per stage. (4) Evaluation outcomes: score distribution (from evaluations), disagreement count, amendment rate. (5) Awards list. Use plain HTML/CSS/inline SVG bars, no chart library (bundle budget) and ALWAYS include a data table alternative for each chart (accessibility). Buttons: 'Export CSV' (client-side Blob) and 'Print / save as PDF' (print stylesheet). Date range filter.
DONE WHEN: numbers match the emulator data; keyboard and screen-reader friendly. Do NOT commit.
```

---

## Module 6. Security and compliance (judged: RBAC 5, audit 5, security 5)

| Control | How |
|---|---|
| RBAC + least privilege | Rules in 0.6, `hasRole`, assignment checks, owner COI rule |
| Roles only by trusted code | `setUserRole` admin callable; users cannot edit `role` (existing rule) |
| Audit trail | Every stage move writes `ideas/{id}/events`; admin changes write `auditLogs`; both write-only by functions |
| Server-trusted fields | `status`, `assignedEvaluatorIds`, evaluation totals and AI fields are written only by functions |
| Input validation | Rules shape checks and function-side validation, size limits on text and uploads |
| Secrets | `GEMINI_API_KEY` stays a Firebase Secret; never in Angular config |
| Abuse protection | Turn on Firebase **App Check** (reCAPTCHA) for callables and Firestore if time allows |
| Authentication | Email verification exists. For OTP/MFA mention Firebase Auth phone and TOTP MFA; implement phone OTP for staff if a teammate has time |
| Privacy | Consent for AI (exists) extended to audio/images; privacy notice page; no identity in Gemini calls; audio not stored; retention statement |

**Stretch: tamper-evident log.** Add `hash = sha256(prevHash + JSON(event))` to each event inside `transitionIdea`. It is a few lines and a very good talking point for "data integrity".

**Prompt 6.1: security review**
```text
TASK: Review firestore.rules, storage.rules and functions/src for: privilege escalation (can any client set role/status/assignedEvaluatorIds?), missing auth checks, unbounded input sizes, reading another user's data, and logging of personal data. Report findings as a table (file, line, risk, fix). Fix only what I approve. Do NOT commit.
```

**Hosting facts the judges ask for (fill in with your team):** cloud provider (Google Cloud via Firebase), **region** (check the Firestore location in the console; it cannot be changed later, and Johannesburg `africa-south1` is the closest if available to your project), and storage cost estimate (use the Firebase pricing calculator; state free-tier assumptions). Say 24/7 availability comes from managed hosting.

---

## Module 7. Accessibility and inclusion

**Why:** "no fear of technology, no discrimination" is your core idea, and the repo rule is that it **must pass axe and WCAG AA**.

Use `features/accessibility/voice-settings` as a general **Accessibility settings** page (rename the title only; routes stay).

**Settings to persist in the profile:** language, text size (small/normal/large/extra large), high contrast, reduced motion, read-aloud on, simple-language mode (shorter helper text).

**Prompt 7.1**
```text
CONTEXT: Read AGENTS.md accessibility rules and docs/DEV_GUIDE.md Module 7.
TASK: Build the accessibility settings page (reactive form). Persist via UserDataService (profile preferences; update rules/model/tests per AGENTS.md). Apply settings app-wide with CSS custom properties on <html> set from a service using the DOCUMENT token (text scale, high-contrast token set, reduced-motion). Add a 'Skip to content' link and a visible focus style.
DONE WHEN: settings survive reload and change the UI; axe DevTools shows no violations on this page. Do NOT commit.
```

**Prompt 7.2: accessibility sweep**
```text
TASK: Review every template in features/submissions, evaluation and tracking against: labels on all inputs, error messages linked with aria-describedby, focus moves to the first error on failed submit, heading order, colour contrast >= 4.5:1, no colour-only meaning, touch targets >= 44 px, works at 200% zoom and 360 px width. List issues with file and line, then fix with minimal diffs. Do NOT commit.
```

**Manual checks that beat any tool:** tab through the whole golden path with the keyboard only; turn on a screen reader for the submit page; test on a cheap Android phone over mobile data.

---

## Module 8. Demo, deliverables and defence

### 8.1 Submission checklist (from the brief, section 13)

- [ ] **URL link** to the live solution (mandatory)
- [ ] **Walkthrough video** (mandatory)
- [ ] **Source code** (mandatory), **without `node_modules`**, to stay under the 150 MB limit
- [ ] README: how to run, tools, emulator and env steps, demo accounts
- [ ] User manual (a short illustrated PDF per role)
- [ ] Installation/executable notes (it is a web app: browser access plus build instructions)

### 8.2 Five-minute demo script (matches the judging weights)

1. **Applicant (60 s):** sign in, speak a field in Setswana, see the English preview, attach a sketch, submit. Show the colour progress bar.
2. **Screening (30 s):** report with category, similar ideas, IP pointers. Say "advisory, humans decide".
3. **Feedback loop (60 s):** evaluator requests changes (yellow), applicant sees the note, resubmits.
4. **Multi-level evaluation (60 s):** internal and external evaluator score blind, disagreement flag, adjudicator approves.
5. **Tracking and reports (60 s):** live board updates, notification bell, report export.
6. **Security and scale (30 s):** rules, audit trail, role-based views, event-driven counters, region and hosting.

### 8.3 Defence cheat sheet

| Likely question | Answer |
|---|---|
| Why a workflow table? | One tested source of truth; enforced server-side; add stages in one line |
| Why not let clients update status? | Integrity and audit: all moves go through one validated transaction |
| Why is the AI advisory? | Fairness and accountability; humans decide; also helps data-protection compliance |
| How is IP protected? | Assignment-based access for external evaluators, rules tests, no identity sent to AI |
| How does it scale? | Managed serverless, event-driven counters, per-document listeners, modular features lazy-loaded |
| How do you handle bias between evaluators? | Blind-first scoring, z-score normalisation, spread-based adjudication |
| What about integrations? | `NoveltyProvider` interface, config-driven criteria, events as an integration surface |

---

## Appendix: what was verified, and what was not

**Verified in a scratch project (outside your repo):**
- `idea-workflow.ts` and `evaluation-scoring.ts` pass 20 Vitest tests and compile under `strict` plus `noPropertyAccessFromIndexSignature`.
- `transition-idea.ts` type-checks against current `firebase-functions` and `firebase-admin`.
- `idea-progress`, `score-sheet` and `speech.service` compile with Angular 21 `strictTemplates`.

**Not verified:**
- `firestore.rules` and `storage.rules` (no emulator available to me). Run the rules tests from Prompt 0.2.
- Anything that needs your `src/` code (models, services, existing form) or live Gemini calls.
- Gemini behaviour for Setswana transcription and translation quality. Test early with real sentences.
- Legal compliance with the Data Protection Act 2024. Have someone qualified review the consent and retention wording.
