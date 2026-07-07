# REZNO Mobile Real-Device Visual Smoke Test

## Purpose and scope

This checklist validates visual quality after the REZNO mobile visual redesign sequence. It is visual QA only.

It does not validate backend correctness, payments, production authentication, database integrity, real business operations, or live booking mutations unless those flows are already available in a safe test environment. Running this checklist must not change app behavior.

For the repeatable EAS development build path that can unblock physical-device testing, see [eas-development-build-path.md](./eas-development-build-path.md).

For the final Phase 27E visual checkpoint and release-readiness status, see [mobile-phase-27e-final-visual-qa-readiness.md](./mobile-phase-27e-final-visual-qa-readiness.md).

## Current readiness status

- Static/local validation: READY FOR STATIC/LOCAL VALIDATION.
- Simulator/emulator visual smoke: ALLOWED AS PRELIMINARY REVIEW ONLY.
- Physical-device visual smoke: BLOCKED FOR REAL-DEVICE PASS UNTIL A VALID DEVICE RUN PATH IS AVAILABLE.
- EAS/TestFlight build smoke: CONFIG IS PRESENT, BUT A REAL BUILD/INSTALL WAS NOT RUN IN THIS PHASE.

Do not mark physical-device smoke as passed unless it was executed on a physical device or a valid installed device build.

Known blocker: real-device runtime smoke remains blocked until a compatible Expo Go/TestFlight path or EAS development build path is available.

## Repo evidence checked

- Mobile app path: `apps/mobile`.
- Framework: React Native + Expo.
- Expo SDK: `~57.0.2`.
- `expo-dev-client`: present.
- App scheme: `rezno`.
- iOS bundle identifier: `com.rezno.mobile`.
- Android package: `com.rezno.mobile`.
- EAS config: `apps/mobile/eas.json` exists with `development`, `preview`, and `production` profiles.
- Mobile API base URL priority is implemented through:
  1. `EXPO_PUBLIC_REZNO_API_BASE_URL`
  2. `app.json` `extra.apiBaseUrl`
  3. localhost fallback

## Environment prerequisites

The tester needs:

- Repository checkout on latest `main`.
- Node.js and npm installed.
- Dependencies already installed.
- Expo tooling available through `npx`.
- Valid mobile environment variables if required by existing app behavior.
- Expo Go only if it supports the project SDK/runtime.
- Otherwise, access to an EAS development build, TestFlight build, or internal build.
- At least one iOS or Android device.
- Ability to switch the device between dark and light appearance.
- Ability to test Arabic, English, and Kurdish through existing in-app locale controls.

Do not install new dependencies or require a new external service as part of this checklist.

## Pre-flight commands

Windows:

```powershell
git fetch origin
git checkout main
git reset --hard origin/main
git status --short --branch

cd apps/mobile
npm.cmd run typecheck
npx.cmd expo config --type public
cd ../..

npm.cmd run lint
npx.cmd tsc --noEmit
git diff --check
git diff --cached --check
git status --short --branch
```

Non-Windows equivalents:

```bash
git fetch origin
git checkout main
git reset --hard origin/main
git status --short --branch

cd apps/mobile
npm run typecheck
npx expo config --type public
cd ../..

npm run lint
npx tsc --noEmit
git diff --check
git diff --cached --check
git status --short --branch
```

If TypeScript modifies `tsconfig.tsbuildinfo`, restore only that generated artifact before reporting final status.

## Device run path decision tree

### A. Expo Go path

Use this path only if Expo Go supports the project SDK/runtime.

1. Start the mobile app with the existing Expo script.
2. Set the staging API URL only if needed by the test plan.
3. Open the app on the device through Expo Go.
4. Proceed to the visual smoke checklist.

Example Windows command:

```powershell
cd apps/mobile
$env:EXPO_PUBLIC_REZNO_API_BASE_URL = "https://rezno-staging.vercel.app"
npx.cmd expo start --lan --clear
```

If Expo Go is not SDK-compatible, mark this path blocked and use the EAS development build path.

### B. EAS development build path

Use this path if Expo Go is not compatible.

Repo readiness evidence:

- `expo-dev-client` is installed.
- `apps/mobile/eas.json` exists.
- The development profile sets `developmentClient: true` and `distribution: internal`.
- iOS and Android identifiers are configured.

Do not run EAS build unless separately approved. If a development build is already installed on the device, open the project with the configured API URL and proceed to the checklist.

### C. TestFlight/internal distribution path

Use this path only if an iOS build artifact already exists and is available to the tester through TestFlight or internal distribution.

