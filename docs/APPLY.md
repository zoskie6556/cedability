# Idea form: how to apply

## 0. Before you touch anything
```bash
git checkout main && git pull --ff-only origin main
git checkout -b feature/submissions-idea-form
```
Check whether a teammate already wrote `src/app/features/submissions/idea/idea.component.*`. This bundle **replaces** those three files. If they have work in there, talk to them first.

## 1. Copy the files
Unzip at the repo root (everything is under `src/app/`).

| File | New or replaces |
|---|---|
| `features/submissions/idea/idea.component.ts/.html/.scss` | **replaces** the scaffolded page |
| `features/submissions/idea/idea-form.ts` (+ `.spec.ts`) | new: form structure, validation, mapping to `NewIdea` |
| `features/submissions/idea/idea-field/*` | new: the one reusable labelled field |
| `features/submissions/idea/idea-draft.service.ts` | new: local autosave |
| `core/services/speech.service.ts` | new: dictation and read-aloud. Tell the team (rule 4), it is in `core/` |
| `shared/workflow/*` (+ specs) | new: the stages and scoring from the guide |
| `shared/models/status-parse.ts` (+ spec) | new: reads old and new stage names safely |

## 2. Adopt the new stages (3 small edits in existing files)

**a) `src/app/shared/models/idea.model.ts`**: replace line 3

```ts
export type IdeaStatus = 'submitted' | 'under-review' | 'needs-revision' | 'accepted' | 'declined';
```
with
```ts
import type { IdeaStatus } from '../workflow/idea-workflow';

// The stages now live in ONE place. Re-exported so existing imports keep working.
export type { IdeaStatus } from '../workflow/idea-workflow';
```
(Put the `import` with the other imports at the top of the file.)

**b) `src/app/core/services/user-data.service.ts`**
- Delete the `requireIdeaStatus` function at the bottom of the file.
- Delete the now unused line `import type { IdeaStatus } from '../../shared/models/idea.model';`
- Add `import { requireIdeaStatus } from '../../shared/models/status-parse';`

Why: `parseIdea` throws on any status it does not know, so without this the first idea moved to a new stage would break every page that lists ideas. Old data (`under-review` and so on) is mapped to the new names on read.

**c) Find any other code using the old names** (dashboards, badges, evaluator pages):
```bash
grep -rn "under-review\|needs-revision\|'accepted'\|'declined'" src
```
Map: `under-review → human_review`, `needs-revision → needs_amendment`, `accepted → approved`, `declined → rejected`. For labels and colours use `STAGES[status]` from `idea-workflow.ts` instead of hard-coding.

`firestore.rules` needs **no change for this form**: new ideas are still created as `submitted`.

## 3. Check three guesses I could not verify
I could not see these files, so I assumed the names from your README. Fix the imports in `idea.component.ts` if they differ:
- `core/services/toast.service.ts` exports `ToastService` with `success/error/info(message)`.
- `shared/components/idea-loader/idea-loader.component.ts` exports `IdeaLoaderComponent` with selector `app-idea-loader` and a `label` input.
- After a successful send the page goes to `/dashboard`. Change it in `submit()` if you prefer another page.

## 4. Run
```bash
npx ng build
npx ng test
npx ng serve
```
Open `/submissions/idea` signed in as a `submitter`. Existing users stored with the legacy `user` role are normalized to `submitter` by `RoleService`.

**Manual checks**
- Tab through the whole form with the keyboard only. Focus should land on the step heading after Next.
- Press Next with empty fields: errors appear, focus jumps to the first bad field.
- Refresh mid-way: "We restored the idea you were working on" appears.
- Submit: a document appears in `ideas` with `status: 'submitted'`.
- Chrome or Edge: "Speak your answer" works. Firefox: the Speak button is hidden, everything else works.
- Phone width (360 px): no horizontal scroll.

## 5. Known limits (be honest in the demo)
- Tested: form logic (6 tests), status parser (3), workflow and scoring (20) all pass; all components compile under Angular 21 strict templates. **Not run in a browser or against your emulator.**
- Drafts are saved on this device only (localStorage). Moving them to Firestore is a follow-up.
- Non-English dictation is not translated yet. The form warns the user. Setswana dictation depends on the browser, so test it on a real phone.
- Editing an idea after "changes needed" is not in this form yet. It needs the rule and Cloud Function from Module 0 of the guide.

## 6. Copilot prompt to review it (optional)
```text
CONTEXT: Read AGENTS.md and TEAM_NOTES.md. I added the idea form under src/app/features/submissions/idea and speech.service.ts under core/services.
TASK: Review these files against AGENTS.md (standalone, signals, OnPush, inject(), reactive forms, class/style bindings, accessibility). Fix only import-path or naming mismatches with the real ToastService and IdeaLoaderComponent. Do not change behaviour. List anything else you would change, without changing it.
DONE WHEN: `npx ng build` and `npx ng test` pass. Do NOT commit or push.
```
