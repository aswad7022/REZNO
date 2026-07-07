# Mobile Phase 28 — Android EAS Development Build / Real-Device Smoke Preparation

## Status

**PROJECT LINKED / ENV CONFIGURED / BUILD NOT YET RUN**

The Android EAS development build has not been executed yet. The owner completed EAS project linking and created the EAS development environment variable required for the staging API base URL.

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
- Development profile environment binding: `development`.
- Android package: `com.rezno.mobile`.
- iOS bundle identifier: `com.rezno.mobile`.
- Scheme: `rezno`.
- EAS project: `@alhakeem7/rezno-mobile`.
- EAS project ID: `ef209c9c-0d04-4731-a998-6241fef1b29d`.
- API base URL priority in `apps/mobile/src/config/api.ts`:
  1. `EXPO_PUBLIC_REZNO_API_BASE_URL`
  2. `app.json` `extra.apiBaseUrl`
  3. localhost fallback

Previous readiness blocker, resolved by owner:

- `npx.cmd eas-cli env:list development --format long` failed with: `EAS project not configured. Must configure EAS project by running 'eas init' before this command can be run in non-interactive mode.`
- Owner ran `npx.cmd eas-cli init`, creating and linking `@alhakeem7/rezno-mobile`.
- `apps/mobile/app.json` now records the EAS project link.

## Intended API base URL

Intended Android development build API base URL:

```text
https://rezno-staging.vercel.app
```

Environment verification:

- Owner created `EXPO_PUBLIC_REZNO_API_BASE_URL` in the EAS development environment with value `https://rezno-staging.vercel.app`.
- Owner verified `npx.cmd eas-cli env:list development` showed `EXPO_PUBLIC_REZNO_API_BASE_URL=https://rezno-staging.vercel.app`.
- `apps/mobile/eas.json` now binds the development build profile to the EAS `development` environment.

Result:

- The Android development build is prepared to use the EAS development environment, but has not been run in this phase.

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

Approved command for the next phase, not executed in Phase 28A:

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
- EAS config change was limited to binding the development profile to the EAS `development` environment.

## Recommended next action

Next build action:

1. Re-run Phase 28 Android development build using the approved Android development profile.
2. Capture build URL, build ID, status, and artifact/install URL if available.
3. Owner installs the Android development build and completes real-device smoke.

Decision recommendation:

**NEEDS QA GATE BEFORE RELEASE**

Reason:

- EAS login is available.
- EAS project is linked.
- EAS development environment binding is configured.
- Android EAS development build has not been run yet.
- Real-device smoke remains blocked until an Android development build artifact exists.
