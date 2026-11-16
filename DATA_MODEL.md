# CEDAbility - Firestore Data Model

The single reference for **where every record lives**. If you need data and it isn't here, ask before inventing a new collection. Keep this file updated in the same PR that changes the model.

## 1. Collection map

```
users/{uid}
  ├── notifications/{notificationId}
  └── ideas/{ideaId}

ideas/{ideaId}
  ├── versions/{versionId}          # snapshot on every (re)submission
  ├── statusHistory/{entryId}       # timeline shown to the submitter
  ├── feedback/{feedbackId}         # evaluator feedback + submitter reply
  ├── evaluations/{evaluatorUid}   # scores (hidden from submitter)

assignments/{assignmentId}          # evaluator worklist
stages/{stageId}                    # workflow configuration (admin-editable)
criteriaSets/{criteriaSetId}        # scoring criteria (admin-editable)
formDefinitions/{formId}            # dynamic application form (admin-editable)
awards/{awardId}                    # recognition and rewards

faqs/{faqId}                        # content (admin-editable)
announcements/{announcementId}

chats/{chatId}
  └── messages/{messageId}
agentPresence/{uid}                  # chat agent self-reported availability

auditLogs/{logId}                   # append-only audit trail (Functions write only)
settings/{docId}                    # app config, e.g. settings/chat
```

**There is no `users/{uid}/ideas`.** An idea belongs to a user through the `ownerId` field, so "my ideas" is one query, and an idea is stored once and never duplicated:

```ts
query(collection(db, 'ideas'), where('ownerId', '==', uid), orderBy('updatedAt', 'desc'))
```

## 2. Roles

Stored as a **custom claim** (source of truth, used by Security Rules) and mirrored to `users/{uid}.role` for display. Only a Admin may change a role.

`submitter` | `evaluator` | `adjudicator` | `admin` | `agent` (chat consultant)

## 3. Collections in detail

Every document has `createdAt` and `updatedAt` (Firestore `Timestamp`). Field names are camelCase.

### `users/{uid}`  (doc ID = Firebase Auth UID)
| Field | Type | Notes |
|---|---|---|
| displayName | string | |
| email | string | |
| phone | string? | E.164, e.g. +267... |
| role | string | mirror of the custom claim |
| organization | string? | |
| avatarPath | string? | Storage path |
| emailVerified / phoneVerified | boolean | |
| consent | map | `{ acceptedAt: Timestamp, policyVersion: string }` (Data Protection Act) |
| isActive | boolean | admin can disable |

- `users/{uid}/notifications/{id}`: `{ type, title, body, ideaId?, read: boolean, createdAt }`
- `users/{uid}/subscriptions/{ideaId}`: `{ channels: ['email','inApp'], createdAt }`

### `ideas/{ideaId}`
| Field | Type | Notes |
|---|---|---|
| ownerId | string | user UID |
| ownerName | string | denormalized for list views |
| title | string | |
| summary | string | short text for lists |
| category | string | |
| answers | map | answers to the dynamic form, keyed by field key |
| formDefinitionId / formVersion | string / number | which form was used |
| attachments | array<map> | `{ name, storagePath, contentType, size }` (keep small, max ~10) |
| status | string | see section 4 |
| currentStageId | string? | |
| version | number | increments on resubmission |
| submittedAt | Timestamp? | |

Subcollections:
- **versions/{versionId}**: `{ version, answers, title, submittedAt }`
- **statusHistory/{entryId}**: `{ from, to, stageId?, byUid, byRole, note?, at }`
- **feedback/{feedbackId}**: `{ stageId, evaluatorUid, evaluatorName, message, requiresResubmission: boolean, reply?: { message, at }, createdAt }`
- **evaluations/{stageId_evaluatorUid}**: `{ stageId, evaluatorUid, scores: { [criterionId]: number }, comments, total, submittedAt }` (submitter cannot read)
- **adjudications/{stageId}**: `{ stageId, adjudicatorUid, decision: 'advance'|'reject'|'revise', finalScore, note, decidedAt }`

### `assignments/{assignmentId}`
`{ ideaId, stageId, evaluatorUid, status: 'pending'|'in_progress'|'done', dueAt?, assignedBy }`
Evaluator worklist: `where('evaluatorUid','==',uid).where('status','!=','done')`

### `stages/{stageId}`  (multi-level workflow)
`{ name, order: number, criteriaSetId, evaluatorUids: string[], requiresAdjudication: boolean, isActive }`

### `criteriaSets/{criteriaSetId}`
`{ name, criteria: [{ id, label, description, maxScore, weight }] }`

### `formDefinitions/{formId}`
`{ name, version, isActive, fields: [{ key, label, type, required, options?, helpText?, order }] }`
`type` is one of `text | textarea | select | multiselect | number | date | file`.

### `awards/{awardId}`
`{ ideaId, ownerId, title, type, citation, awardedBy, awardedAt, isPublic }`

### `faqs/{faqId}` / `announcements/{announcementId}`
- faq: `{ question, answer, category, order, contact?: { authority, email, phone } }`
- announcement: `{ title, body, publishAt, isPublished }`