If no build artifact is available, mark this path not ready.

### D. Simulator/emulator fallback

Simulator or emulator review is allowed for preliminary visual review. It must not be counted as physical-device smoke.

## End-to-end visual smoke checklist

### Home / Marketplace

- App launches cleanly.
- Hero/header is visually stable.
- Search surface is readable.
- Category chips wrap correctly.
- Business cards are readable.
- Empty/loading/error states are visually coherent.
- No clipping in Arabic, English, or Kurdish.
- Dark/light theme surfaces remain premium.

### Business Detail

- Business hero is stable.
- Metadata rows are readable.
- Service cards are readable.
- Price, duration, and status are readable.
- CTA is visible and not hidden.
- RTL/LTR alignment is stable.

### Booking Flow

- Service selection is clear.
- Staff/date/time selection is clear.
- Selected states are clear.
- Disabled/unavailable states are understandable.
- Summary/review surfaces are readable.
- Final CTA is visible above bottom navigation.
- No behavior changes are expected.

### Confirmation / Receipt / Timeline

- Confirmation success state feels reassuring.
- Receipt is readable.
- Timeline/status rows are readable.
- Actions are clear.
- No critical text is hidden.

### My Bookings

- Booking cards are readable.
- Statuses are clear.
- Metadata spacing is stable.
- Empty state is clear.
- No card overflow appears.

### Account / Preferences / Support

- Account hero is readable.
- Action buttons wrap safely.
- Preference rows are readable.
- Support/help/trust panels are clear.
- Disabled/unavailable actions are visually understandable.

### Notifications / Messages Preview

- Cards are readable.
- Unread/status chips are readable.
- Placeholder/demo states are clear.
- No layout clipping appears.

### Owner Preview

- Dashboard cards are readable.
- Metrics/status rows are stable.
- Quick actions are clear.
- Demo/preview behavior is unchanged.

### Bottom Navigation

- Tab bar does not cover CTAs.
- Labels are readable.
- Active/inactive states are clear.
- Safe spacing is adequate.

## Theme checklist

- Test dark theme.
- Test light theme.
- Gold accents remain controlled.
- Text contrast is acceptable.
- Surfaces are not muddy in dark mode.
- Surfaces are not overly bright in light mode.
- Shadows and borders are not noisy.

## Locale and direction checklist

- Arabic RTL.
- English LTR.
- Kurdish using existing locale direction behavior.
- Long labels wrap safely.
- Row direction is stable.
- Cards do not clip text.
- CTAs remain readable.
- Bottom navigation labels remain readable.

## State checklist

- Loading states.
- Empty states.
- Error/retry states.
- Unavailable states.
- Disabled buttons.
- Selected states.
- Warning/success/status chips.
- Placeholder/demo preview states.

## Pass/fail criteria

### PASS

- No blocking visual clipping.
- No hidden primary CTA.
- No unreadable text.
- No severe RTL/LTR breakage.
- No app launch blocker.
- No wrong-screen navigation.
- No crash during the basic flow.

### SOFT ISSUE

- Small spacing imbalance.
- Minor card weight inconsistency.
- Non-blocking line wrap.
- Cosmetic inconsistency.

### FAIL

- Crash.
- App cannot launch.
- Primary CTA hidden or unusable.
- Major screen overflow.
- Unreadable text.
- Severe RTL/LTR layout break.
- User cannot complete the visible booking path due to a UI issue.
- Confirmation or booking summary is unusable.

## QA evidence template

- Date:
- Tester:
- Device model:
- OS version:
- App build path: Expo Go / EAS dev build / TestFlight / emulator
- Commit SHA tested:
- Theme tested: dark / light
- Locales tested: Arabic / English / Kurdish
- Screens tested:
- Pass/fail result:
- Issues found:
- Screenshots/videos captured:
- Follow-up PR required: yes / no

## Known blockers

- Real-device runtime smoke remains blocked until a compatible Expo Go/TestFlight/EAS development build path is available.
- Expo SDK 57 is configured. Expo Go must support the project SDK/runtime before the Expo Go path can be counted as a valid physical-device run.
- EAS development build configuration exists, but no EAS build was run in this phase.
- TestFlight/internal build smoke requires an existing build artifact; none was verified in this phase.

## Recommended next action

Because the repo has EAS development build configuration but no verified installed device build in this phase, the recommended next sprint is:

**Mobile QA Phase 25 — Establish EAS Development Build Path**

After a valid physical-device path exists, run:

**Mobile QA Phase 25 — Execute Real-Device Visual Smoke Test**
