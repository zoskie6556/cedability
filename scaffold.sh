#!/usr/bin/env bash
# CEDAbility - scaffold feature folders, components and lazy-loaded routes.
# Run ONCE, from the project root (the folder that contains angular.json):
#   bash scaffold.sh
set -euo pipefail

[ -f angular.json ] || { echo "Run this from the project root (angular.json not found)."; exit 1; }

APP=src/app
FEATURES=$APP/features

# Generates a standalone component with .ts, .html and .scss (no spec file).
# --type=component keeps the classic file names, e.g. login.component.ts
gen() {
  npx ng generate component "features/$1" --type=component --style=scss --skip-tests
}

echo "==> Creating core and shared folders"
for d in core/guards core/interceptors core/services shared/components shared/directives shared/pipes shared/models; do
  mkdir -p "$APP/$d"
  touch "$APP/$d/.gitkeep"
done

echo "==> Generating components"
# account
gen account/user/login
gen account/user/create-account
gen account/user/forgot-password
gen account/user/verify
gen account/profile
# submissions
gen submissions/idea
# the other features start with one placeholder page each
gen evaluation/review
gen tracking/status
gen chat/chat-room
gen admin/admin-dashboard
gen reporting/reports
gen accessibility/voice-settings

echo "==> Writing feature route files"

# Account has its own, richer route file
cat > "$FEATURES/account/account.routes.ts" <<'EOF'
import { Routes } from '@angular/router';

export const ACCOUNT_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'user/login' },
  {
    path: 'user',
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'login' },
      {
        path: 'login',
        title: 'Log in',
        loadComponent: () => import('./user/login/login.component').then(m => m.LoginComponent),
      },
      {
        path: 'create-account',
        title: 'Create account',
        loadComponent: () =>
          import('./user/create-account/create-account.component').then(m => m.CreateAccountComponent),
      },
      {
        path: 'forgot-password',
        title: 'Forgot password',
        loadComponent: () =>
          import('./user/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent),
      },
      {
        path: 'verify',
        title: 'Verify account',
        loadComponent: () => import('./user/verify/verify.component').then(m => m.VerifyComponent),
      },
      {
        // URL: /account/user/profile  (component lives in account/profile/)
        path: 'profile',
        title: 'My profile',
        loadComponent: () => import('./profile/profile.component').then(m => m.ProfileComponent),
      },
    ],
  },
];
EOF

# Simple features: one route file each, with one placeholder page
# usage: simple_routes <feature> <CONST_NAME> <page-folder> <title> <ClassName>
simple_routes() {
  cat > "$FEATURES/$1/$1.routes.ts" <<EOF
import { Routes } from '@angular/router';

export const $2: Routes = [
  { path: '', pathMatch: 'full', redirectTo: '$3' },
  {
    path: '$3',
    title: '$4',
    loadComponent: () => import('./$3/$3.component').then(m => m.$5),
  },
];
EOF
}

simple_routes submissions   SUBMISSIONS_ROUTES   idea             "Submit an idea"      IdeaComponent
simple_routes evaluation    EVALUATION_ROUTES    review           "Evaluation"          ReviewComponent
simple_routes tracking      TRACKING_ROUTES      status           "Submission status"   StatusComponent
simple_routes chat          CHAT_ROUTES          chat-room        "Chat"                ChatRoomComponent
simple_routes admin         ADMIN_ROUTES         admin-dashboard  "Admin"               AdminDashboardComponent
simple_routes reporting     REPORTING_ROUTES     reports          "Reports"             ReportsComponent
simple_routes accessibility ACCESSIBILITY_ROUTES voice-settings   "Accessibility"       VoiceSettingsComponent

echo ""
echo "Done. Next steps:"
echo "  1. Copy app.routes.ts over src/app/app.routes.ts"
echo "  2. Make sure app.html contains <router-outlet />"
echo "  3. Run: npx ng build   (should compile with no errors)"
echo "  4. Run: npx ng serve   and open /account/user/login"
echo "  5. Commit and push to main BEFORE teammates start branching"
