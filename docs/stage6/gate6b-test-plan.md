# Gate 6B Test Plan and Evidence

## Focused coverage

The Gate 6B unit suite covers the nine job types, four schedule keys, strict
payload/result schemas, retry classification, cleanup/rescan eligibility,
inspection policy, three profiles, source fingerprints, deterministic output
settings, request bounds, redacted DTOs, runtime truth, and production test
provider refusal.

The serial PostgreSQL suite covers Migrations 45–47 constraints/indexes/no-row
behavior, the complete direct-SQL NULL-field truth-table matrix, concurrent
bounded discovery and dedupe, exact cleanup claims,
retention, deletion success/absence/transient retry, quota retention, ACTIVE
binding denial, rescan claim and source races, atomic rejection/detach,
rendition uniqueness/claim/fencing/publication/deletion, exact-source fallback,
Admin revocation, and tenant isolation.

The built-server HTTP suite covers unauthenticated/missing/revoked authority,
safe no-store status, allow-listed discovery, exact rescan/replay/version,
invented types and provider/key/profile fields, strict query/JSON/byte bounds,
safe errors, rendition delivery/fallback/denial, and response redaction. No
focused route is allowed to skip.

## Local evidence — 2026-07-23 closure rerun

- focused Gate 6A: unit 22/22 and PostgreSQL 28/28;
- focused Gate 6B: unit 7/7, PostgreSQL 21/21, and built-server HTTP 6/6;
- complete unit: 435/435;
- complete PostgreSQL/integration: 398/398, zero skip;
- complete built-server HTTP/RSC/API: 6/6 route contracts plus 114/114 live
  contracts, zero skip;
- full regression total: 953;
- ESLint with zero warnings, non-incremental root TypeScript, Mobile TypeScript,
  Prisma format/validate/generate, and Next 16.2.11 production build passed;
- Expo dependency check and Expo Doctor 20/20 passed after aligning
  `expo-dev-client` from `~57.0.8` to the SDK-compatible `~57.0.9` patch;
- iOS and Android Hermes exports passed;
- production dependency audit 0, Mobile audit 0, and `npm ls --all` passed;
- full audit residual: three Moderate development-only findings classified in
  `gate6b-security.md`;
- the newly published Next.js High advisories were removed by the exact
  16.2.11 patch before the final build and HTTP rerun;
- diagnostic invocations without the disposable database URL or local
  high-entropy auth secret failed closed as designed; the environment-correct
  complete rerun passed 398/398 and required no product change.

## Migration rehearsal

- fresh A: 1→45, healthy 45/45, second deploy no-op, failed/rolled-back zero,
  and zero jobs/schedules/renditions/assets;
- fresh B: identical result;
- populated rehearsal: exact base first migrated 1→44, then Migration 45;
  Gate 5 storage fingerprint remained
  `3bebae60d7efb88d890b301b6efd9c80f0ab6efeb1aa9c1031dd9ecb415636ee`;
  media fingerprint remained
  `cdd3643643e1a400d5cf7f770bac02974cbe7a92485175b1f19ba69a905b25da`;
  the historical Gate 6A health job remained semantically identical and no
  Gate 6B row was fabricated;
- Migrations 1–44 are byte-unchanged; Migration 45 SHA-256 is
  `bf1ca0d7d061948ff42af1ad4668d7ee81741afba49ff1fdf44e0bb920014389`.
- remediation fresh A and B each deployed 1→46, finished healthy 46/46, and
  made their second deploy a no-op;
- populated remediation first deployed 1→45, seeded the deterministic Gate 6B
  fixture, then applied only Migration 46; the fixture/non-fixture state was
  unchanged and the second deploy was a no-op;
- Migrations 1–45 aggregate remained
  `52d3f988e7b3e1df36d888bbc906fd4a4b73a0272af8d3bcc005d336bb858435`;
  Migration 46 SHA-256 is
  `6f445d9598f0d93651ad4905afe7161824e20653011e10e4453ffdb8a35f0d33`.

Migration 47 rehearsal completed on two independent fresh 1→47 databases and
one populated 46→47 database. Fresh A and B each finished 47/47 with
failed/rolled-back zero, made the second deploy a no-op, and contained zero
jobs, schedules, operations, renditions, assets, or bindings. The populated
rehearsal started at exact healthy 46/46 with 9 jobs, 4 schedules, 0
operations, 4 renditions, 5 assets, and 3 bindings. Migration 47 preserved
those counts, the Gate 6B fixture fingerprint
`98ade600392f56b98166320f4caf05581c14fe661f2cdb58add5352112d768c6`,
and non-fixture fingerprint
`2321b5889e29d4d4ddd758f2d6734877db672c336446f76dda2965e68b2cf5cf`.
Its second deploy was a no-op. The aggregate checksum of Migrations 1–46
remained
`bb70769bd809e2581a113f4bf14eb6738020505129e5825cecaa9f953969ec5d`;
Migration 47 SHA-256 is
`9596d3e94b852e5e8a794c9fc47f30decf67ad50e890ced7d5bc366704ee8b7d`.

