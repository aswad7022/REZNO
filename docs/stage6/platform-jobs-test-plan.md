# Platform Jobs Test Plan

## Focused tests

`npm run test:platform-jobs:unit` covers architecture boundaries, closed registry, strict payload/result schemas, private-data rejection, canonical hashing, lifecycle, lease/horizon, retry/backoff/jitter, schedule catch-up, signed microsecond cursors, body framing, safe exceptions, production test guards, Migration 43 presence, and staging safety.

`npm run test:platform-jobs:postgres` runs serially against a disposable migrated PostgreSQL database. It covers 43/43 health and no fabricated rows, Admin idempotency, single-winner/multi-worker claims, attempts, lease token and explicit fencing rejection, heartbeat, exact/changed completion, lease recovery, unexpired theft rejection, retries/exhaustion/dead-letter, cancel race, sequential and concurrent requeue, duplicate schedule tick, worker execution, atomic Admin revocation, microsecond pagination/filter binding, safe DTOs, scoped schedules, rollback on constraints, indexes, and foreign keys.

`npm run test:platform-jobs:http` exercises actual production routes when `PLATFORM_JOBS_HTTP_BASE_URL` is set. It covers unauthenticated/basic/view/manage permissions, authorization-before-body, trigger idempotency, strict type and unknown fields, list/detail/redaction, malformed/forged pagination, media type/UTF-8/actual size bounds, cancel/version/replay, worker/tick bounds, schedules, no-cache, stable safe errors, and revoked access. It also inspects the Admin/RSC and route matrix without requiring a server.

## Complete regression matrix

The required validation sequence is:

1. `npm ci` and `npm ci --prefix apps/mobile`.
2. `npm run lint`.
3. `npx tsc --noEmit --incremental false`.
4. `npm run typecheck --prefix apps/mobile`.
5. `npx prisma format`, `npx prisma validate`, and `npx prisma generate`.
6. focused Gate 6A unit and complete `npm run test:unit`.
7. focused Gate 6A PostgreSQL and complete `npm run test:integration` on fresh 1→43.
8. focused Gate 6A HTTP and complete `npm run test:http` against a built server.
9. `npm run test:stage5-closure`, Stage 4 closure, and the complete suites, which include Commerce, Identity/Admin, Stage 2 operations, Bookings, Restaurant, Reviews, Marketplace, Cart/Checkout, Orders, and Favorites.
10. `npm run build`.
11. Expo dependency validation, Expo Doctor, and iOS/Android Hermes exports.
12. dependency audit and source/history/build/payload/privacy scans.
13. `git diff --check` and a clean generated-file check.

## Migration rehearsal

Record:

- two independent empty databases migrated 1→43;
- a populated database first migrated 1→42, populated with deterministic Stage 5 evidence, then migrated 42→43;
- a second deploy no-op for each;
- failed and rolled-back migration counts zero;
- no Gate 6A jobs/schedules/attempts/mutations created by migration;
- unchanged SHA-256 checksums for Migration directories 1–42;
- recorded Migration 43 checksum;
- preserved Stage 5 data fingerprints.

## Staging acceptance

Real staging must begin healthy 42/42 with Migration 43 absent, use an encrypted intended-role connection to exact `rezno_staging`, deploy canonically to 43/43, and show a second deploy no-op. Seed twice must return an identical fixture fingerprint. Smoke must prove claims, active-lease protection, recovery, explicit fencing, heartbeat ownership, exact success, bounded retry/exhaustion, cancel/requeue, schedule dedupe/catch-up, safe Admin DTO, provider/runtime truth, and the absence of domain automation. Cleanup must be exact, a second cleanup must remove zero, and the non-fixture database fingerprint must remain unchanged.

## Exit criteria

Gate 6A can remain Draft-ready only when local validation, both migration rehearsals, populated upgrade, real staging, security scans, build/mobile exports, exact-head Actions, Vercel checks, and review-thread checks are recorded with no unresolved P0/P1/P2. Gate 6B, 6C, 6D, Stage 7, Stage 8, and AI remain unstarted.
