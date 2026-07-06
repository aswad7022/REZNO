# REZNO Mobile EAS Development Build Path

## Purpose

This document establishes the repeatable EAS development build path for REZNO mobile physical-device QA.

It supports the real-device visual smoke checklist in [real-device-visual-smoke-test.md](./real-device-visual-smoke-test.md). It does not itself prove that real-device smoke passed. It does not trigger or require production deployment. It does not validate backend correctness, payment correctness, production authentication, or database integrity.

## Current status

- EAS development build path: CONFIG PRESENT / BUILD NOT EXECUTED.
- Real-device visual smoke: NOT RUN / BLOCKED until a development build or compatible device path is installed and opened on a physical device.
- Expo Go path: valid only if Expo Go supports the project SDK/runtime; otherwise use EAS development build.
- TestFlight/internal build path: valid only if an artifact is available.
- Simulator/emulator: allowed for preliminary review only, not physical-device smoke.

## Repo evidence

Repo inspection found:

- Mobile app path: `apps/mobile`.
- Expo SDK version: `~57.0.2`.
- `expo-dev-client`: present in `apps/mobile/package.json`.
- EAS config path: `apps/mobile/eas.json`.
- Development profile: present.
- Development profile `developmentClient`: `true`.
- Development profile distribution: `internal`.
- Preview profile: present with `distribution: internal`.
- Production profile: present.
- App scheme: `rezno`.
- iOS bundle identifier: `com.rezno.mobile`.
- Android package: `com.rezno.mobile`.
- API base URL config: `apps/mobile/src/config/api.ts`.
- API base URL priority:
  1. `EXPO_PUBLIC_REZNO_API_BASE_URL`
  2. `app.json` `extra.apiBaseUrl`
  3. localhost fallback

No EAS account, project, credential, build artifact, TestFlight artifact, or installed physical-device build was verified in this phase.

## Prerequisites

The build runner needs:

- GitHub repository access.
- Latest `main` checkout.
- Node.js and npm installed.
- Dependencies installed.
- Expo/EAS access through `npx`.
- EAS account access.
- EAS project access for the correct Expo account or organization.
- Local EAS login.
- iOS or Android physical device.
- Device able to install an internal/development build.
- Approved staging/safe API URL if the test should use staging data.
- Apple Developer/TestFlight requirements for iOS, if using iOS.
- Android install, APK/AAB, or internal distribution requirements, if using Android.
- Ability to test Arabic, English, Kurdish, dark theme, and light theme after install.

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

If TypeScript modifies `tsconfig.tsbuildinfo`, restore only that generated artifact before final status.

## EAS login and project access verification

These commands are for the tester/build runner. They were not executed as passed results in this documentation phase.

```powershell
cd apps/mobile
npx.cmd eas-cli whoami
npx.cmd eas-cli project:info
npx.cmd eas-cli build:list --limit 5
```

Non-Windows equivalents:

```bash
cd apps/mobile
npx eas-cli whoami
npx eas-cli project:info
npx eas-cli build:list --limit 5
```

These commands may contact EAS and require login. Do not print tokens or secrets.

## Development build command path

Do not run these commands unless the human owner explicitly approves the build. They may require EAS login, Apple/Google credentials, build minutes, and remote EAS resources.

Android development build:

```powershell
cd apps/mobile
npx.cmd eas-cli build --platform android --profile development
```

iOS development build:

```powershell
cd apps/mobile
npx.cmd eas-cli build --platform ios --profile development
```

All platforms:

```powershell
cd apps/mobile
npx.cmd eas-cli build --platform all --profile development
```

Non-Windows equivalents:

```bash
cd apps/mobile
npx eas-cli build --platform android --profile development
npx eas-cli build --platform ios --profile development
npx eas-cli build --platform all --profile development
```

This PR does not execute any build command.

## Environment/API base URL path

Repo evidence confirms `EXPO_PUBLIC_REZNO_API_BASE_URL` is supported by `apps/mobile/src/config/api.ts`.

Use the approved staging API URL for QA. If the staging URL changes, replace the value below with the approved URL.

