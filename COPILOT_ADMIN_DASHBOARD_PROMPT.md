# Prompt for GitHub Copilot: CEDAbility Admin Dashboard

> **How to use this file**
> 1. Open the project in VS Code, open **Copilot Chat** and switch to **Agent mode**.
> 2. Attach `DATA_MODEL.md` and `TEAM_NOTES.md` as context (drag them into the chat, or use `#file`).
> 3. Paste everything under the line **"PROMPT START"** below.
> 4. Work **one phase at a time**. After each phase run `npx ng build`, test it, commit, then tell Copilot to continue with the next phase.
> 5. Review the security-critical parts yourself (Cloud Functions auth checks, Firestore rules). Do not trust them blindly.

---

## PROMPT START

You are a senior Angular and Firebase engineer. Build the **Admin Dashboard** for **CEDAbility**, an innovation management portal (submit ideas, evaluate them, track status, recognise winners) for CEDA Botswana. Read `DATA_MODEL.md` and `TEAM_NOTES.md` first and follow them.

### 1. Constraints

**Stack:** Angular (check `package.json` for the installed version and follow its conventions), standalone components, signals, strict TypeScript, SCSS, AngularFire (Auth, Firestore, Functions), Cloud Functions for Firebase (TypeScript, 2nd gen, `firebase-admin`).

**Where to work**
- Frontend code only inside `src/app/features/admin/`. Keep the classic file naming (`name.component.ts`, `.html`, `.scss`).
- Add pages as **child routes in `features/admin/admin.routes.ts`**. Do **not** edit `src/app/app.routes.ts`.
- Backend code in a new `functions/` folder (create it if missing), organised as `functions/src/admin/*.ts`, `functions/src/stats/*.ts`, `functions/src/lib/audit.ts`.
- If you need a guard or service in `core/` or `shared/`, create it, but keep it small and mention it in your summary.
- Update `DATA_MODEL.md` for every new collection or field (see section 3).

**Quality rules**
- Lazy-load every page. No `any`. Typed models in `features/admin/models/`.
- Every list has loading (skeleton), empty and error states.
- All colours, fonts, radii and shadows come from **CSS variables (design tokens)** in one file (`features/admin/admin-theme.scss`), because CEDA will supply branding later. No hardcoded hex values in components.
- Responsive from 360px up. Keyboard accessible, visible focus, ARIA labels, WCAG AA contrast, and respect `prefers-reduced-motion`.
- No secrets, service-account keys or API keys in the repo. Never trust the client for authorisation.

### 2. UI and UX requirements

Design a **modern, clean, professional** admin console.

- **Layout:** collapsible sidebar with icons and labels, top bar with page title, search, notifications bell, and an account menu. On mobile the sidebar becomes a drawer.
- **Component library:** Angular Material (or Angular CDK plus custom components) with a custom theme from the tokens. Icons: Material Symbols or `lucide-angular`. Pick one icon set and use it everywhere.
- **Charts:** `ng2-charts` (Chart.js) or `ngx-charts`. Charts must follow the theme tokens and have text alternatives (a table or summary for screen readers).
- **Animations (tasteful, fast, 150 to 300 ms):** count-up numbers on stat cards, route transitions, staggered fade-in of cards, smooth sidebar collapse, animated chart draw, hover lift on cards, dialog and drawer transitions, skeleton shimmer. Disable or reduce all of them for `prefers-reduced-motion`.
- **Feedback:** toasts/snackbars for success and errors, confirm dialogs for destructive actions, inline form validation with clear messages.
- **Tables:** sticky header, sorting, search, filters, pagination (use Firestore cursor pagination, never load whole collections), row actions menu, status chips with colour plus text (not colour alone).
- **Empty states** with an illustration or icon and a helpful action.

### 3. Data model additions

Add these to `DATA_MODEL.md` and implement them.

**`tickets/{ticketId}`** (user support tickets)
`{ userId, userName, subject, category, priority: 'low'|'medium'|'high', status: 'open'|'in_progress'|'resolved'|'closed', assignedTo?: uid, assignedToName?, firstResponseAt?, resolvedAt?, resolvedBy?: uid, createdAt, updatedAt }`
`tickets/{ticketId}/messages/{messageId}`: `{ senderUid, senderRole, text, createdAt }`

