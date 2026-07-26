# Gate 7B Test Plan

Status: **AUTHOR REMEDIATION VERIFIED — DRAFT RE-REVIEW PENDING**.

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
- atomic single-flight ownership before cancellation refs, commit phase, or
  pending state changes; startup recovery skips both the same active operation
  and a different active operation without starting transport twice;
- stable coordinator ownership across repeated locale changes, callback
  replacement, rerender, and unmount/remount before commit, during commit,
  and after commit; React subscription cleanup cannot abort the runner;
- one completion path across an ambiguous attach-to-verification handoff, or
  an explicit retained `VERIFY_ATTACH` retry/startup path when verification is
  unavailable;
- stale/rejected runner cleanup cannot release or lower pending state for a
  newer owner generation;
- cancellation during an already-started durable persist retains the runner,
  `pending`, and cleanup authority until that write quiesces; the latest record
  is then removed before a new operation may claim the slot;
- account transition aborts and quiesces old pre-commit work before any new
  account bootstrap, uses local-only operation-scoped cleanup, waits out an
  old `COMMITTING` request without overlap, and ignores every stale old-owner
  command after the switch;
- the runner captures its opaque API session at atomic claim, before
  asynchronous preparation; a session switch while production-ordered
  `VERIFY_ATTACH` persistence is pending cannot make the old attach use the
  new account; a direct transport test proves the captured request uses
  `credentials: "omit"`, keeps only its claim-time Cookie after the simulated
  native jar changes, and rejects Cookie/Authorization overrides before
  Fetch;
- process restart after target issuance, ambiguous upload, finalization, and
  attach;
- preview failure after confirmed attach remains committed, cleans recovery
  once, and preview retry never repeats attach;
- delayed preview success or failure for asset A becomes `STALE` after asset B
  is current or A is removed, while the same current asset still receives
  normal `READY` or non-blocking `UNAVAILABLE`;
- cancel before attach prevents the mutation even if an earlier container
  read returns late;
- cancel during attach waits for server truth, accepts a later success, and
  retains recovery state across a network-ambiguous response;
- a restored `VERIFY_ATTACH` checkpoint is non-cancellable before container
  reconciliation begins;
- expiry on explicit Retry cleans file and manifest before reporting expired;
- cleanup is idempotent when either artifact is already absent, preserves the
  manifest when private-file deletion fails, and reports manifest deletion
  failure truthfully;
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
| Locale change or component remount in any commit phase | Only rendered text/listener changes; runner ID, controller, checkpoint, commit phase, pending state, transport, and attach count remain owned by the coordinator |
| Startup preview A settles while foreground B is active | Recovery observes B's owner and performs no controller/ref/state mutation, transfer, attach, or cleanup |
| Stale runner `finally` settles after a newer generation starts | Owner-token mismatch blocks commit, pending, cancellation-ref, and release changes |
| Cancel arrives while a checkpoint persist is unresolved | The owner remains `CANCELLING`; a duplicate/new run is rejected, the write settles, cleanup removes the latest record, and only then is the runner released |
| Account changes while old work is pre-commit | The old controller is aborted, normalization/transport and durable writes quiesce, local recovery is removed without an authenticated abort call, and only then does the new account bootstrap |
| Account changes while old attach is `COMMITTING` | The exact old owner remains pending until server truth resolves; no second runner, verifier, preview, or new-account API work overlaps it |
| Session changes while `VERIFY_ATTACH` persistence is pending | The real engine keeps attach on the runner's claim-time session; it never rereads or sends the new account cookie |
| Stale old-account action arrives after the new runner starts | It cannot abort, cancel, retry, remove, or change pending/commit state for the current account |
| Process restart before/after finalize | Stable idempotency resumes exact checkpoint |
| Different user reopens app | Recovery rejected and local private state cleaned |
| Container changed before attach | Old asset is not attached over newer content |
| User cancels before attach | Live task stops; server abort is best effort; local cleanup is idempotent |
| User cancels while attach is in flight | UI reports verification, does not abort/clean blindly, and accepts the later server result |
| Attach response is network-ambiguous | `VERIFY_ATTACH` recovery remains; Retry reconciles the authoritative container before mutation |
| Process restarts after attach was sent | `VERIFY_ATTACH` restores as verification-only and cannot claim cancellation |
| Attach succeeds but preview fails | Commit remains successful; local upload state is cleaned; preview-only retry performs no attach |
| Preview A settles after B is current or A was removed | Both success and failure are ignored; B or the empty state remains authoritative |
| Retry after the 15-minute TTL | Private JPEG and manifest are cleaned before `RECOVERY_EXPIRED` |
| File or SecureStore cleanup fails | Failure is explicit; a private file is never orphaned by deleting its recovery pointer |

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

The P2-focused regression run and complete closure matrix below were produced
from the remediation source state on 2026-07-26. No skipped, cancelled, or
hidden failure is counted as success.

| Check | Result |
| --- | --- |
| Focused Gate 7B + Gate 7A regression + release validator | `57/57` pass |
| Complete Unit suites | `517/517` pass (`317 + 200`) |
| Complete PostgreSQL integration on disposable `49/49` database | `425/425` pass |
| Complete live HTTP/RSC/API suites | `131/131` pass (`6 + 120 + 5`) |
| Root and Mobile TypeScript | PASS |
| Full ESLint and `git diff --check` | PASS, zero warning/error |
| Prisma format/validate/generate | PASS, Prisma Client `7.8.0` |
| Expo config/install check/Doctor | PASS; dependencies current; `20/20` |
| iOS Hermes export | PASS; 945 modules; 3.3 MB bundle |
| Android Hermes export | PASS; 943 modules; 3.3 MB bundle |
| Expo Web export | PASS; 676 modules; 1.9 MB bundle |
| Next.js production build | PASS; compile/typecheck and `115/115` pages |
| Root production dependency audit | PASS; 0 findings |
| Mobile full dependency audit | PASS; 0 findings |
| Migration chain and immutability | PASS; 49 directories, no schema/migration diff |

The authoritative PostgreSQL run used a newly created local disposable
database with the repository CI's non-production authentication environment.
An initial diagnostic run omitted that local signing environment and failed
only cursor creation; the affected files then passed `30/30`, followed by the
fresh full `425/425` run.

The authoritative HTTP run used the newly migrated disposable database and a
Next.js production server on an isolated local port. An initial diagnostic
omitted `DATABASE_URL` from the direct route-handler test process and failed
before the live-route matrix; the corrected CI-shaped run supplied every
required database and base-URL variable and passed all `131/131`. Only that
complete run is reported as closure evidence.
