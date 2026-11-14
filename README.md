# Cedability

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.9.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Firebase

Firebase and AngularFire are initialized during application bootstrap, so contributors do not need a separate local Firebase setup. Firestore is initialized lazily by the account and idea routes to keep it out of the initial page bundle. The web app configuration is in `src/app/core/firebase/firebase.config.ts`. This client-side configuration is public; protect Firebase data with Firebase Security Rules and configure authorized domains in the Firebase Console.

The account flow uses Firestore documents in `users/{uid}` for account and onboarding data, and `ideas/{ideaId}` for user submissions. Passwords remain in Firebase Authentication; the profile only has an optional `passwordLastSetAt` metadata field. Idea submissions include market research, feasibility, financing, cost items, and milestones. `firestore.rules` restricts user records to their owners, idea reads to owners and authorized evaluators, and evaluator questions to evaluators and the idea owner. Deploy the rules to the configured Firebase project before using the Firestore-backed flow.

### Advisory AI screening and evaluator questions

On the final submission step, applicants must acknowledge that their plan will be sent to Google Gemini through a Firebase Cloud Function for analysis. The function sends the plan content only; it does not send account email, user ID, or display name. Its structured report highlights evidence, gaps, and questions for a human evaluator. It does not score, rank, decide eligibility, or recommend funding. Human evaluators remain responsible for every decision. If the analysis fails, the submission remains available for human review.

The Cloud Function uses the Gemini API key as a Firebase Secret; never add the key to Angular configuration or commit it to source control. From the project root, configure the secret and deploy:

```sh
firebase functions:secrets:set GEMINI_API_KEY
firebase deploy --only firestore:rules,functions
```

Install the function dependencies once with `npm --prefix functions install`; the Firebase predeploy hook builds the TypeScript function. The Gemini model identifier and rubric version are kept in `functions/src/index.ts` and the initial Firestore review record. Evaluator access is controlled by `users/{uid}.role` (`evaluator` or `admin`); only a trusted administrator should assign those roles. Applicants can read evaluator questions and respond once; evaluators can read submissions and add questions.

## Shared loading and notifications

Use the idea loader while an operation is pending:

```html
<app-idea-loader label="Submitting your idea" />
```

Inject `ToastService` to show a reusable success, error or information message:

```ts
import { inject } from '@angular/core';
import { ToastService } from './core/services/toast.service';

private readonly toast = inject(ToastService);

this.toast.success('Your idea was submitted.');
this.toast.error('We could not submit your idea.');
this.toast.info('Your submission is being reviewed.');
```

The root app already includes the toast outlet. Toasts dismiss automatically after five seconds and can also be dismissed by the user.

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