## Staging protocol

Before mutation, authenticated Neon discovery and the Gate 6A client-side TLS
attestation must prove exact project/database, ready primary, direct non-pooler
host, role equality, authorized/current peer certificate, hostname/SNI, TLS
1.2/1.3, non-loopback transport, and Prisma reuse of the exact attested Pool
backend. The original run records 44/44→45/45. Remediation closure records the
healthy 45/45 preflight, zero claimless/partial/illegal rendition claims, and
the non-fixture fingerprint; applies only Migration 46 with canonical
`prisma migrate deploy`; and proves healthy 46/46, zero failed/rolled-back,
exact checksum, no fabricated Gate 6B rows, unchanged fingerprint, and a
second deploy no-op.

Migration 47 adds a separate authenticated preflight at healthy 46/46. It
requires all sanitized operation/claim/output/profile/deletion violation counts
to be zero, records the non-fixture fingerprint, applies only Migration 47 with
canonical `prisma migrate deploy`, and requires final healthy 47/47, matching
checksum, no fabricated row, unchanged fingerprint, and a second deploy no-op.

Seed twice must return one deterministic fixture fingerprint. The Gate 6B smoke
must cover cleanup, rescan, rendition, provider/runtime truth, Gate 5A/5B/6A
regressions, foreign sentinel preservation, and non-fixture equality. Cleanup
must remove only fixture ownership in documented order, then remove zero on its
second pass. Final 47/47 and the original pre-migration fingerprint are closure
exit conditions.

The staging scripts themselves were rehearsed locally on a disposable healthy
45/45 PostgreSQL database: both seed runs returned fixture fingerprint
`98ade600392f56b98166320f4caf05581c14fe661f2cdb58add5352112d768c6`;
the smoke passed 64 checks; cleanup removed 58 scoped rows; the second cleanup
removed zero; and non-fixture fingerprint
`d7b6339ac23aad5166f9d851ef8fe1ef4032bf5727533565ba9bd7ca564d3ca4`
remained unchanged. This is script rehearsal, not real-staging evidence.

The Migration 47 version of the scripts was also rehearsed on a disposable
healthy 47/47 PostgreSQL database. Both seeds returned the exact fixture
fingerprint
`98ade600392f56b98166320f4caf05581c14fe661f2cdb58add5352112d768c6`;
the truth-table-expanded smoke passed 166 checks; cleanup removed 70 scoped
rows and then zero; and the non-fixture fingerprint remained
`d7b6339ac23aad5166f9d851ef8fe1ef4032bf5727533565ba9bd7ca564d3ca4`.
This is local script rehearsal, not authenticated staging evidence.

## Authenticated staging evidence — 2026-07-22

Authenticated Neon discovery found exactly one `rezno-staging` project, its
ready primary branch, exact database `rezno_staging`, one role, and a direct
non-pooler read/write endpoint. Preflight passed TLS 1.3 with an authorized and
current peer certificate, hostname/SNI verification, direct non-loopback
transport, matching database/role, and exact reuse of the attested physical
Pool backend by Prisma. The sanitized host hash was
`d48247179a49d684af03e09a98e5b1e2311a257c01bbb400a72c323946ab35a8`.
Same-client `pg_stat_ssl=false` remained the expected Neon proxy diagnostic and
did not replace the successful client TLS proof.

The target began healthy 44/44. Canonical deploy applied only
`20260722150000_storage_media_automation`, reached healthy 45/45 with checksum
`bf1ca0d7d061948ff42af1ad4668d7ee81741afba49ff1fdf44e0bb920014389`,
zero failed/rolled-back migrations, zero Gate 6B jobs/schedules/renditions, and
made the second deploy a no-op. The normalized non-fixture fingerprint remained
`51f91a54f3d34335477ad613342c374803a26d6b401271973f7cffa89613d2d2`.

Both exact-ID seeds returned fixture fingerprint
`98ade600392f56b98166320f4caf05581c14fe661f2cdb58add5352112d768c6`.
The Gate 6B smoke passed 64 checks while retaining both foreign sentinel hashes
and the non-fixture fingerprint. Exact cleanup removed 58 rows; its second pass
removed zero. Final postflight was healthy 45/45, contained zero Gate 6B fixture
rows, and retained the original fingerprint.

