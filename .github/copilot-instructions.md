
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

// This section was added by Oageletswe.
## Stack
Angular 21 standalone components, signals, OnPush, `inject()`, typed reactive forms, Firebase (Auth, Firestore, Storage, Functions), Vitest.

## Hard rules
1. Data lives ONLY where `DATA_MODEL.md` says. Never invent a collection; ask first. Update that file in the same change.
2. Idea stages come ONLY from `shared/workflow/idea-workflow.ts` (`STAGES`, `canTransition`). Never hard-code status strings, colours or percentages.
3. Status changes go through a Cloud Function that also writes `statusHistory`, a notification and an `auditLogs` entry. Components never set `status`.
4. AI is advisory. It can flag, summarise and ask questions. It never rejects, scores for ranking, or decides.
5. Everything stored or shown to evaluators is in English. Input language is a user choice.
6. Roles: `submitter | evaluator | adjudicator | admin | agent`. Internal vs external evaluator = a field on the user (`evaluatorType`), not a new role.
7. Submitters can never read `evaluations`.
8. Accessibility (WCAG 2.2 AA): labels, `aria-live` for status changes, focus management, keyboard only, never colour alone (always icon + text), 44px targets, `prefers-reduced-motion`.
9. Pure logic goes in plain `.ts` files (no Angular) with a `.spec.ts`. Components stay thin.
10. Personal data: only what is needed (Data Protection Act 2024). Do not send names, emails or IDs to the AI.

## Style
Small files, one job each. Comment WHY, not what. Typed errors, no `any`. Run `npx ng build && npx ng test` before saying done. Do not commit or push.
