# CEDAbility - Team Notes (read before you code)

The folders, components (`.ts`, `.html`, `.scss`) and routes are **already generated**.
Your job is to write the code inside your own feature, not to create the structure.

## Structure

```
src/app/
├── core/          # guards, interceptors, app-wide services (auth, audit)
├── shared/        # reusable UI, directives, pipes, models
└── features/
    ├── account/        # user/ (login, create-account, forgot-password, verify) + profile/
    ├── submissions/    # idea/
    ├── evaluation/     # review/
    ├── tracking/       # status/
    ├── chat/           # chat-room/
    ├── admin/          # admin-dashboard/
    ├── reporting/      # reports/
    └── accessibility/  # voice-settings/   (stretch goal)
```

Each feature has its own routes file: `features/<name>/<name>.routes.ts`.
`app.routes.ts` only lazy-loads features.

## Who owns what

| Feature | Owner |
|---|---|
| account + core guards/audit | _name_ |
| submissions + admin | _name_ |
| evaluation + tracking | _name_ |
| chat + reporting + UI theme | _name_ |

## Rules (these prevent merge conflicts)

1. **Only edit files inside your own feature folder.**
2. **Do not edit `app.routes.ts`.** If you need a new top-level route, ask the team.
3. Need a new page in your feature? Run this from the project root, then add one route entry to *your* feature's routes file:
   ```bash
   npx ng generate component features/<feature>/<page-name> --type=component --style=scss --skip-tests
   ```
4. Need something in `core/` or `shared/`? Tell the team first, or open a small PR just for that so everyone gets it quickly.
5. Don't reformat files you didn't change. Use the shared Prettier config.
6. Colours, fonts and the app name are **design tokens** (CSS variables), never hardcoded. CEDA will give us their branding.

## Git workflow

```bash
git checkout main && git pull
git checkout -b feature/<your-feature>-<short-task>     # e.g. feature/account-login
# ...work, commit small and often...
git pull origin main --rebase                           # do this daily
npx ng build                                            # must pass before a PR
git push -u origin feature/<your-feature>-<short-task>
```

Open a pull request into `main`. Another team member reviews it. Never push directly to `main`.

## Definition of done for a page

- Works with the Firebase **emulator**, not the shared live project
- Has loading and error states
- Works on mobile width and in Chrome, Edge and Firefox
- No secrets or API keys committed