Successor regression smokes passed Gate 5A 75 checks, Gate 5B 50 checks, and
Gate 6A 59 checks. The first Gate 5A attempt exposed Prisma `P2028` when a
serializable transaction waited through the remote advisory-lock window. The
bounded transaction classifiers now retry `P2028`, `P2034`, PostgreSQL
`40001`/`40P01`, and adapter `TransactionWriteConflict`, but never retry a
domain error. Gate 5A then passed completely and all successor fixtures were
cleaned; the final Gate 6B fingerprint remained unchanged.

## Authenticated remediation closure — 2026-07-23

Authenticated control-plane inventory proved the exact project was
`rezno-staging`, the database was `rezno_staging`, the primary endpoint was
direct/non-pooler, and the exact role was confined to that staging project and
branch. Vercel project `rezno-staging` Production and Preview were the only
persistent application consumers; Development did not consume the remote
database, repository workflows had no real-staging secret, and Vercel project
`rezno` had no database consumer.

The authorized password reset operated on that exact role once. After the
provider operation finished, the old credential rejected a new connection
with PostgreSQL authentication code `28P01` before SQL. The replacement passed
TLS 1.3, peer authorization/current validity, hostname/SNI, non-loopback and
non-pooler checks, exact role/database equality, and Prisma reuse of the
attested physical Pool. Fresh Production and Preview deployments of project
`rezno-staging` became Ready and authenticated database-backed requests
returned HTTP 200. Project `rezno` remained untouched.

Preflight was healthy 45/45, Migration 46 absent, failed/rolled-back zero, and
claimless/partial/illegal-state counts all zero. Canonical deployment applied
Migration 46 exactly once, matched repository checksum
`6f445d9598f0d93651ad4905afe7161824e20653011e10e4453ffdb8a35f0d33`,
kept all Migrations 1–45 checksums unchanged, created no job, schedule,
rendition, asset, or binding, and made the second deploy a no-op.

Both seeds returned fixture fingerprint
`98ade600392f56b98166320f4caf05581c14fe661f2cdb58add5352112d768c6`.
The initial expanded smoke stopped at the rendition-write revocation assertion
while the database retained a complete `PROCESSING` claim and published no
READY rendition. Exact reseed and rerun passed all 101 checks. Gate 5A, Gate
5B, and Gate 6A successor smokes passed 75/50/59 after their historical safety
checks were made to admit healthy 46/46 only under the exact Gate 6B
confirmation marker. Exact Gate 6B cleanup removed 70 rows, its second pass
removed zero, all fixture counters were zero, foreign sentinels were stable,
and the final non-fixture fingerprint equaled the preflight value
`51f91a54f3d34335477ad613342c374803a26d6b401271973f7cffa89613d2d2`.

## Authenticated Migration 47 closure — 2026-07-23

The task-owned Vercel operator used only project `rezno-staging` and its
Sensitive Preview `DATABASE_URL`. Its preflight proved exact database
`rezno_staging`, direct non-pooler host hash
`d48247179a49d684af03e09a98e5b1e2311a257c01bbb400a72c323946ab35a8`,
role `neondb_owner`, TLS 1.3 with hostname and system-CA verification, and
Prisma reuse of the attested physical client. The database was healthy 46/46
with failed/rolled-back zero, Migration 47 absent, all 15 sanitized violation
counts zero, all six protected domain-table counts zero, and non-fixture
fingerprint
`51f91a54f3d34335477ad613342c374803a26d6b401271973f7cffa89613d2d2`.

Canonical `prisma migrate deploy` applied only
`20260723150000_gate6a_gate6b_constraint_truth_tables`, reached healthy 47/47,
and stored the repository checksum
`9596d3e94b852e5e8a794c9fc47f30decf67ad50e890ced7d5bc366704ee8b7d`.
The second canonical deploy reported no pending migrations. Counts, fingerprint,
TLS identity, and every violation count remained unchanged.

The two exact Gate 6B seeds returned fingerprint
`98ade600392f56b98166320f4caf05581c14fe661f2cdb58add5352112d768c6`.
The truth-table-expanded Gate 6B smoke passed 166 checks. Gate 5A, Gate 5B, and
Gate 6A successor smokes passed 75/50/59. Exact Gate 6B cleanup removed 70
scoped rows and its second pass removed zero. Post-closure was healthy 47/47,
all protected domain-table counts and all 15 violation counts were zero, and
the non-fixture fingerprint still exactly matched preflight.

## Exit criteria

Gate 6B remains ACTIVE and unaccepted until independent review and merge.
Real-staging closure, source/history secret and privacy scans, exact-head
Actions/Vercel, and zero unresolved P0/P1/P2 review threads are mandatory
Ready-for-review evidence. Gate 6C/6D, Stage 7/8, and AI remain unstarted.
