# Gate 6C Test Plan

Status: **ACTIVE** until exact-head local, rehearsal, staging, CI, and Vercel
evidence is complete.

## Unit and contract tests

Verify ten job types, five schedule keys, source truth tables, closed
payload/results, authority mappings, provider/runtime status, retry
eligibility/backoff, event normalization/replay, settlement period policy,
strict HTTP bodies, DTO redaction, and production rejection of deterministic
adapters.

## PostgreSQL integration

Run the complete platform-job and payment suites against a fresh 48/48
database. Focused Gate 6C coverage includes:

- communication discovery and exact child dedupe;
- cancellation, recipient/consent/endpoint revocation, single-winner claim,
  expired claim, and immutable attempt identity;
- atomic event/job ingestion, replay, changed conflict, actorless source,
  stale processing generation, and out-of-order handling;
- attempt/refund single winner, stable provider reference, duplicate capture,
  over-refund, and journal exact-once;
- reconciliation non-mutation and bounded classifications;
- canonical DRAFT uniqueness and no auto-finalization;
- every Migration 48 constraint, index, foreign key, and NULL bypass.

## Built HTTP tests

Build production Next.js, start that exact output, and test unauthenticated,
missing/revoked permission, no-store status, allow-listed trigger, invented
type, unknown/duplicate fields, oversized bodies, safe response redaction, and
the webhook matrix: valid, invalid/missing signature, malformed, unsupported,
oversized, replay, changed duplicate, enqueue rollback, and browser-return
non-authority.

## Complete regression and artifacts

Run root lint and non-incremental TypeScript, Mobile TypeScript, Prisma format/
validate/generate, all unit/PostgreSQL/HTTP suites, Stage 3, Stage 4A–4D,
Gate 5A–5D, Gate 6A–6B, bookings, restaurants, reviews, marketplace,
cart/checkout, orders, and favorites. Then run production build, Expo
dependency/doctor, iOS and Android Hermes exports, dependency audits,
`npm ls --all`, `git diff --check`, and source/history/server/browser/Hermes
secret, contact, webhook, instrument, job payload, authority/fencing, and
database-credential scans.

## Migration rehearsals

Required evidence:

1. fresh 1→48 rehearsal A;
2. fresh 1→48 rehearsal B;
3. populated 47→48 upgrade;
4. second deploy no-op;
5. failed and rolled-back migrations zero;
6. byte-identical checksums for Migrations 1–47;
7. recorded Migration 48 checksum;
8. zero fabricated job, schedule, communication, payment, or financial rows;
9. preserved Stage 4, Stage 5, Gate 6A, and Gate 6B fingerprints.

## Authenticated staging

Use the accepted direct non-pooler Neon endpoint and attested physical Pool
reused by Prisma. Require exact project/database/role, `sslmode=verify-full`,
authorized current certificate, hostname/SNI match, TLS 1.2/1.3, initial
healthy 47/47, final 48/48, second-deploy no-op, and no credential output.

Run the exact composed fixture twice and require identical semantic
fingerprints. Run Gate 6C smoke, then Stage 4C/4D, Gate 5C/5D, and Gate 6A/6B
successor smokes. Financial success and DRAFT construction use rollback-only
staging evidence because posted history is immutable; persistent rows exercise
cleanup-safe ignored/replay and transient paths. Run exact cleanup twice,
require second removal zero, and match final non-fixture fingerprint.

## Acceptance

No focused skip, open P0/P1/P2, failed check, unexplained audit, fingerprint
drift, credential residue, unresolved review thread, or exact-head CI/Vercel
failure is accepted. Gate 6C stays ACTIVE and the PR stays Draft until an
independent reviewer accepts and merges it. Gate 6D and later stages remain
unstarted.

## Exact-head local evidence — 2026-07-23

Focused Gate 6C coverage passed 6 unit and 9 PostgreSQL tests. The complete
regression passed 442 unit, 407 PostgreSQL, and 121 built HTTP tests: 970
tests, zero failures, and zero skips. The production build compiled and
generated 107/107 static pages. Root lint, root and Mobile TypeScript, Prisma
validation, Expo dependency alignment, and Expo Doctor 20/20 passed. The iOS
and Android Hermes exports completed.

Production dependency audits for the root and Mobile trees reported zero
vulnerabilities, and `npm ls --all` reported no tree problems. The full
development audit reported three Moderate findings and no High or Critical
findings; all three are one Windows-only development chain from `shadcn`
through the MCP SDK to Hono and are outside production dependencies.

## Authenticated staging evidence — 2026-07-23

Authenticated discovery selected only project `rezno-staging`, database
`rezno_staging`, its ready primary branch, direct non-pooler endpoint, and the
matching owner role. The Node client proved an authorized current TLS 1.3
socket, hostname/SNI match, system-CA verification, channel binding, and exact
physical Pool reuse by Prisma. The accepted Neon proxy diagnostic remained
`pg_stat_ssl=false`; client-side transport evidence remained authoritative.

Preflight was healthy 47/47 with zero failed or rolled-back migrations and
non-fixture fingerprint
`51f91a54f3d34335477ad613342c374803a26d6b401271973f7cffa89613d2d2`.
Only Migration 48 applied. Its repository and database checksum was
`04fa9fe4a87c7360ec3eb585951ff49c20e90675c74755d1127d716fbf009192`.
Postflight was healthy 48/48, and both the immediate and final canonical
deploys reported no pending migrations.

Both exact fixture seeds produced
`edd7dd5bcbc697272ad375ad9df87b2126ba8260037858acf27a51b2207c53b5`.
The rollback-only Gate 5C financial evidence fingerprint was
`b313552ea282376da895de0f9ff0cd264fc47c79a9e00ad144dbb63f8299f6cf`.
The Gate 6C smoke passed 47 checks. Stage 4C, Stage 4D, and Gate 5C successor
smokes passed; Gate 5D passed 105 checks, Gate 6A passed 59, and Gate 6B
passed 166. The Gate 6B retained-orphan sentinel is derived from the current
UTC day under the exact Gate 6C successor marker so its 24-hour retention
classification cannot change as a staging run crosses a calendar date.

Exact Gate 6C/payment cleanup removed the composed fixture rows; the repeated
cleanup removed zero. Supporting Stage 4D, Gate 5A/5B, and Gate 6A/6B fixtures
were independently removed by their exact-ID cleanups. Final Gate 6C counts
were zero for campaigns, deliveries, provider events, refunds, schedules,
jobs, attempts, and mutations. The final database fingerprint exactly returned
to the preflight value above. Foreign Person and Organization sentinel hashes
remained unchanged.

During authenticated operation, one connection-string retrieval was parsed
with the wrong output mode and the now-revoked staging credential appeared in
operator-only tool output. The exact staging role was immediately rotated.
Only Vercel project `rezno-staging` Production and Preview consumers were
updated and redeployed; both deployments became Ready and returned a
database-backed HTTP 200. The previous credential now fails with PostgreSQL
`28P01`, while the replacement passed the same direct TLS attestation. No
production project or PR #100 state was changed.
