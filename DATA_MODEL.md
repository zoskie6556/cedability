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
`{ userId, userName, agentId?, status: 'waiting'|'active'|'closed'|'offline_message', startedAt, closedAt?, lastMessageAt }`
- `chats/{chatId}/messages/{messageId}`: `{ senderUid, senderRole, text, createdAt }`
- Business hours live in `settings/chat`: `{ timezone: 'Africa/Gaborone', days: [1,2,3,4,5], open: '09:00', close: '16:00', holidays: ['YYYY-MM-DD'] }`

### `stats/{docId}`  (written by Functions only)
`stats/overview`: `{ totalIdeas, byStatus: {...}, byCategory: {...}, totalUsers, avgDaysPerStage: {...}, updatedAt }`
Dashboards read these small documents. Never scan the whole `ideas` collection to draw a chart.

### `auditLogs/{logId}`  (append-only, Functions write only)
`{ actorUid, actorRole, action, entityType, entityId, summary, at }`
`action` examples: `idea.submitted`, `idea.status_changed`, `evaluation.submitted`, `role.changed`, `user.disabled`, `content.updated`.

## 4. Idea status values

```
draft -> submitted -> under_review -> feedback_requested -> revised -> under_review
                                   -> approved -> awarded
                                   -> rejected
```
`draft | submitted | under_review | feedback_requested | revised | approved | rejected | awarded`

Status changes go through a Cloud Function (or a rules-restricted write), which also writes `statusHistory`, a notification and an audit log entry. **Do not set `status` freely from components.**

## 5. Who reads and writes what

| Collection | Owner feature | Client can write | Client can read |
|---|---|---|---|
| users | account | own profile fields (not `role`) | own doc; admin all |
| ideas (+ versions, feedback) | submissions | owner: create/edit while draft or feedback_requested | owner, evaluators, adjudicators, admin |
| evaluations, adjudications | evaluation | evaluator / adjudicator | evaluators, adjudicators, admin (not submitter) |
| statusHistory | tracking | no (Functions) | owner, staff |
| assignments, stages, criteriaSets | evaluation / admin | admin | assigned evaluator, admin |
| formDefinitions, faqs, announcements | admin | admin | everyone signed in (published only) |
| chats, messages | chat | participants | participants, agents |
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
