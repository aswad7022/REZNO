# First Phone Test Readiness

This checklist prepares REZNO for the first real-phone smoke test without changing application code, database schema, migrations, authentication, API logic, business logic, production deployment, EAS, or Flutter scope.

## Scope

Allowed:

- Document the minimum readiness gate before opening the app on a physical phone.
- Keep the checklist limited to local/staging verification and operator handoff.
- Record evidence requirements for the first phone test.

Not allowed in this sprint:

- EAS build or app-store workflow.
- Production deployment.
- Prisma schema changes.
- Database migrations.
- Auth, permissions, API, or business logic changes.
- React Native or Expo application logic changes.
- Flutter work.
- WebView-only app decisions.

## Pre-test repository gate

Before testing on a phone, confirm:

- The working tree is clean.
- The current branch and target commit are recorded.
- The expected test target is identified: local web, staging web, or Expo dev server.
- No secrets are printed in logs, screenshots, GitHub comments, or chat.
- Any environment variable issue is handled only through the provider UI or a secure local terminal.

## Local web readiness

Run only when local web testing is part of the phone test:

- Install dependencies with the approved setup flow.
- Start the Next.js dev server.
- Confirm the local URL opens on the laptop.
- Confirm the phone can reach the laptop URL over the same network if required.
- Capture the tested URL, device model, browser, and result.

Expected evidence:

- App opens without a browser-level connection error.
- No red runtime error screen.
- Core route used for the test is recorded.
- Any failure includes the exact visible error text.

## Expo readiness

Run only when the React Native + Expo app is the test target:

- Confirm the mobile app is React Native + Expo.
- Confirm no EAS build is required for this readiness check.
- Start the Expo dev server only after dependencies are already installed.
- Confirm the QR code or dev URL is available.
- Confirm the physical phone can reach the Expo dev server on the same network.

Expected evidence:

- Expo starts without dependency or module-resolution errors.
- The app opens on the physical phone or fails with a captured error.
- No WebView-only shortcut is used as a substitute for the real app.
- Any SecureStore, Better Auth Expo, network, or environment error is recorded exactly.

## Staging smoke readiness

Run only when staging web is part of the phone test:

- Confirm the staging deployment URL.
- Confirm the deployment is for the expected branch or commit.
- Open the staging URL on the phone.
- Record the tested route and device/browser.

Expected evidence:

- Staging opens without 404 or deployment-level error.
- No secret value is visible.
- If the route is protected, the observed auth state is recorded without changing auth logic.

## Minimum first-phone smoke flow

Use the smallest safe flow that proves the phone can run the target:

1. Open the app target on the physical phone.
2. Confirm the first screen renders.
3. Navigate to the Marketplace or customer-facing entry route when available.
4. Record the state shown: loading, real data, empty state, or safe error with retry.
5. Record any red screen, console-visible runtime error, or network/auth error.
6. Stop before making irreversible data, auth, payment, production, or deployment changes.

## Pass criteria

The first phone readiness gate passes when:

- The selected target opens on a physical phone.
- No red screen or fatal runtime error blocks startup.
- The tested route and visible state are recorded.
- Any safe error state is captured with exact wording.
- No restricted scope was touched.

## Fail criteria

The gate fails when:

- The phone cannot reach the selected target.
- The app shows a red runtime screen.
- A dependency, module-resolution, network, SecureStore, Better Auth Expo, auth, or permission error blocks startup.
- Testing requires schema, migration, auth, API, business logic, production deployment, EAS, or package changes outside the approved scope.
- Evidence is missing or ambiguous.

## CTO decision guide

Use one decision only:

- `APPROVE`: checklist-only readiness is complete and evidence is clear.
- `APPROVE AFTER SMALL FIX`: only documentation wording or missing evidence needs a small correction.
- `NEEDS QA GATE`: a real device, environment, auth, permission, database, or deployment risk appears.
- `DO NOT MERGE`: scope expands beyond checklist-only readiness or restricted changes are introduced.

## First phone test report template

```text
Target:
Branch/commit:
Device:
Network:
URL or Expo target:

App opened: yes/no
No red screen: yes/no
Route tested:
Visible state: loading / real data / empty / safe error with retry
Errors observed:
Screenshots or notes:

Restricted scope touched: yes/no
Decision: APPROVE / APPROVE AFTER SMALL FIX / NEEDS QA GATE / DO NOT MERGE
```
