# Platform Jobs Test Plan

## Focused tests

`npm run test:platform-jobs:unit` covers architecture boundaries, closed registry, strict payload/result schemas, private-data rejection, canonical hashing, lifecycle, lease/horizon, retry/backoff/jitter, schedule catch-up, signed microsecond cursors, body framing, safe exceptions, production test guards, Migrations 43–44, and fail-closed staging identity/TLS safety. Negative cases include missing/malformed/non-PostgreSQL URLs, wrong path/database, weak TLS, pooler/non-Neon host, URL/current-user mismatch, expected host/role mismatch, absent `pg_stat_ssl`, unhealthy/failed/rolled-back migrations, and remote override attempts. Exact direct Neon and exact loopback test targets are the only positives.

`npm run test:platform-jobs:postgres` runs serially against a disposable migrated PostgreSQL database. It covers 44/44 health and no fabricated rows, Admin idempotency, single-winner/multi-worker claims, attempts, lease token and explicit fencing rejection, heartbeat, exact/changed completion, lease recovery, unexpired theft rejection, retries/exhaustion/dead-letter, cancel race, sequential/concurrent requeue, duplicate schedule tick, atomic Admin revocation, microsecond pagination/filter binding, safe DTOs, constraints, indexes, and foreign keys. Worker-operation coverage interrupts after PROCESSING creation, claim, partial completion, and complete job success; proves concurrent single ownership, bounded PROCESSING, expiry recovery, canonical finalization, original-batch preservation, no duplicate execution, changed replay conflict, stale operation token/generation rejection, exact terminal replay, and revoked-Admin rejection.

`npm run test:platform-jobs:http` exercises actual production routes when `PLATFORM_JOBS_HTTP_BASE_URL` is set. It covers unauthenticated/basic/view/manage permissions, authorization-before-body, trigger idempotency, strict type and unknown fields, list/detail/redaction, malformed/forged pagination, media type/UTF-8/actual size bounds, cancel/version/replay, worker/tick bounds, schedules, no-cache, stable safe errors, and revoked access. It also inspects the Admin/RSC and route matrix without requiring a server.

## Complete regression matrix

The required validation sequence is:

1. `npm ci` and `npm ci --prefix apps/mobile`.
2. `npm run lint`.
3. `npx tsc --noEmit --incremental false`.
4. `npm run typecheck --prefix apps/mobile`.
5. `npx prisma format`, `npx prisma validate`, and `npx prisma generate`.
6. focused Gate 6A unit and complete `npm run test:unit`.
7. focused Gate 6A PostgreSQL and complete `npm run test:integration` on fresh 1→44.
8. focused Gate 6A HTTP and complete `npm run test:http` against a built server.
9. `npm run test:stage5-closure`, Stage 4 closure, and the complete suites, which include Commerce, Identity/Admin, Stage 2 operations, Bookings, Restaurant, Reviews, Marketplace, Cart/Checkout, Orders, and Favorites.
10. `npm run build`.
11. Expo dependency validation, Expo Doctor, and iOS/Android Hermes exports.
12. dependency audit and source/history/build/payload/privacy scans.
13. `git diff --check` and a clean generated-file check.

## Migration rehearsal

Record:

- two independent empty databases migrated 1→44;
- a populated database first migrated 1→43 with existing Gate 6A evidence, then migrated 43→44;
- a second deploy no-op for each;
- failed and rolled-back migration counts zero;
- no Gate 6A jobs/schedules/attempts/mutations created by Migration 44;
- unchanged SHA-256 checksums for Migration directories 1–43;
- recorded Migration 44 checksum while preserving Migration 43 checksum;
- preserved Stage 5 data fingerprints.

## Staging acceptance

Real staging must begin healthy 43/43 with Migration 44 absent. Authenticated discovery must provide the exact direct non-pooler host and expected role; the URL must use `verify-full`, URL/current roles must match, and the actual session must report `pg_stat_ssl=true`. Deploy canonically to 44/44 and show a second deploy no-op. Seed twice must return an identical fixture fingerprint. Smoke must additionally prove worker-operation crashes before/after claim, active non-steal, expired recovery, canonical-attempt finalization, no batch expansion/duplicate execution, changed replay conflict, and revoked Admin rejection. Cleanup must be exact, a second cleanup must remove zero, and the non-fixture database fingerprint must remain unchanged.

## Exit criteria

Gate 6A can remain Draft-ready only when local validation, both migration rehearsals, populated upgrade, real staging, security scans, build/mobile exports, exact-head Actions, Vercel checks, and review-thread checks are recorded with no unresolved P0/P1/P2. Gate 6B, 6C, 6D, Stage 7, Stage 8, and AI remain unstarted.

## 2026-07-22 local remediation evidence

- focused unit 17/17 and complete unit 423/423;
- focused PostgreSQL 22/22 and complete PostgreSQL 371/371;
- focused built-server HTTP 9/9 and complete HTTP 114/114;
- lint, root TypeScript, Mobile TypeScript, Prisma format/validate/generate, Next production build, Expo dependency check, and Expo Doctor 20/20 passed;
- iOS and Android Hermes exports passed and their 64 generated files contained zero matches for credential, database URL, bearer token, or worker-operation authority patterns;
- fresh databases A and B both reached healthy 44/44, contained zero Gate 6A rows, and shared schema fingerprint `3742013062e657399bcd7f78e244c4ac4e79c22f2d059179df835dded67ecf7f`;
- populated 43→44 preserved Stage 5 fingerprint `a85db3f1858ea666f0a1f90cb984cb14ac6e62d65608e3dcf39b071a5d0369dc` and Gate 6A fingerprint `c1c5dcce755086bf96caff5f16c8005ada7b5a1881d61b12e2d982e561f1719e`, backfilled COMPLETE and PROCESSING worker mutations, reached healthy 44/44, and made the second deploy a no-op;
- Migration 43 remained `30de1da1e9b2cdf99dfea4ecc2ddc7769bbde858d2b86f89bcfae70939680ac`; Migration 44 is `385b17a4ccde1b905c98fa1dada8ded69a0f8a0b6b94289bbec43e538e5b39dd`.

The production dependency audit currently reports eight registry advisories: three high and five moderate, with no critical finding; Mobile reports zero. The available automatic fixes require broad or breaking Next/Sharp/Prisma/shadcn dependency changes outside this two-finding remediation. This evidence does not waive the advisories or make the Draft ready. Real staging is separately blocked by actual-session `pg_stat_ssl=false` at the authenticated 43/43 preflight.