**`chats/{chatId}`** also needs: `handledBy?: uid`, `handledByName?`, `firstResponseAt?`

**`staffStats/{uid}`** (written by Functions only; one per evaluator, support agent, adjudicator)
`{ displayName, role, evaluationsCompleted, feedbackGiven, assignmentsPending, chatsHandled, chatsResponded, ticketsAssigned, ticketsResolved, avgFirstResponseSeconds, lastActiveAt, updatedAt }`
`staffStats/{uid}/daily/{yyyy-MM-dd}`: `{ evaluationsCompleted, chatsResponded, ticketsResolved }` (for trend charts)

**`stats/overview`** (written by Functions only) must contain at least:
`{ totalUsers, usersByRole: {...}, activeUsers, totalIdeas, ideasByStatus: {...}, ideasByCategory: {...}, ideasPerDay: {...last 30 days}, openTickets, resolvedTickets, activeChats, evaluatorsCount, supportCount, pendingAssignments, updatedAt }`

**Roles** (custom claim `role`, mirrored in `users/{uid}.role`):
- `submitter` (shown in the UI as **User**)
- `evaluator`
- `adjudicator`
- `agent` (shown in the UI as **Support Team**)
- `admin`

### 4. Build in phases (stop after each phase and summarise what you did)

#### Phase 1: Shell, theme and Overview
1. Admin layout (sidebar, top bar, router outlet) and `admin-theme.scss` tokens (light theme now, structure ready for dark).
2. `admin.routes.ts` child routes: `overview`, `users`, `staff-activity`, `tickets`, `ideas`, `stages`, `forms`, `content`, `audit-log`, `settings`. Create placeholder pages for those not built yet. Default redirect to `overview`.
3. A route guard `adminGuard` (in `core/guards/`) that allows only users whose **ID token custom claim** `role === 'admin'`. Apply it to the admin route group.
4. **Overview page:** stat cards for Total Users, Total Ideas, Ideas Under Review, Awarded, Open Tickets, Active Chats, Evaluators, Support Team, Pending Evaluations. Each card: icon, count-up number, change vs previous period if available, link to the relevant page. Charts: users by role (donut), ideas by status (bar), ideas per day for 30 days (line), and a "Top staff this week" mini-leaderboard. Read data from `stats/overview` and `staffStats` using real-time listeners, with cleanup on destroy.

#### Phase 2: User and account management (UI + backend)
**UI (`users` page)**
- Table: name, email, phone, role chip, status (active/disabled), email verified, created date, last active. Search by name/email, filter by role and status, sort, cursor pagination.
- **Create account dialog:** display name, email, phone (optional), role (User, Evaluator, Adjudicator, Support Team, Admin). Validation: email format, E.164 phone, required fields.
- Row actions: change role, disable/enable, resend invite / password reset, view activity, delete (with typed confirmation).
- User detail drawer: profile, role history from audit logs, quick stats.

**Backend (callable Cloud Functions, 2nd gen, region as a constant in one config file)**
Every function must: (1) reject unauthenticated callers, (2) verify `request.auth.token.role === 'admin'`, (3) validate and sanitise input, (4) throw `HttpsError` with correct codes, (5) write an entry to `auditLogs` through `lib/audit.ts`.
- `createUserAccount({ displayName, email, phone?, role })`: create the Firebase Auth user, set custom claim `{ role }`, create `users/{uid}` (with `isActive`, `emailVerified: false`, timestamps), generate a **password-setup link** and deliver it by email (use the Trigger Email extension via the `mail` collection if configured, otherwise return the link once to the admin UI to copy, and never log it). **Never create or send plaintext passwords.**
- `setUserRole({ uid, role })`: update the custom claim and `users/{uid}.role`; revoke refresh tokens so the new claim applies; prevent an admin from demoting themselves; never allow removing the **last remaining admin**.
- `setUserActive({ uid, isActive })`: disable/enable in Auth and update the document; an admin cannot disable themselves.
- `resendInvite({ uid })`: new password-setup link.
- `deleteUserAccount({ uid })`: delete from Auth and handle the `users` document (anonymise instead of hard-delete if the user has ideas); same self/last-admin protections.
- `recomputeStats()`: admin-only tool that rebuilds `stats/overview` and `staffStats/*` from source data (safety valve if counters drift).
- A one-off **bootstrap script** `scripts/make-admin.ts` (uses Admin SDK with a local service account, path from an environment variable) to promote the first admin by email. Document how to run it. Never commit the key.

