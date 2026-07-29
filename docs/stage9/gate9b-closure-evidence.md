# Gate 9B Closure Evidence

Status: `AUTHOR IMPLEMENTATION — NOT CLOSED`

This file records only evidence that actually ran.

## Implemented evidence

- Source of truth: `features/stage9/gate9b.ts`
- Unit contracts:
  `tests/stage9/unit/gate9b-staging-runtime-activation.test.ts`
- PostgreSQL disposable contracts:
  `tests/stage9/integration/gate9b-staging-runtime-activation-e2e.test.ts`
- Safe scripts:
  - `npm run stage9b:preflight`
  - `npm run stage9b:database-evidence`
  - `npm run stage9b:runtime-evidence`

## Current external-input status

Local author preflight could not prove authenticated staging database identity,
provider-verified restore point, runtime URL, deployment SHA, or Admin
authority. No real staging database write, migration, fixture, runtime
initialization, runtime enablement, schedule enablement, or scheduled OIDC
runtime cycle was executed from this environment.

Accepted status until those inputs are supplied:

`EXTERNAL_INPUT_REQUIRED`

Fail-closed preflight and activation scripts now share
`assertGate9BActivationPreconditions`. The runtime activation process re-runs
the guard inside the same process before `initializePlatformRuntime`, schedule
bootstrap, manual scheduler/worker cycles, runtime enablement, or schedule
enablement. A restore point identifier alone is recorded as
`UNVERIFIED_RESTORE_POINT` and cannot authorize activation.

The guard also requires a server-verified Gate 9B Admin context before `READY`.
The three Admin IDs are treated only as lookup keys: missing values produce
`ADMIN_CONTEXT_REQUIRED`, malformed or non-matching User/Person/AdminAccess
tuples fail closed, and the required platform operations and platform jobs
permissions must be present before any mutation path can run.

Deployment SHA evidence is no longer self-attested. The activation guard
requires fresh trusted verification tying together the local Git HEAD, GitHub
branch head, Vercel `rezno-staging` deployment source SHA, and the authorized
activation SHA. Equal operator-provided environment values alone produce
`DEPLOYMENT_SHA_UNVERIFIED` and cannot authorize activation.

## Author verification actually completed

The author worktree executed the following checks against local disposable
resources only:

- Gate 9B unit contracts: `17/17`, `0` failed, `0` skipped, `0` todo.
- Gate 9B PostgreSQL contracts: `9/9`, `0` failed, `0` skipped, `0` todo.
- Gate 9B base-to-head diff check: passed with no output.
- Stage 6 platform jobs/operations regression checks: `125/125`, `0` failed,
  `0` skipped, `0` todo.
- Full unit suite: `643/643`, `0` failed, `0` skipped, `0` todo.
- Full PostgreSQL integration suite on a disposable PostgreSQL 17 database:
  `442/442`, `0` failed, `0` skipped, `0` todo.
- HTTP/RSC/API contracts through a local production server:
  `133/133`, `0` failed, `0` skipped, `0` todo.
- Stage 8D successor regression chain: `157/157`, `0` failed, `0` skipped,
  `0` todo.
- AI Gates A-D regression chain: `43/43`, `0` failed, `0` skipped, `0` todo.
- Next.js production build: `115/115` generated static pages.
- Expo Doctor: `20/20`.
- iOS and Android Hermes exports: `1016` modules each.
- Web export: `675` modules.
- Root and Mobile production audits: `0` vulnerabilities.
- Refined tracked-secret-value scan and client bundle provider/secret scan:
  `0` sensitive findings.

## Gate 9B script evidence

`npm run stage9b:preflight` now exits `0` only when the complete posture is
`READY`. Missing external inputs, production-like database targets, host/role
mismatches, migration mismatches, unverified restore points, unsafe runtime
URLs, malformed responses, and timeouts produce a redacted summary with
`ready=false` and a non-zero process exit code.

`npm run stage9b:database-evidence` was exercised against a local disposable
database named `rezno_staging` using the explicit local-test override. It
proved:

- migrations: `51/51`;
- job types: `23`;
- schedule keys: `13`;
- bounded database probe inserted `1` row and cleaned it to `0` remaining rows.

`npm run stage9b:runtime-evidence` exited `2` before any activation because the
author environment lacked staging Admin login or a scoped Gate 9B Admin context:

- `STAGING_ADMIN_LOGIN_OR_GATE9B_ADMIN_CONTEXT`
- `REZNO_STAGE9_GATE9B_ADMIN_USER_ID`
- `REZNO_STAGE9_GATE9B_ADMIN_PERSON_ID`
- `REZNO_STAGE9_GATE9B_ADMIN_ACCESS_ID`

## Closure rule

Gate 9B may be marked closed only after:

- exact-head CI/Vercel success;
- authenticated staging preflight;
- restore point evidence;
- healthy staging migrations `51/51`;
- runtime state `STAGING ACTIVATED — PRODUCTION NOT ACTIVATED`;
- one scheduled OIDC runtime cycle;
- fixture smoke and cleanup;
- zero unresolved review threads;
- independent review and merge.
