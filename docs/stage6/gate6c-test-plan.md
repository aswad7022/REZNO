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
