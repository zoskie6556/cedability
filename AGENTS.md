
You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator
- Prefer inline templates for small components
- Prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Use the `inject()` function instead of constructor injection

## Project structure and shared UI

- Before adding a model, service, toast, or loading indicator, inspect and reuse the existing `src/app/shared/` and `src/app/core/` implementations.
- Put shared domain types and Firestore document contracts in `src/app/shared/models/`. Use `src/app/core/services/user-data.service.ts` for user and idea persistence; do not duplicate Firestore access or model definitions in feature components.
- Use `ToastService` from `src/app/core/services/toast.service.ts` for user-facing success, error, and information messages. Use the existing `app-idea-loader` from `src/app/shared/components/idea-loader/` for pending work rather than creating another spinner or loading style. Import the standalone component where needed and provide a meaningful loading label.
- For each user-facing asynchronous operation, show the shared loading treatment while it is pending and report failures through the shared toast/error UI. Do not silently swallow errors. Backend functions must not depend on Angular UI services; their errors should be logged and represented in the corresponding UI state.

## Firestore data contract

- Firebase Authentication supplies the user's UID; it does not automatically create a Firestore document. The application creates the user document at `/users/{uid}`. Keep the document ID equal to the authenticated UID and never store a plaintext password in Firestore.
- The target idea schema has a canonical document at `/ideas/{ideaId}` and an owner-scoped copy at `/users/{uid}/ideas/{ideaId}`. Use the same idea ID and keep both documents consistent. Route writes through the core data service and use a Firestore batch/transaction when both copies must be written together. Update Firestore rules and tests for both paths; do not assume one path's rules protect the other.
- Treat roles and server-generated evaluation/AI fields as trusted only when set by trusted server/admin code. Enforce ownership and evaluator access in Firestore Security Rules, not only in the UI.
- Shared model fields are application-wide contracts. When adding or changing one, state the reason in the change summary and update all affected writers, readers/parsers, validation, Firestore rules, tests, and directly related documentation. Do not add a field only to a feature-local interface.

## Firebase Storage and images

- Store uploaded image files and image arrays in Firebase Storage, not as binary data or base64 in Firestore. Keep the corresponding Storage object paths and needed metadata in the shared model/Firestore document.
- For idea attachments, use `users/{uid}/{displayNameSlug}/ideas/{ideaId}/images/{imageId}`. Use the authenticated UID as the authoritative owner segment; the sanitized display-name slug is for readability only, must not contain email/contact data, and must never be used for authorization. Fall back to a neutral slug if the display name is unavailable.
- Upload one image per object and keep a list of image references in the idea document. Validate file type and size in the UI and enforce ownership, allowed content type, and size limits in Firebase Storage Security Rules. Update `firebase.json` to deploy the Storage rules and add emulator tests whenever upload behavior is introduced or changed.
- Initialize AngularFire Storage in the feature's route providers when possible to preserve lazy loading. Reuse shared model and core-service patterns for upload and metadata operations; do not upload directly from templates or duplicate Storage logic in components.

## GitHub collaboration

- `main` is the intended shared integration branch. Check the current branch, worktree, and remote before any Git operation, and preserve changes made by teammates.
- Before starting implementation on a task, fetch `origin/main` and make sure the local `main` branch is current. If the worktree is clean and the current branch is `main`, run `git pull --ff-only origin main` and confirm it succeeded before proceeding.
- If the worktree is dirty or the current branch is not `main`, do not reset, stash, merge, or switch branches automatically. Fetching `origin/main` is safe, but pause and ask the user how to preserve the existing work and sync before implementation. If the remote is unavailable or the pull fails, report that the latest `main` could not be confirmed and do not claim the task started from it.
- Do not create commits or push automatically. Commit and/or push to `main` only when the user explicitly asks for that action in the current task.
- Before an explicitly requested push, review the exact diff and run relevant validation. Never force-push, rewrite shared history, or discard another contributor's changes. If the current branch is not `main`, the branch is diverged, or remote access is unavailable, stop and ask/report instead of switching or rewriting history without approval.
