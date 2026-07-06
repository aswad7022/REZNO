# REZNO Mobile EAS Development Build Execution — Phase 26

## Purpose

This document records the first controlled attempt to execute the EAS development build path.

It supports the Phase 25 EAS path runbook in [eas-development-build-path.md](./eas-development-build-path.md). It does not itself prove real-device visual smoke passed. It does not validate backend correctness, payment correctness, production authentication, or database integrity.

## Current result

**BLOCKED / EAS LOGIN UNAVAILABLE**

The Android EAS development build was not executed because local EAS login was unavailable.

## Repo evidence reconfirmed

- Mobile app path: `apps/mobile`.
- Expo SDK: `~57.0.2`.
- `expo-dev-client`: present in `apps/mobile/package.json`.
- EAS config path: `apps/mobile/eas.json`.
- Development profile: present.
- Development profile `developmentClient`: `true`.
- Development profile distribution: `internal`.
- Android package: `com.rezno.mobile`.
- iOS bundle identifier: `com.rezno.mobile`.
- App scheme: `rezno`.
- API base URL env path: `EXPO_PUBLIC_REZNO_API_BASE_URL`.

## Commands run

### Repo sync

```powershell
git fetch origin
git checkout main
git reset --hard origin/main
git status --short --branch
git checkout -b mobile-qa-phase-26-execute-eas-development-build
```

### Pre-flight validation

```powershell
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

`tsconfig.tsbuildinfo` was modified by TypeScript and restored as a generated artifact.

### EAS access checks

```powershell
cd apps/mobile
npx.cmd eas-cli whoami
```

Result: timed out without usable output.

```powershell
cd apps/mobile
npx.cmd --no-install eas-cli whoami
```

Result: `Not logged in`.

The following access checks were not run because EAS login was unavailable:

```powershell
npx.cmd eas-cli project:info
npx.cmd eas-cli build:list --limit 5
```

### EAS build command

Not executed.

The approved command would have been:

```powershell
cd apps/mobile
$env:EXPO_PUBLIC_REZNO_API_BASE_URL = "https://rezno-staging.vercel.app"
npx.cmd eas-cli build --platform android --profile development --non-interactive
```

## Environment/API base URL

- Intended API base URL: `https://rezno-staging.vercel.app`.
- Intended source: `EXPO_PUBLIC_REZNO_API_BASE_URL`.
- No `.env` file was created or committed.
- No secrets, tokens, passwords, or private URLs were printed.

## Build result evidence

- Date: 2026-07-06.
- Runner: Codex local shell.
- Commit SHA: not applicable to an EAS build because no build was executed.
- Platform: Android.
- Build profile: development.
- EAS account/org: not verified because EAS login unavailable.
- EAS project: not verified because EAS login unavailable.
- Command run: no EAS build command was run.
- Build URL: none.
- Build ID: none.
- Build status: BLOCKED / EAS LOGIN UNAVAILABLE.
- Artifact/install URL: none.
- Sanitized error summary: EAS CLI reported `Not logged in` for the non-installing login check.

## Install/open result

- Development build installed on physical device: no.
- App opened on physical device: no.
- Dev server required: unknown.
- Real-device visual smoke executed: no.

Real-device visual smoke remains NOT RUN / BLOCKED until a development build is created, installed, and opened on a physical device.

## Pass/fail criteria

### PASS

- EAS access verified.
- Android development build successfully created.
- Build artifact/install path available.
- No runtime/config/package changes.
- Next tester can install/open on device.

### PARTIAL PASS

- Build queued and build URL captured, but completion not verified.

### BLOCKED

- EAS login unavailable.
- EAS project access unavailable.
- Credentials unavailable.
- Approved API URL unavailable.
- EAS profile missing/invalid.
- No build URL produced.

### FAIL

- Build attempted and failed.
- Repo config contradicts documented path.
- Forbidden files changed.
- Package/dependency/config changes attempted.
- Deployment/publish/update triggered accidentally.

## Handoff

Recommended next action:

**Mobile QA Phase 27 — Resolve EAS Access or Credential Blocker**

After EAS login and project access are available, rerun the Phase 26 Android development build command from this document.