#### Phase 3: Staff activity tracking
**UI (`staff-activity` page)**
- Tabs: **Evaluators**, **Support Team**, **Adjudicators**.
- Table per tab with: name, evaluations completed, feedback given, pending assignments, chats responded, tickets resolved, average first response time, last active. Sort by any column, filter by date range, search by name.
- Evaluator and Support rows open a detail drawer with: totals, a 30-day trend chart from `staffStats/{uid}/daily`, and a recent activity list from `auditLogs` filtered by `actorUid`.
- "Top performers" cards and a workload indicator (pending vs completed).

**Backend (Firestore triggers, 2nd gen) in `functions/src/stats/`**
- `onEvaluationWritten` (`ideas/{ideaId}/evaluations/{id}`): on create, increment `evaluationsCompleted` and the daily counter; decrement pending assignments.
- `onFeedbackCreated` (`ideas/{ideaId}/feedback/{id}`): increment `feedbackGiven`.
- `onChatWritten` (`chats/{chatId}`): when `handledBy` is first set, increment `chatsHandled`; when an agent sends the first message in a chat, set `firstResponseAt` and increment `chatsResponded`; update `avgFirstResponseSeconds`.
- `onTicketWritten` (`tickets/{ticketId}`): count assigned; when status first becomes `resolved`, set `resolvedAt` and `resolvedBy` and increment `ticketsResolved`.
- `onUserWritten`, `onIdeaWritten`, `onAssignmentWritten`: maintain `stats/overview` counters.
- All counters use `FieldValue.increment` inside transactions or idempotent guards (compare `before` and `after`) so retries never double-count. Write `lastActiveAt` on staff activity.

#### Phase 4: Tickets, ideas and operations pages
- **Tickets:** list with filters (status, priority, assignee), assign to a Support Team member, change status, view the message thread, resolve (sets `resolvedBy`).
- **Ideas:** list with status filter, view detail, assign evaluators to the current stage (creates `assignments`), move an idea to another stage or status through a callable function that also writes `statusHistory`, a notification to the owner, and an audit log entry.
- **Stages and criteria:** CRUD for `stages` (order, evaluators, adjudication required) and `criteriaSets` (criteria with weight and max score) with drag-to-reorder.
- **Form builder:** CRUD for `formDefinitions` fields (type, label, required, options, order) with a live preview. Increment `version` on every publish.
- **Content:** CRUD for `faqs` and `announcements`.
- **Settings:** chat business hours (`settings/chat`: timezone `Africa/Gaborone`, Mon to Fri, 09:00 to 16:00, holidays list).
- **Audit log:** read-only table with filters by actor, action, entity and date, with cursor pagination and CSV export of the filtered view.

#### Phase 5: Security rules, indexes, tests and polish
- Update `firestore.rules` so that: only `admin` can read `auditLogs` and write `stages`, `criteriaSets`, `formDefinitions`, `faqs`, `announcements`, `settings`; `stats` and `staffStats` are readable by `admin` (and `adjudicator` for `stats`) and **writable by no client**; `users.role` cannot be changed from the client; `tickets` readable by the owner, assigned agent and admin.
- Add required composite indexes to `firestore.indexes.json`.
- Write **emulator-based tests** for the rules (admin vs non-admin) and unit tests for the key Cloud Functions' authorisation and last-admin protections.
- Accessibility pass (keyboard, screen reader labels), a performance pass (lazy loading, `OnPush`/signals, no unnecessary listeners), and a short `features/admin/README.md` describing pages, functions and how to run them with the **Firebase Emulator Suite**.

### 5. Definition of done for every phase
- `npx ng build` and `cd functions && npm run build` pass with no errors.
- Works against the **Firebase emulators**, with seed data script `scripts/seed-admin-demo.ts` (a few users per role, ideas, tickets, chats) so the dashboard looks alive in the demo.
- Non-admin users are redirected away and **cannot** call admin functions or read admin data (verify by test).
- No secrets committed. `DATA_MODEL.md` updated.

### 6. How to respond
Work phase by phase. At the end of each phase give: files created or changed, how to run and test it, any assumptions, and anything you need from me. If something is ambiguous, state your assumption and continue rather than stopping.

## PROMPT END