### `chats/{chatId}`
`{ userId, userName, status: 'waiting'|'active'|'closed'|'offline_message', handledBy, handledByName, startedAt, closedAt, lastMessageAt, firstResponseAt }`
`handledBy`/`handledByName`/`closedAt`/`firstResponseAt` are `null` until set. A chat starts as `waiting` (an agent is expected to respond live) or `offline_message` (created outside business hours or when no agent is available; the client leaves one message for later follow-up). An agent "claims" a `waiting` chat by setting `handledBy`/`handledByName` and moving it to `active`; only that agent may update the chat afterwards.
- `chats/{chatId}/messages/{messageId}`: `{ senderUid, senderRole, text, createdAt }`. Sending a message updates the parent chat's `lastMessageAt` (and `firstResponseAt`, once, on the assigned agent's first reply) in the same batch.
- Business hours live in `settings/chat`: `{ timezone: 'Africa/Gaborone', days: [1,2,3,4,5], open: '09:00', close: '16:00', holidays: ['YYYY-MM-DD'] }`. `days` uses ISO weekday numbers (1 = Monday ... 7 = Sunday).

### `agentPresence/{uid}`  (doc ID = agent's UID)
`{ uid, displayName, isAvailable, activeChatCount, maxConcurrentChats, updatedAt }`
An agent toggles their own `isAvailable` from the chat console; `activeChatCount` is incremented/decremented by the console as the agent claims/closes chats. Readable by any signed-in user (to decide whether live chat is offered); writable only by the agent themselves or an admin. Like other client-maintained counters in this app, `activeChatCount` is client-trusted, not Functions-verified.

### `stats/{docId}`  (written by Functions only)
`stats/overview`: `{ totalIdeas, byStatus: {...}, byCategory: {...}, totalUsers, avgDaysPerStage: {...}, updatedAt }`
Dashboards read these small documents. Never scan the whole `ideas` collection to draw a chart.

### `auditLogs/{logId}`  (append-only, Functions write only)
`{ actorUid, actorRole, action, entityType, entityId, summary, at }`
`action` examples: `idea.submitted`, `idea.status_changed`, `evaluation.submitted`, `role.changed`, `user.disabled`, `content.updated`.

## 4. Idea status values

The canonical idea statuses, in sync with `IDEA_STATUSES` in `src/app/shared/workflow/idea-workflow.ts`, are:

```text
submitted
ai_screening
needs_amendment
ceda_criteria
human_review
adjudication
approved
awarded
rejected
```

Labels, help text, health colours, and valid transitions are defined in `idea-workflow.ts`; do not introduce additional canonical status values here.

Legacy idea statuses are normalized when read: `draft` -> `submitted`, `under-review` / `under_review` -> `human_review`, `needs-revision` / `needs_revision` / `feedback_requested` -> `needs_amendment`, `revised` -> `ai_screening`, `accepted` -> `approved`, and `declined` -> `rejected`. Drafts in the submission form are saved locally and are not new Firestore ideas; a newly created idea starts as `submitted`.

Status changes go through a Cloud Function (or a rules-restricted write), which also writes `statusHistory`, a notification and an audit log entry. **Do not set `status` freely from components.**

## 5. Who reads and writes what

| Collection | Owner feature | Client can write | Client can read |
|---|---|---|---|
| users | account | own profile fields (not `role`) | own doc; admin all |
| ideas (+ versions, feedback) | submissions | owner: create/edit while needs_amendment | owner, evaluators, adjudicators, admin |
| evaluations, adjudications | evaluation | evaluator / adjudicator | evaluators, adjudicators, admin (not submitter) |
| statusHistory | tracking | no (Functions) | owner, staff |
| assignments, stages, criteriaSets | evaluation / admin | admin | assigned evaluator, admin |
| formDefinitions, faqs, announcements | admin | admin | everyone signed in (published only) |
| chats, messages | chat | participants: create/update own chat & messages; agent: claim + update assigned chat | owner, agents, admin |
| agentPresence | chat | the agent themselves; admin | everyone signed in |
| stats | reporting | no | admin, adjudicator |
| auditLogs | core | no | admin |
| awards | evaluation | admin | owner; public if `isPublic` |

## 6. Storage paths (Firebase Storage)

```
ideas/{ideaId}/attachments/{fileName}
users/{uid}/avatar.jpg
```

## 7. Rules of the road

- **IDs:** let Firestore auto-generate IDs, except `users/{uid}` and composite keys shown above.
- **No unbounded arrays.** Anything that can grow (messages, feedback, history) is a subcollection.
- **Documents max 1 MB.** Upload files to Storage and store only the path.
- **Denormalize only what lists need** (`ownerName`, `title`, `status`). Update copies from a Function when the source changes.
- **Timestamps:** use `serverTimestamp()`, never the client clock.
- **Composite indexes:** when Firestore asks for one, add it to `firestore.indexes.json` and commit it.
- **Security Rules** live in `firestore.rules` and are changed only by PR, tested with the emulator.
- **Personal data** (Data Protection Act, 2024): collect only what's needed; personal fields stay in `users`, not copied into ideas beyond `ownerId` and `ownerName`.
- **Changing the model:** edit this file in the same PR and tell the team.
