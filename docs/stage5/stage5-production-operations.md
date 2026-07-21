# Stage 5 production operations and provider handoff

Status: Gate 5D operator contract. This is not a claim that an external provider
is configured or that Stage 6 automation exists.

## Current production truth

| Capability | Production state | Safe behavior |
| --- | --- | --- |
| Persistent managed storage | `NOT_CONFIGURED` | session creation and provider delivery fail with `STORAGE_PROVIDER_NOT_CONFIGURED`; no deterministic fallback |
| Malware scanner | `SCANNER_NOT_CONFIGURED` | READY means bounded static-raster structural policy passed, not malware-free |
| Media transformation/rendition | not configured | stable media references use the inspected original; no synthetic rendition |
| Online payment provider | `NOT_CONFIGURED` | online creation/webhook paths fail closed; accepted offline methods remain available |
| Settlement payout | not implemented | FINALIZED is an immutable ledger statement, never bank payout evidence |
| Deterministic adapters | non-production guarded | unit/PostgreSQL tests and exact guarded staging operator only |
| Automatic workers/schedulers | not connected | bounded authorized manual entrypoints only; Stage 6 owns automation |

An operator must not change a provider status in documentation, UI, environment,
or incident notes until a separate accepted integration supplies a supported
adapter, credential ownership, rotation process, provider-specific callback
authentication, staging proof, rollback, and independent security review.

## General operator safety

Before any manual operation:

1. authenticate through the authorized environment without printing or
   persisting credentials;
2. verify the exact project, environment, database, role, and encrypted direct
   endpoint;
3. verify the repository/deployment SHA and healthy migration status;
4. use the current Person/Organization/Admin authority rather than a supplied
   tenant identity;
5. choose a fresh UUID idempotency key and record only safe result identifiers;
6. keep every page/batch within the service maximum;
7. stop on authorization, provider-state, checksum, migration, or fingerprint
   mismatch;
8. never retry by changing authoritative amount, currency, target, owner,
   provider, object key, or expected version under the same idempotency key.

Do not place a database URL, provider token, signed upload/download URL,
authorization header, object key, checksum, raw callback, payment instrument,
contact/address/VIN, or raw provider error in a command line, ticket, PR,
console, audit note, or shared log.

## Managed-storage cleanup

Production cleanup is available only through
`POST /api/admin/storage/cleanup` with current
`STORAGE_RECORDS_MANAGE` authority and an `idempotency-key` header. The JSON
body may contain only `batchSize`, an integer from 1 through 100. The service:

- revalidates the Admin grant and Person;
- expires at most one bounded batch;
- claims only exact expired-session keys or exact `DELETE_PENDING` assets;
- never lists or deletes a bucket/prefix broadly;
- performs provider calls outside database locks;
- releases quota only after provider-confirmed deletion/absence;
- redacts keys, targets, credentials, checksums, and provider errors.

The `npm run storage:cleanup` CLI intentionally refuses production and directs
operators to the permissioned endpoint. Do not bypass that refusal. A repeated
request uses the same UUID only for exact replay; changed batch size requires a
new UUID. Transient provider failure leaves the row retryable and quota-counted.

## Media delivery diagnosis

Diagnose a managed media failure in this order:

1. read `/api/media/capabilities` and retain the reported provider truth;
2. verify the typed target, ACTIVE binding, READY asset, slot/purpose,
   visibility, owner Organization/Person, and target lifecycle;
3. distinguish a legal 404 caused by detach/reject/unpublished target from a
   provider-unavailable response;
4. never copy a provider target into a persistent DTO, order snapshot, audit,
   ticket, or log;
5. never restore a detached legacy URL, import a remote URL, rewrite history,
   or attach a foreign asset as an incident workaround.

Public `/media/<assetId>` and authenticated Customer/Business delivery repeat
authorization after provider target generation. Admin storage view/manage does
not grant private Customer/Business media download.

## Payment reconciliation

