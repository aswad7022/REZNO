# Gate 6B Test Plan and Evidence

## Focused coverage

The Gate 6B unit suite covers the nine job types, four schedule keys, strict
payload/result schemas, retry classification, cleanup/rescan eligibility,
inspection policy, three profiles, source fingerprints, deterministic output
settings, request bounds, redacted DTOs, runtime truth, and production test
provider refusal.

The serial PostgreSQL suite covers Migration 45 constraints/indexes/no-row
behavior, concurrent bounded discovery and dedupe, exact cleanup claims,
retention, deletion success/absence/transient retry, quota retention, ACTIVE
binding denial, rescan claim and source races, atomic rejection/detach,
rendition uniqueness/claim/fencing/publication/deletion, exact-source fallback,
Admin revocation, and tenant isolation.

The built-server HTTP suite covers unauthenticated/missing/revoked authority,
safe no-store status, allow-listed discovery, exact rescan/replay/version,
invented types and provider/key/profile fields, strict query/JSON/byte bounds,
safe errors, rendition delivery/fallback/denial, and response redaction. No
focused route is allowed to skip.

## Local evidence — 2026-07-22

- focused Gate 6B unit: 7/7;
- complete unit: 434/434;
- focused Gate 6B PostgreSQL: 14/14;
- complete PostgreSQL/integration: 385/385, zero skip;
- focused built-server Gate 6B HTTP: 6/6;
- complete built-server HTTP/RSC/API: 114/114, zero skip;
- storage PostgreSQL aggregate: 37; media aggregate: 11; Gate 6A platform jobs:
  22;
- ESLint with zero warnings, non-incremental root TypeScript, Mobile TypeScript,
  Prisma format/validate/generate, and Next 16.2.10 production build passed;
- Expo dependency check and Expo Doctor 20/20 passed;
- iOS and Android Hermes exports passed;
- production dependency audit 0, Mobile audit 0, and `npm ls --all` passed;
- full audit residual: three Moderate development-only findings classified in
  `gate6b-security.md`;
- complete HTTP rerun closed a flaky Stage 4C fixture by using PostgreSQL
  `clock_timestamp()` for database ordering; the final run was 114/114.

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

## Staging protocol

Before mutation, authenticated Neon discovery and the Gate 6A client-side TLS
attestation must prove exact project/database, ready primary, direct non-pooler
host, role equality, authorized/current peer certificate, hostname/SNI, TLS
1.2/1.3, non-loopback transport, and Prisma reuse of the exact attested Pool
backend. Record the healthy 44/44 preflight and non-fixture fingerprint, apply
only Migration 45 with canonical `prisma migrate deploy`, prove healthy 45/45,
zero failed/rolled-back, exact checksum, no fabricated Gate 6B rows, unchanged
fingerprint, and a second deploy no-op.

Seed twice must return one deterministic fixture fingerprint. The Gate 6B smoke
must cover cleanup, rescan, rendition, provider/runtime truth, Gate 5A/5B/6A
regressions, foreign sentinel preservation, and non-fixture equality. Cleanup
must remove only fixture ownership in documented order, then remove zero on its
second pass. Final 45/45 and the original pre-migration fingerprint are exit
conditions.

The staging scripts themselves were rehearsed locally on a disposable healthy
45/45 PostgreSQL database: both seed runs returned fixture fingerprint
`98ade600392f56b98166320f4caf05581c14fe661f2cdb58add5352112d768c6`;
the smoke passed 64 checks; cleanup removed 58 scoped rows; the second cleanup
removed zero; and non-fixture fingerprint
`d7b6339ac23aad5166f9d851ef8fe1ef4032bf5727533565ba9bd7ca564d3ca4`
remained unchanged. This is script rehearsal, not real-staging evidence.

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

## Exit criteria

Gate 6B remains ACTIVE and its PR remains Draft until real staging, source and
history secret/privacy scans, exact-head Actions/Vercel, zero unresolved P0/P1/P2
review threads, independent review, and merge. Gate 6C/6D, Stage 7/8, and AI
remain unstarted.
