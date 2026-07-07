# Mobile Phase 28 — Android EAS Development Build / Real-Device Smoke Preparation

## Status

**OWNER PROMPT REQUIRED**

The Android EAS development build was not executed because the local EAS CLI reported that the EAS project is not configured for this repository. The next step requires an owner decision through `eas init` or equivalent project linking.

## EAS login evidence

- `npx.cmd eas-cli whoami` returned `alhakeem7`.
- The expected account email was shown locally.
- No tokens or secrets were printed.

## Project readiness evidence

Repository configuration inspected:

- Mobile app path: `apps/mobile`.
- Expo SDK: `~57.0.2`.
- `expo-dev-client`: present.
- `apps/mobile/eas.json`: present.
- Development profile: present.
- Development profile `developmentClient`: `true`.
- Development profile distribution: `internal`.
- Android package: `com.rezno.mobile`.
- iOS bundle identifier: `com.rezno.mobile`.
- Scheme: `rezno`.
- API base URL priority in `apps/mobile/src/config/api.ts`:
  1. `EXPO_PUBLIC_REZNO_API_BASE_URL`
  2. `app.json` `extra.apiBaseUrl`
  3. localhost fallback

Readiness blocker:

- `npx.cmd eas-cli env:list development --format long` failed with: `EAS project not configured. Must configure EAS project by running 'eas init' before this command can be run in non-interactive mode.`
- Because the EAS project is not configured, the development EAS environment could not be verified.

## Intended API base URL

Intended Android development build API base URL:

```text
https://rezno-staging.vercel.app
```

Local check:

- Running `npx.cmd expo config --type public` with `EXPO_PUBLIC_REZNO_API_BASE_URL` set still shows `app.json` `extra.apiBaseUrl` as `http://localhost:3000`.
- The app code can use `EXPO_PUBLIC_REZNO_API_BASE_URL`, but the EAS remote build environment could not be verified because the EAS project is not configured.

Result:

- The build was not started to avoid creating a development build that might fall back to localhost or prompt for project-linking decisions.

## Validation results

Pre-build validation passed:

- `cd apps/mobile && npm.cmd run typecheck` — passed.
- `cd apps/mobile && npx.cmd expo config --type public` — passed.
- `npm.cmd run lint` — passed.
- `npx.cmd tsc --noEmit` — passed.
- `git diff --check` — passed.
- `git diff --cached --check` — passed.

`tsconfig.tsbuildinfo` was modified by TypeScript and restored as a generated artifact.

## Build command

Approved command, not executed due to owner prompt blocker:

```powershell
$env:EXPO_PUBLIC_REZNO_API_BASE_URL="https://rezno-staging.vercel.app"
npx.cmd eas-cli build --platform android --profile development --message "Mobile Phase 28 Android development build for real-device smoke"
```

## Build evidence

- Build URL: not available.
- Build ID: not available.
- Artifact/install URL: not available.
- Status: not started.

## Real-device smoke

- Real-device smoke: **NOT RUN / BLOCKED**.
- Owner install readiness: not ready because no Android development build artifact exists yet.

After the owner configures the EAS project and confirms the staging API environment is available to the development build, the owner-side test path should be:

1. Run the approved Android development build.
2. Install the Android development build from the EAS artifact/install link.
3. Start dev-client Metro:

   ```powershell
   cd apps/mobile
   $env:EXPO_PUBLIC_REZNO_API_BASE_URL="https://rezno-staging.vercel.app"
   npx.cmd expo start --dev-client --lan --clear
   ```

4. Open the installed REZNO development build.
5. Connect to the local dev server if prompted.
6. Smoke test:
   - App opens without red screen.
   - Dark theme loads.
   - Home appears.
   - Category icons appear.
   - Arabic fonts appear.
   - Bottom nav works.
   - Salon Detail opens.
   - Visual booking flow opens: Staff -> Date/Time -> Payment -> Confirmation.
   - Confirmation -> View Booking works.
   - My Bookings opens.
   - Booking Detail opens.
   - No CTA hidden behind bottom nav.
   - Staging API path does not break app shell.
7. Record screenshots and pass/fail notes.

Do not mark real-device smoke complete until the owner confirms installation and test results.

## Safety confirmations

- No iOS build was run.
- No production build was run.
- No preview build was run.
- No Expo publish/update was run.
- No EAS Update was run.
- No EAS Submit was run.
- No TestFlight upload was run.
- No runtime code changed.
- No mobile UI changed.
- No API, auth, database, schema, Prisma, migration, booking, or payment behavior changed.
- No package files changed.
- No EAS config changed.

## Recommended next action

Owner action required:

1. Configure/link the EAS project for `apps/mobile` using the correct Expo account/project ownership.
2. Configure `EXPO_PUBLIC_REZNO_API_BASE_URL` for the EAS development environment with the staging URL.
3. Re-run Phase 28 Android development build after project/env verification.

Decision recommendation:

**NEEDS QA GATE BEFORE RELEASE**

Reason:

- EAS login is available.
- Static validation passed.
- Android EAS development build did not start because owner project-linking configuration is required.
- Real-device smoke remains blocked until an Android development build artifact exists.