`npm run payments:reconcile --` is the only direct manual CLI in Gate 5C. It
requires:

- exact `REZNO_PAYMENT_RECONCILIATION_MANUAL` confirmation in
  `REZNO_PAYMENT_RECONCILIATION_CONFIRM`;
- an active, non-expired database Admin grant with
  `PAYMENTS_RECONCILE`;
- `--admin-user-id`;
- a UUID `--idempotency-key`;
- `--limit` from 1 through 50 (default 25);
- optional UUID `--organization-id` or `--payment-intent-id`.

Reconciliation is bounded and non-mutating. `NOT_CONFIGURED` is the expected
provider classification until an accepted provider exists. Other
classifications are evidence for investigation; they do not authorize
mark-paid, ledger rewrite, silent target restoration, or automatic correction.
Corrective work requires an explicit idempotent domain mutation/reversal and
the current target authority.

## Refund and webhook incidents

- A refund derives target, currency, captured balance, and available capacity
  from the locked intent; client/provider amount overrides are forbidden.
- Only provider-confirmed success posts the reversing Journal and compatibility
  projection. Timeouts remain safely retryable under the same exact request.
- Webhook ingestion is limited to 64 KiB actual streamed bytes, rate-limited
  before ingestion, authenticated before business parsing, replay-bound by
  provider event ID and payload hash, and stores no raw body.
- A browser return is read-only and never marks a payment paid.
- Late/out-of-order events create explicit reconciliation truth; do not rewrite
  a cancelled/expired business target silently.

If payment credentials or a webhook secret are suspected exposed, disable the
consumer where possible, rotate only the affected authorized scope through the
provider control plane, invalidate the old value, update approved consumers
without printing the replacement, redeploy, and rerun exact-head migration,
fixture, smoke, cleanup, health, and secret-residue checks. Do not touch a
production provider or database not explicitly in scope.

## Settlement statements

Settlement preview/finalization requires current `SETTLEMENTS_MANAGE`. Preview
accepts only an Organization UUID, IQD, and an explicit bounded period.
Finalization requires a positive expected version and UUID idempotency key. It
revalidates every included POSTED capture/refund Journal, Organization,
currency, period, totals, and duplicate inclusion.

`FINALIZED` records an immutable calculation statement. It does not mean
money was paid, transferred, remitted, or received by a bank. Voiding preserves
all immutable statement fields. There is no Gate 5D payout command or scheduled
statement generator.

## Deployment and migration

Gate 5D adds no migration. A deployment preflight must confirm:

- exact application SHA;
- exactly 42 repository migration directories;
- migrations 41 and 42 match accepted checksums;
- database `_prisma_migrations` is healthy 42/42 with zero failed or
  rolled-back rows;
- `prisma migrate deploy` is a no-op;
- production storage and payment providers still report not configured.

Do not use `prisma db push`, reset, edit migrations 1–42, fabricate migration
43, or backfill business/provider history.

## Rollback and recovery

Gate 5D application additions are documentation, closure registries, tests, and
guarded staging orchestration; they contain no production data migration or
provider cutover. Roll back an application deployment through the normal
immutable prior deployment while leaving database history untouched.

For staging fixture recovery, run only the Gate 5D exact-ID cleanup in reverse
dependency order and require a zero second pass. Do not truncate tables, reset a
schema, delete by marker prefix, or remove foreign rows. Preserve and compare
the whole-database non-fixture fingerprint before and after.

## Stage 6 handoff

Stage 6, not this runbook, owns:

- durable queues/workers and crash-recovery orchestration;
- automatic storage cleanup/rescans and rendition work;
- asynchronous provider-event consumption/retry;
- scheduled reconciliation and settlement-statement generation;
- distributed locks, rate limits, monitoring, alerting, and expanded
  operations dashboards.

Until Stage 6 is independently scoped and accepted, every exported operation
remains manual, bounded, explicitly authorized, and truthful about provider
availability.