Windows PowerShell Android example:

```powershell
cd apps/mobile
$env:EXPO_PUBLIC_REZNO_API_BASE_URL = "https://rezno-staging.vercel.app"
npx.cmd eas-cli build --platform android --profile development
```

Non-Windows Android example:

```bash
cd apps/mobile
EXPO_PUBLIC_REZNO_API_BASE_URL=https://rezno-staging.vercel.app npx eas-cli build --platform android --profile development
```

Do not hard-code secrets. Do not commit `.env` files. Do not add new environment files.

## Installing and opening the development build

High-level flow:

1. Wait for the EAS build to finish.
2. Install the development build on a physical device through the EAS/internal distribution link.
3. Open the installed development build.
4. If the dev-client workflow requires Metro, start the Expo dev server.
5. Confirm the physical device can reach the development server and approved API URL.
6. Proceed to the Phase 24 real-device visual smoke checklist.

Windows dev-client server command:

```powershell
cd apps/mobile
npx.cmd expo start --dev-client --lan --clear
```

Non-Windows equivalent:

```bash
cd apps/mobile
npx expo start --dev-client --lan --clear
```

## Android-specific notes

- Android development builds are usually the fastest first path if iOS credentials are not ready.
- Confirm install permissions on the Android device.
- Confirm Android package: `com.rezno.mobile`.
- Confirm device network reachability to the dev server if using dev-client with Metro.
- Confirm the API URL is the approved staging/safe URL.
- Common blockers: install blocked, network unreachable, QR/dev server unreachable, wrong API URL, EAS login unavailable, or Android build credentials unavailable.

## iOS-specific notes

- iOS may require Apple Developer access, registered device, provisioning profile, or TestFlight/internal distribution setup.
- Confirm bundle identifier: `com.rezno.mobile`.
- Confirm build artifact availability before counting this path as ready.
- Common blockers: credentials unavailable, device not registered, provisioning unavailable, TestFlight artifact missing, EAS login unavailable, or iOS build credentials unavailable.

## Device smoke handoff

After a development build is installed and the app opens on a physical device, execute:

[REZNO Mobile Real-Device Visual Smoke Test](./real-device-visual-smoke-test.md)

Do not count simulator/emulator review as physical-device smoke.

## Pass/fail criteria for build path

### PASS

- EAS account/project access confirmed.
- Development profile understood and usable.
- EAS development build command documented.
- Required env/API path documented.
- Install/open path documented.
- Next tester can execute without guessing.

### READY TO EXECUTE BUILD

- Config is present.
- Commands are documented.
- Credentials/account requirements are known.
- Build has not yet been run.

### BLOCKED

- EAS login unavailable.
- EAS project access unavailable.
- iOS credentials unavailable.
- Android build credentials unavailable.
- Missing required env/API base URL.
- Build profile missing or invalid.
- No physical device available.

### FAIL

- Repo config contradicts the documented path.
- App config is missing required identifiers.
- Development profile is absent.
- Package/dependency changes were attempted.
- Build was triggered without approval.
- Runtime code changed without cause.

## Evidence template

- Date:
- Runner:
- Commit SHA:
- Platform: Android / iOS / all
- EAS account/org:
- EAS project:
- Build profile:
- API base URL used:
- Command run:
- Build URL:
- Build status:
- Install method:
- Device model:
- OS version:
- App opened on device: yes / no
- Dev server required: yes / no
- Visual smoke checklist executed: yes / no
- Result:
- Issues:
- Follow-up PR required: yes / no

## Known blockers

- Real-device visual smoke remains NOT RUN / BLOCKED until a valid device build path is executed.
- EAS config exists, but no EAS development build has been executed in this phase.
- Expo Go path must not be counted as valid unless SDK/runtime compatibility is verified.
- TestFlight/internal distribution path must not be counted as valid unless an artifact exists and is installed.

## Recommended next action

Repo evidence shows the EAS development configuration appears sufficient and no build was run.

Recommended next action:

**Mobile QA Phase 26 — Execute EAS Development Build**
