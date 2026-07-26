# Gate 7D Test Plan

Status: **REPOSITORY PASS — EXTERNAL DEVICE/PROVIDER VALIDATION DEFERRED BY OWNER**.

## Author verification — 2026-07-26

- focused Gate 7D Unit: `98/98` (`89` Mobile/Gates 7A–7D plus `9`
  server/provider), zero skipped/todo/cancelled;
- complete Unit: `558/558` (`349` plus `209`), zero
  skipped/todo/cancelled;
- fresh disposable PostgreSQL at Migration `51/51`: `433/433`, zero
  skipped/todo/cancelled;
- production HTTP/RSC/API: `133/133` (`6` plus `122` plus `5`), zero
  skipped/todo/cancelled;
- Prisma format/validate/generate, root and Mobile TypeScript, complete ESLint,
  and `git diff --check`: PASS;
- Expo dependency check and Expo Doctor: PASS (`20/20`);
- iOS Hermes, Android Hermes, and Web exports: PASS (`32`, `32`, and `34`
  files respectively);
- Next.js production build: PASS with the canonical Turbopack build and a
  dedicated production type graph that excludes native-only Mobile sources;
- production dependency audit and Mobile dependency audit: zero
  vulnerabilities;
- changed-file secret scan and Gate 7D privacy-log scan: zero findings.
- independent review: `PASS_CODE_REVIEW`, zero P0/P1/P2, zero unresolved
  threads;
- exact-head GitHub Actions and both Vercel projects: PASS.

These results prove repository behavior only. They do not satisfy the physical
device/provider matrix below.

## Deterministic repository coverage

### Mobile

- undetermined, denied, granted, and provisional permission;
- server revocation after permission denial, including partial failure truth;
- registration, stable-key bounded retry/backoff, token refresh, fail-closed
  logout, and account/operation generation fencing;
- stale owner completion cannot replace current state;
- exact typed notification navigation and malicious data rejection;
- regressions for Gates 7A, 7B, and 7C.

### PostgreSQL

- fresh application of all 51 migrations;
- UUID-idempotent registration/replay and conflict;
- token rotation and monotonic token version;
- delayed registration rejected after a newer revoke, including when no
  installation row existed at revoke time;
- installation-secret ownership and same-device account switch;
- bounded logout/revocation and token-material deletion tombstones;
- multiple active devices and no raw token in endpoint resolution;
- fanout exactly once per target and accepted-target replay;
- send-time token generation fencing for direct invalid-token results and
  delayed invalid-token receipts after token rotation;
- targetless Customer messages-hub routing without weakening UUID requirements
  for entity destinations;
- fail-closed recipient revalidation if the Person is deactivated after
  communications preparation but before provider execution;
- concurrent receipt replay, changed replay rejection, unknown receipt replay,
  delivered state, and invalid-token disabling.

### Production HTTP

- authentication and active-Person enforcement;
- exact registration replay without token disclosure;
- account switch and stale-owner rejection;
- signed, expired, malformed, replayed, and unknown receipt behavior;
- bounded bodies, no-store responses, and provider fail-closed truth.

## Required commands

```text
npm run test:stage7d:unit
npm run test:stage7d:postgres
npm run test:stage7d:http
npm run test:stage7a
npm run test:stage7b
npm run test:stage7c
npm run test:unit
npm run test:integration
npm run test:http
npx tsc --noEmit
npm run typecheck --prefix apps/mobile
npm run lint
git diff --check
npx prisma format
npx prisma validate
npx prisma generate
npx expo install --check
npx expo-doctor
npx expo export --platform ios --clear
npx expo export --platform android --clear
npx expo export --platform web --clear
npm run build
npm audit --omit=dev
npm audit --prefix apps/mobile
```

No skipped, todo, cancelled, or hidden failing test counts are accepted.
PostgreSQL must use a fresh disposable database. HTTP/RSC/API tests must target
the newly built production server, not route-handler mocks.

## Physical/provider closure

Repository tests cannot prove native permission prompts, token issuance,
signed entitlements, push delivery, notification-open behavior, HEIC,
process-death, poor network, or hosted-browser return on real hardware. Run
the matrix in `gate7d-device-evidence.md` using signed Development/Preview
artifacts and authorized sandbox providers. No store submit or production
update is part of this plan.

The owner deferred this matrix after approving the reviewed code-only merge.
That decision records the repository result without changing any `NOT_RUN` or
`BLOCKED` external row and without declaring Stage 7 `CLOSED` or `PASS`.
