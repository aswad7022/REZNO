# Gate 6A/6B PostgreSQL Constraint Truth Tables

## Why Migration 47 exists

PostgreSQL accepts a `CHECK` expression when it evaluates to `TRUE` or
`UNKNOWN`; it rejects only `FALSE`. A comparison, `BETWEEN`, regular
expression, JSON extraction, or arithmetic expression over a nullable column
can therefore admit a row when a required value is absent. Migration 47
replaces only the six proven vulnerable Gate 6A/Gate 6B constraints with
complete `IS NULL`/`IS NOT NULL` lifecycle branches.

The migration first counts every known invalid tuple and fails with sanitized
aggregate counts. It does not infer a claimant, fabricate a row, or rewrite
unknown data. Migrations 1–46 remain byte-unchanged.

## Audit table

| Table | Constraint | Intended states | Nullable columns | Vulnerable tuple before Migration 47 | Required truth table | Migration 47 | Direct-SQL coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `PlatformJobMutation` | `PlatformJobMutation_operation_check` | `WORKER_BATCH` PROCESSING/COMPLETE; every other action | all six `operation*` fields; JSON `result.state` may be absent/non-string | NULL batch, worker ID, fence, or JSON state made a required conjunction `UNKNOWN`; the old regex alternation was also loosely grouped | PROCESSING has a bounded batch, closed worker ID, positive fence, both lease fields, no completion, and explicit string state; COMPLETE has the same identity fields, no lease, a completion time, and explicit string state; non-worker actions have no operation field | replaced | each required field, missing/non-string/invalid state, illegal lease/completion forms, valid PROCESSING/COMPLETE, and each operation field on a non-worker action |
| `StoredAsset` | `StoredAsset_rescan_claim_check` | idle or actively claimed | four `rescanClaim*` fields | job, lease, and expiry present with a NULL fence passed through `NULL >= 1` | either all four fields are NULL, or all four are present and the fence is positive | replaced | each individually missing field, zero fence, complete claim, and all-NULL claim |
| `MediaRendition` | `MediaRendition_claim_check` | PROCESSING, DELETE_PENDING, and claim-free states | four `claim*` fields | Migration 46 still allowed an otherwise complete PROCESSING or DELETE_PENDING claim with NULL fencing because `NULL >= 1` was `UNKNOWN` | PROCESSING requires all four fields and a positive fence; DELETE_PENDING is exactly idle or completely claimed; every other state is claim-free | replaced | each missing field, zero fence, partial deletion claim, complete/idle deletion claim, and claims on PENDING/READY/FAILED/SUPERSEDED/DELETED |
| `MediaRendition` | `MediaRendition_output_check` | complete, empty, or deletion-compatible output | provider version, MIME, size, checksum, width, height, ready time | READY/SUPERSEDED and deletion output branches could pass with required NULL values because comparisons and multiplication became `UNKNOWN` | READY/SUPERSEDED require the complete tuple; PENDING/PROCESSING/FAILED require the empty tuple; DELETE_PENDING/DELETED require exactly complete or empty | replaced | every required complete-output field on READY and SUPERSEDED, partial deletion output, empty/complete deletion output, and output on PENDING/FAILED |
| `MediaRendition` | `MediaRendition_profile_bounds_check` | no dimensions or a complete profile-bounded pair | width and height | one dimension could be NULL while the profile comparison or arithmetic branch evaluated `UNKNOWN` | both dimensions are NULL, or both are present, positive, and inside the exact closed profile box | replaced | width without height, height without width, zero, and profile overflow |
| `MediaRendition` | `MediaRendition_delete_check` | deletion requested, deletion complete, or no deletion lifecycle | request and completion timestamps | a non-deletion row could retain `deleteRequestedAt` because only `deletedAt IS NULL` was required | DELETE_PENDING has request/no completion; DELETED has both; every other state has neither | replaced | illegal request timestamp on READY/PENDING/PROCESSING/FAILED/SUPERSEDED plus valid deletion transitions |

## Adjacent constraints audited and retained

The remaining constraints introduced or materially relied on by Migrations
43–46 were reviewed for nullable equality, ordering, `BETWEEN`, regex, JSON,
arithmetic, conjunction, and disjunction behavior.

| Area | Constraints | Result |
| --- | --- | --- |
| Gate 6A job and schedule scope/target lifecycle | schedule/job scope, actor pair, source, requeue, lease, started, completion, failure, cancellation, attempt active/started/error/result, and mutation target | retained; nullable lifecycle branches use explicit `IS NULL`/`IS NOT NULL`, equality of non-null booleans, or operate on NOT NULL columns |
| Gate 6A sizes and hashes | payload/result object, payload/result hash, deduplication key, versions, cadence, catch-up, attempts, priority, and fencing | retained; operands are NOT NULL or use an explicit `IS NULL OR validated-value` branch |
| Gate 6B source and mapping | platform source, schedule mapping, source version/checksum/fingerprint, object key, and rendition version | retained; operands are NOT NULL or presence is explicit |
| Gate 6B optional values | `StoredAsset_inspection_policy_version_check`, `MediaRendition_checksum_check` | retained; each optional field is expressed as `IS NULL OR validated-value` |
| Gate 6B failure lifecycle | `MediaRendition_failure_check` | retained; FAILED requires a code and every non-FAILED state explicitly requires NULL |

## Output-provider decision

The storage provider contract returns `objectVersion: string | null`.
Consequently, `providerObjectVersion` is optional in a complete rendition
output. All other complete-output fields are mandatory. In an empty-output
tuple, `providerObjectVersion` and every other output field must be NULL. This
preserves providers without generation identifiers without permitting a
partially populated output.

## Regression locations

- Gate 6A operation matrix:
  `tests/platform-jobs/integration/platform-jobs-e2e.test.ts`.
- Gate 6B claim, rescan, output, profile, and deletion matrix:
  `tests/storage/integration/storage-media-automation-e2e.test.ts`.
- Authenticated closure matrix:
  `scripts/staging/smoke-storage-media-gate6b.ts`.

All three exercise direct SQL against PostgreSQL so ORM validation cannot hide
database constraint behavior.

## Closure evidence

Two fresh rehearsals migrated 1→47, finished healthy 47/47 with no failed or
rolled-back row, fabricated no protected domain row, and made a second deploy a
no-op. The populated 46→47 rehearsal preserved all counts and both fixture and
non-fixture fingerprints. Migrations 1–46 retained aggregate SHA-256
`8990391ed58ff9418ba145e9439a0041a04b4474e6374852cf11a6340a24fb67`;
Migration 47 SHA-256 is
`9596d3e94b852e5e8a794c9fc47f30decf67ad50e890ced7d5bc366704ee8b7d`.

Authenticated staging began healthy 46/46 with all 15 preflight violation
counts zero. Canonical deploy applied only Migration 47, reached healthy 47/47,
and made the second deploy a no-op. The 166-check Gate 6B smoke plus 75/50/59
Gate 5A/5B/6A successor smokes passed. Cleanup removed 70 rows and then zero;
all protected domain counters and violation counters were zero afterward, and
the non-fixture fingerprint was unchanged.
