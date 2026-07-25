# Gate 7B Test Plan

Status: **AUTHOR VERIFICATION COMPLETE — DRAFT REVIEW PENDING**.

## Focused contract matrix

The Gate 7B suite must prove, with zero failure, skip, todo, or cancellation:

- camera/library granted, retryable denial, blocked denial, and picker cancel;
- Android pending picker-result recovery;
- JPEG, PNG, WebP, HEIC/HEIF, AVIF, and disguised unsupported bytes;
- source size, decoded pixel, normalized size, and target header boundaries;
- metadata-removing normalization and fixed JPEG upload contract;
- exact HTTPS provider target and explicit cookie/authorization rejection;
- upload progress clamping and explicit success/failure/cancel states;
- offline preservation, slow-network timeout, bounded retry, and max attempts;
- duplicate in-memory submission rejection;
- process restart after target issuance, ambiguous upload, finalization, and
  attach;
- stable idempotency keys and rotated target generation only when required;
- owner/destination/TTL/checksum/path validation;
- container-version conflict never attaches to changed content;
- all new UI state keys exist in `ar`, `en`, and `ckb`;
- Gate 7A exact release allowlist remains unchanged.

## Required repository checks

1. `npm run test:stage7b`.
2. `npm run test:stage7a` regression.
3. Complete Unit suite.
4. Complete PostgreSQL and HTTP suites where the local disposable environment
   is available; no skipped database/HTTP result is reported as full success.
5. Root non-incremental TypeScript and Mobile TypeScript.
6. ESLint with zero warning and `git diff --check`.
7. Prisma format check, validation, and client generation.
8. Expo release-config validation, public config, dependency check, and Expo
   Doctor.
9. iOS and Android Hermes exports plus Expo Web export.
10. Next.js production build.
11. Root production and Mobile full dependency audits at zero.
12. Secret/privacy scan, migration count/checksums, final diff review, and
    explicit Gate 7A regression.

## Runtime fault scenarios

| Scenario | Expected result |
| --- | --- |
| Camera/library permission denied but askable | No picker launch; localized retryable permission message |
| Permission permanently blocked | No picker launch; localized settings action |
| Picker cancelled | No manifest/session/file; localized cancellation truth |
| Android Activity killed during picker | Pending result normalized once, or rejected safely |
| HEIC/HEIF decoder supported | Local JPEG normalization then managed upload |
| HEIC/HEIF decoder unavailable | Explicit safe rejection; no false success |
| AVIF/GIF/document renamed `.jpg` | Rejected by bytes before storage session |
| Oversized source/output or unsafe pixels | Rejected and temporary output cleaned |
| Offline before transfer | No provider request; durable checkpoint retained |
| Transfer timeout/interruption | Retryable checkpoint retained; attempt counted once |
| Ambiguous provider completion | Server finalization reconciles; absent object rotates generation |
| Duplicate press/runtime call | Second call rejected; one provider upload |
| Process restart before/after finalize | Stable idempotency resumes exact checkpoint |
| Different user reopens app | Recovery rejected and local private state cleaned |
| Container changed before attach | Old asset is not attached over newer content |
| User cancels | Live task stops; server abort best effort; local state always removed |

## Simulator/emulator and device evidence

Safe local simulator/emulator checks should cover app launch, permission UI,
picker cancellation, settings-blocked UI where controllable, progress UI, and
force-close/reopen behavior. Camera and true HEIC behavior may be limited by
simulator media/camera support and must be labeled accordingly.

A physical-device PASS requires a current exact-head Development or Preview
artifact and the evidence template in `gate7b-device-evidence.md`. Repository
tests, Expo export, an old artifact, or a simulator do not prove physical
Camera, HEIC, poor-network, or process-death behavior.

## Author results

All counts below were produced from the final Mobile implementation source
state at `f7c2ef673d5fbcea185646277723e290581910ff` on 2026-07-25. No
skipped, todo, cancelled, or hidden failure is counted as success.

| Check | Result |
| --- | --- |
| Gate 7B + Gate 7A regression + release validator | `26/26` pass |
| Complete Unit suites | `486/486` pass (`286 + 200`) |
| Complete PostgreSQL integration on disposable `49/49` database | `425/425` pass |
| Complete live HTTP/RSC/API suites | `131/131` pass (`6 + 120 + 5`) |
| Root and Mobile TypeScript | PASS |
| Full ESLint and `git diff --check` | PASS, zero warning/error |
| Prisma format/validate/generate | PASS, Prisma Client `7.8.0` |
| Expo config/install check/Doctor | PASS; dependencies current; `20/20` |
| iOS Hermes export | PASS; 941 modules; 3.2 MB bundle; 4.0 MB export |
| Android Hermes export | PASS; 939 modules; 3.2 MB bundle; 4.0 MB export |
| Expo Web export | PASS; 672 modules; 1.9 MB bundle; 2.8 MB export |
| Local iOS Simulator native build/install/open | PASS; 0 errors, 2 non-blocking generated-project warnings |
| Next.js production build | PASS; compile/typecheck and `115/115` pages |
| Root production dependency audit | PASS; 0 findings |
| Mobile full dependency audit | PASS; 0 findings |
| Migration chain and immutability | PASS; 49 directories, no schema/migration diff |

The full PostgreSQL and HTTP runs used only a newly created local disposable
database. The database, isolated test server, HTTP log, Expo export
directories, generated iOS project, simulator app, and simulator state were
removed after verification.
