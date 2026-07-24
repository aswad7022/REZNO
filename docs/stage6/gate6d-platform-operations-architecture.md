# Gate 6D — Platform Operations Closure Architecture Audit

Status: **ARCHITECTURE LOCKED BEFORE IMPLEMENTATION**. This record was written
before Gate 6D implementation. Gate 6D, Stage 6, and its pull request remain
open until implementation, local validation, migration rehearsal, authenticated
staging, exact-head automation, independent review, and merge are complete.

## Verified baseline

- Repository: `aswad7022/REZNO`.
- Exact base: `38ec9e3d6bd9db56f46e515cccab5dd6301bc63e`,
  the merge commit for PR #127.
- PR #127 was merged from exact head
  `3a5b4c9d141885a4b58dbc5cad3ad42abe448ab9`.
- Gates 6A, 6B, and 6C are accepted and merged.
- Repository and authenticated staging baseline: 48 healthy migrations.
- Migration 48 remains
  `04fa9fe4a87c7360ec3eb585951ff49c20e90675c74755d1127d716fbf009192`.
- PR #100 remains an untouched Open Draft at
  `e46454df993ecccb06180060dda4353ec88e2641`.
- The isolated worktree is `rezno-stage6-gate6d` on branch
  `feat/stage6-platform-operations-closure`.
- Production storage, scanner, Email, SMS, Push, payment, payout, and external
  queue providers remain unconfigured. No provider success is inferred from
  this gate.

## Sources reviewed before implementation

The audit read the repository `AGENTS.md`, the Next.js 16.2.11 Route Handler,
Backend-for-Frontend, Data Security, Environment Variables, Instrumentation,
and Deployment guides under the matching installed
`node_modules/next/dist/docs`. The resulting Next.js boundaries are:

- Route Handlers are public endpoints and must authenticate and authorize
  themselves.
- Lambda-style Route Handlers share no reliable process memory, may overlap,
  and may be terminated.
- secrets stay server-only and never use a `NEXT_PUBLIC_` name;
- rendering performs no operational mutation;
- Server Components call the server data layer directly rather than making an
  internal HTTP round trip;
- `instrumentation.ts` runs once per server instance for observability setup.
  It is not a durable scheduler or worker and will not be used as one.

The audit also read the accepted Stage 4 closure, Stage 5 canonical scope,
closure and production-operations handoff, Stage 6 canonical scope, Gate 6A
foundation/operations/security, Gate 6B automation/security/test handoff, and
Gate 6C automation/operations/security/test handoff.

Current provider behavior was verified against the deployment control plane:
both `rezno` and `rezno-staging` are Vercel Next.js projects using Node 24 in
`iad1`; their owning Vercel team is on the Hobby plan. Current Vercel
documentation permits Hobby cron only once daily, so a five-minute
`vercel.json` schedule would fail deployment and is rejected. Vercel also
documents overlapping and duplicate cron invocation and no failed-invocation
retry. GitHub documents a minimum scheduled-workflow interval of five minutes,
default-branch execution, and possible delay or dropped runs under load.

Primary references:

- <https://vercel.com/docs/cron-jobs>
- <https://vercel.com/docs/cron-jobs/manage-cron-jobs>
- <https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule>

## Existing platform registry

### Platform jobs

PostgreSQL owns 20 closed job types at the baseline:

| Family | Job type | Payload authority | Current execution |
| --- | --- | --- | --- |
| Platform | `PLATFORM_HEALTH_PROBE` | inert closed probe/version | manual worker |
| Storage | `STORAGE_MAINTENANCE_DISCOVERY` | batch 1–50 | manual worker |
| Storage | `STORAGE_ORPHAN_CLEANUP` | session ID/version | manual worker |
| Storage | `STORAGE_ASSET_DELETE_RETRY` | asset ID/version | manual worker |
| Storage | `STORAGE_RESCAN_DISCOVERY` | batch 1–50 | manual worker |
| Storage | `STORAGE_ASSET_RESCAN` | asset ID/version | manual worker |
| Media | `MEDIA_RENDITION_DISCOVERY` | batch 1–50 | manual worker |
| Media | `MEDIA_RENDITION_GENERATE` | asset ID/version/closed profile | manual worker |
| Media | `MEDIA_RENDITION_CLEANUP_DISCOVERY` | batch 1–50 | manual worker |
| Media | `MEDIA_RENDITION_DELETE` | rendition ID/version | manual worker |
| Communications | `COMMUNICATION_CAMPAIGN_DISCOVERY` | batch 1–50 | manual worker |
| Communications | `COMMUNICATION_DELIVERY_DISCOVERY` | batch 1–50 | manual worker |
| Communications | `COMMUNICATION_CAMPAIGN_DISPATCH` | campaign ID/version | manual worker |
| Communications | `COMMUNICATION_DELIVERY_DISPATCH` | delivery ID/version | manual worker |
| Payments | `PAYMENT_PROVIDER_EVENT_PROCESS` | verified event ID/version | manual worker |
| Payments | `PAYMENT_RETRY_DISCOVERY` | batch 1–50 | manual worker |
| Payments | `PAYMENT_ATTEMPT_RETRY` | attempt ID/version | manual worker |
| Payments | `PAYMENT_REFUND_RETRY` | refund ID/version | manual worker |
| Payments | `PAYMENT_RECONCILIATION` | batch 1–50 | manual worker |
| Settlements | `SETTLEMENT_STATEMENT_GENERATE` | batch and one closed UTC day | manual worker |

The handler registry is closed and server-owned. Jobs contain references, not
tenant, provider, endpoint, object, contact, payment, or success authority.

### Schedules

The baseline has ten closed schedule keys, each mapping one-to-one to the same
job type:

1. `PLATFORM_HEALTH_PROBE`;
2. `STORAGE_MAINTENANCE_DISCOVERY`;
3. `STORAGE_RESCAN_DISCOVERY`;
4. `MEDIA_RENDITION_DISCOVERY`;
5. `MEDIA_RENDITION_CLEANUP_DISCOVERY`;
6. `COMMUNICATION_CAMPAIGN_DISCOVERY`;
7. `COMMUNICATION_DELIVERY_DISCOVERY`;
8. `PAYMENT_RETRY_DISCOVERY`;
9. `PAYMENT_RECONCILIATION`;
10. `SETTLEMENT_STATEMENT_GENERATE`.

No migration creates a schedule. Guarded fixture/operator services create
disabled rows with human provenance. The current manual scheduler tick processes
at most ten due schedules and catches up at most ten occurrences per schedule.

### Workers, claims, retries, and dead letters

- The only connected worker is an Admin-authorized bounded Web request.
- A manual worker operation is persisted in `PlatformJobMutation`, owns a
  random 120-second operation lease and monotonic operation fence, and can
  claim at most ten jobs.
- Job claim uses indexed deterministic ordering, `FOR UPDATE SKIP LOCKED`,
  random lease UUIDs, and a monotonic job fence.
- Active work is `CLAIMED` or `RUNNING`; stale publication must match job,
  state, worker, lease token, fence, and unexpired lease.
- Retry delay is deterministic bounded exponential backoff from 30 to 3,600
  seconds, with at most ten attempts.
- Exhausted retryable work becomes `DEAD_LETTERED`; permanent failure becomes
  `FAILED`.
- Requeue creates a child and retains the terminal original; a root permits at
  most three requeues.
- Gate 6B/6C domain claims add their own canonical generation and final
  revalidation. Platform fencing does not claim to undo an external side
  effect.

### Non-platform scheduled operation found by the audit

Stage 3 exports `expirePendingOrdersBatch` plus a guarded manual
`commerce:expire-pending-orders` command. It uses bounded
`FOR UPDATE SKIP LOCKED` batches and canonical Order locking, but no production
scheduler invokes it. Accepted Stage 3 documentation assigns its recurring
scheduler, monitoring, and retry operations to Stage 6. Gates 6A–6C did not
register it.

Closing Stage 6 while leaving the owner-approved pending-order reservation
expiry manual would contradict the accepted handoff. Gate 6D therefore adds
one reference-free bounded `COMMERCE_ORDER_EXPIRY` job/schedule over the
existing canonical batch service. It does not add or change Commerce product
truth.

### Rate limiters

The baseline has one global process-memory fixed-window store with a 10,000
bucket ceiling. It is used by 25 production files across:

- Better Auth;
- public and authenticated marketplace, onboarding, Commerce and media;
- Booking, Restaurant and Review APIs/actions;
- Business Operations mutations;
- Notification, Message and Communication APIs/actions;
- storage/media, payment/webhook, storage automation and platform-job Admin
  routes.

Forwarded IP input is ignored unless one exact trusted proxy header is
configured. Accepted identifiers are normalized then SHA-256 hashed; fallback
uses a header fingerprint or an ephemeral random key. No raw IP is persisted.
The store cannot coordinate two Vercel instances and high-cardinality input can
evict another bucket. It is defense in depth only.

There is no Redis client or accepted Redis service. Local Docker Redis is not a
production authority. PostgreSQL is the only accepted distributed durable
provider available to this gate.

### Alerts and incidents

No canonical alert, incident, acknowledgement, resolution, deduplication, or
immutable operational-history model exists. Existing documents contain
runbook prose only. No external alert-delivery provider is configured.

### Current Admin operations

`PLATFORM_JOBS_VIEW` permits safe job/schedule list and job detail.
`PLATFORM_JOBS_MANAGE` depends on view and permits:

- inert health trigger;
- queued cancel;
- bounded failed/dead-letter requeue;
- schedule enable/disable;
- one manual scheduler tick;
- one manual worker batch;
- bounded Gate 6B/6C discovery triggers where joint domain permissions exist.

The current UI is `/admin/platform-jobs`; APIs are no-store, strictly bounded,
and use HMAC signed, scope/filter/page-size-bound, PostgreSQL-microsecond-safe
cursors. It has no health overview, distributed-rate truth, automatic-runtime
control, alert/incident lifecycle, or cross-domain metrics.

### Provider and runtime truth

| Capability | Baseline truth |
| --- | --- |
| Durable queue/coordination | `POSTGRESQL` |
| External queue | `NOT_CONFIGURED` |
| Redis | `LOCAL_DOCKER_ONLY_NOT_CONNECTED` |
| Automatic scheduler | `NOT_CONNECTED` |
| Always-on worker | `NOT_CONNECTED` |
| Storage | `NOT_CONFIGURED` |
| Malware scanner | `SCANNER_NOT_CONFIGURED` |
| Email/SMS/Push | `NOT_CONFIGURED` |
| Online payment | `NOT_CONFIGURED` |
| Bank payout | not implemented |

## Locked Gate 6D architecture

### 1. Distributed rate limiting

Decision: PostgreSQL is the canonical distributed rate-limit store.

`DistributedRateLimitBucket` stores only a versioned HMAC-SHA-256 bucket key,
count, fixed window, reset/expiry times, and timestamps. It stores no raw IP,
session, token, authorization value, email, phone, Person UUID, Organization
UUID, or user-agent fingerprint. The HMAC input binds:

- a versioned key domain;
- the closed operation scope;
- the rate policy (limit and window);
- a server-derived tenant scope;
- the already normalized server-derived caller identity.

The signing key is derived server-side from the accepted strong
`BETTER_AUTH_SECRET` using a Gate 6D-specific HKDF domain. Rotation starts new
buckets safely; old buckets expire without a downgrade key ring.

Consumption is one atomic PostgreSQL statement. Concurrent application
instances cannot each grant a separate local allowance. A cleanup job deletes
only expired buckets in a bounded batch. Normal requests never scan all
buckets.

Failure policy is explicit:

- production uses PostgreSQL and fails closed as `RATE_LIMIT_UNAVAILABLE`/503
  if distributed consumption is unavailable;
- test/development may use the bounded memory implementation and identifies
  its source as `LOCAL_ONLY`;
- there is no silent production memory fallback and no response claims
  distributed protection when PostgreSQL did not decide.

All production call sites become asynchronous and map exhaustion to 429 with
`Retry-After`, while provider unavailability maps to a stable no-store 503.

### 2. Automatic runtime

Decision: use a GitHub Actions scheduled HTTP invoker because the actual
Vercel Hobby plan cannot deploy the required cadence. Do not add an invalid
Vercel Cron or an external queue.

The default-branch workflow runs at a five-minute cadence away from the top of
the hour. It requests a short-lived GitHub Actions OIDC token with the exact
audience `rezno-platform-runtime` and calls one Node.js Route Handler. The
handler verifies, before business parsing or mutation:

- issuer and current GitHub OIDC signature;
- audience, expiry, not-before, issued-at, and token ID;
- exact numeric repository ID `1287643453`;
- repository `aswad7022/REZNO`;
- exact runtime workflow path;
- accepted event and branch/ref;
- token commit SHA against the deployed commit where the environment provides
  it.

The token is never stored or logged. Only a SHA-256 token-ID fingerprint is
persisted for replay rejection. The invocation URL is not a secret. No
long-lived runtime bearer secret is introduced.

`PlatformRuntimeControl` is an explicit singleton initialized disabled by a
current `PLATFORM_OPERATIONS_MANAGE` operator. Enable/disable increments a
monotonic generation. `PlatformRuntimeInvocation` owns a random lease token,
monotonic generation, bounded phase/result fields, and the control generation.
Every scheduler, claim, recovery, handler start, provider boundary, result
publication, and finalization revalidates both runtime invocation and job
authority. Disabling or replacing the control generation fences in-flight
publication.

The runtime performs one crash-recoverable bounded cycle:

1. close/recover a bounded set of expired runtime/job leases;
2. process at most ten due schedules using Gate 6A occurrence deduplication;
3. claim and execute a bounded worker batch using Gate 6A claim/lease/fencing;
4. update bounded monitoring alerts;
5. finalize only with the same runtime lease and generation.

It never performs provider work inside a Customer, Business, or ordinary Admin
request. Manual worker/tick routes remain emergency diagnostics and retain
human revocation checks.

GitHub scheduled workflows are best-effort and may be delayed or dropped. Gate
6D does not fabricate a timing SLA. Persistent schedule catch-up, duplicate
suppression, runtime freshness metrics, and delayed-runtime alerts make that
limitation visible and recoverable. `CONNECTED` means an enabled control and a
recent successfully authenticated invocation, not merely a committed workflow
or environment value. Otherwise the UI reports a precise configured,
unobserved, stale, disabled, or not-connected state. The worker is periodic and
bounded; it is never described as always-on.

### 3. Runtime authority and provenance

Automatic runtime is a service authority, not an impersonated logged-in Admin.
The closed runtime registry can execute only registered job/schedule types.
Human worker operations continue to require the existing joint Admin/domain
permissions and fail on revocation.

Schedule and job creator IDs remain immutable provenance of the operator who
bootstrapped that closed schedule. They are not runtime authorization.
Runtime-sensitive domain services accept a closed runtime execution context
only when the live invocation and job execution guard validates in the same
transaction. Existing actor fields used for audit retain the configuring
operator as provenance; responses must not describe this as a human action.

The control itself can be disabled immediately. A stale runtime generation
cannot claim, retry, detach, dispatch, reconcile, create a draft statement,
publish a provider result, clean a newer domain claim, or finalize.

### 4. Final job and schedule registry

Gate 6D adds exactly three job types and matching schedule keys:

| Job/schedule | Purpose | Closed payload | Current manual permission |
| --- | --- | --- | --- |
| `COMMERCE_ORDER_EXPIRY` | expire one bounded batch of due pending Orders | batch 1–50 | `PLATFORM_JOBS_MANAGE` + `COMMERCE_ORDERS_MANAGE` |
| `PLATFORM_OPERATIONS_MONITOR` | derive bounded metrics and reconcile alert state | fixed monitor version/bounds | `PLATFORM_JOBS_MANAGE` + `PLATFORM_OPERATIONS_MANAGE` |
| `DISTRIBUTED_RATE_LIMIT_CLEANUP` | remove expired bucket rows only | batch 1–500 | `PLATFORM_JOBS_MANAGE` + `PLATFORM_OPERATIONS_MANAGE` |

The final registry is 23 jobs and 13 schedules. No arbitrary handler, cadence,
payload, URL, provider, tenant, query, metric, or alert rule is accepted.

An idempotent Admin bootstrap creates only server-defined disabled schedule
rows for keys the current operator may manage. Server-owned defaults are:

| Schedule | Cadence | Catch-up |
| --- | ---: | ---: |
| health probe | 5 minutes | 1 |
| Commerce expiry | 5 minutes | 3 |
| storage maintenance | 15 minutes | 2 |
| storage rescan | 60 minutes | 1 |
| rendition discovery | 5 minutes | 2 |
| rendition cleanup | 60 minutes | 1 |
| campaign discovery | 5 minutes | 2 |
| delivery discovery | 5 minutes | 2 |
| payment retry discovery | 5 minutes | 2 |
| payment reconciliation | 60 minutes | 1 |
| settlement draft generation | 24 hours | 1 |
| platform monitor | 5 minutes | 1 |
| distributed bucket cleanup | 60 minutes | 1 |

Bootstrap does not enable a schedule. Existing per-key joint permission checks
still guard enable/disable.

### 5. Bounded health metrics

The platform-operations data layer derives current safe aggregates using
indexed predicates and capped subqueries. A count is either exact below its
cap or marked saturated; no overview performs an unbounded payload hydration.

The overview includes:

- overdue available/scheduled/retry jobs;
- active and expired leases;
- retry-wait and dead-letter totals;
- disabled and delayed schedules;
- storage cleanup, rescan and rendition backlog;
- communication scheduled-campaign, due-delivery and failed-delivery backlog;
- payment due-attempt/refund, unprocessed verified-event and reconciliation
  status;
- settlement-generation schedule/job status;
- distributed rate-store availability and capped active/expired buckets;
- automatic runtime configured/observed/freshness truth;
- exact provider configuration truth.

Dead-letter rows continue to use the accepted signed Platform Job cursor.
Alert and incident lists receive distinct domain-separated signed cursors,
current Admin scope, fixed snapshot, filters, page size, exact PostgreSQL
microseconds, and UUID tuple continuation. DTOs contain safe states, counts,
timestamps, versions and opaque IDs only.

### 6. Alerts and incidents

`PlatformAlert` has one server-generated stable deduplication key, closed rule,
domain, severity, safe bounded observation metadata, occurrence count,
`OPEN`/`ACKNOWLEDGED`/`RESOLVED` state, optimistic version, and actor/time
fields. Monitor reconciliation atomically creates, refreshes, reopens, or
resolves one row per rule/scope. Concurrent observation cannot duplicate it.

`PlatformIncident` is created only from an existing alert, with one stable
incident identity per alert. It uses the same three-state lifecycle and
optimistic version. No arbitrary title, contact, URL, provider payload, or
external ticket target is accepted.

`PlatformAlertHistory` and `PlatformIncidentHistory` are append-only. Database
triggers reject update and delete. Every automatic or Admin transition writes
history in the same transaction. Admin mutations use
`PlatformOperationMutation`, current authority, UUID idempotency, canonical
request hashes, and exact optimistic versions. Exact replay returns the stored
safe result; changed replay conflicts.

Acknowledgement records investigation without suppressing a continuing
condition. Resolution records current operational judgement; the monitor may
reopen the same alert if the rule is observed again. No alert or incident
operation sends Email, SMS, Push, webhook, or a provider ticket.

### 7. Admin boundary

Gate 6D adds:

- `PLATFORM_OPERATIONS_VIEW`;
- `PLATFORM_OPERATIONS_MANAGE`, depending on view.

View permits safe overview, runtime/rate truth, alert/incident lists and detail.
Manage permits runtime initialization/state, schedule bootstrap, alert
acknowledge/resolve, and incident create/acknowledge/resolve. Job cancel,
requeue, worker, tick, and schedule state continue to require
`PLATFORM_JOBS_MANAGE`; domain jobs retain their joint permissions.

All routes and Server Actions authenticate and reauthorize in their canonical
transaction. Bodies are streamed and bounded, queries reject unknown or
duplicate fields, mutations are POST, responses are no-store, and raw database,
OIDC, provider, job payload, lease, fence, contact, payment, or object detail
never crosses the DTO.

The Admin surface is `/admin/platform-operations`. It links to the existing
job detail rather than duplicating the durable-job model. Gate 6D changes
functional operations only; broad visual redesign remains Stage 8.

## Migration decision

Decision: **Migration 49 is required**.

The need is proven rather than inferred from documentation: the accepted
48/48 schema has no shared rate bucket, runtime control/invocation, alert,
incident, immutable operational history, or operational mutation persistence.
These correctness properties cannot be made restart-safe or multi-instance
safe in memory, logs, UI state, or existing human-only mutation rows.

Migration 49 is one additive forward-only migration and adds:

1. `DistributedRateLimitBucket`;
2. `PlatformRuntimeControl`;
3. `PlatformRuntimeInvocation`;
4. `PlatformAlert`;
5. `PlatformAlertHistory`;
6. `PlatformIncident`;
7. `PlatformIncidentHistory`;
8. `PlatformOperationMutation`;
9. the three closed job and schedule enum values;
10. explicit checks, foreign keys, uniqueness, bounded due/list indexes, and
    append-only history triggers.

It creates no bucket, runtime control, invocation, schedule, job, alert,
incident, actor, tenant, communication, storage, media, Commerce, payment,
ledger, settlement, or provider row. Migrations 1–48 remain byte-identical.
No `db push`, reset, enum rollback, fabricated provider row, or data backfill
is allowed.

Before acceptance, query-plan tests must prove the exact due/list predicates
use the required indexes or an equally valid index with the same leading
columns. Tests validate index definitions independently of PostgreSQL's
cost-based choice.

## Security and reliability test plan

### Unit and source contracts

- exact 23-job/13-schedule registry and closed payload/results;
- permission dependency and human/runtime authority matrices;
- GitHub OIDC issuer/audience/repository/workflow/ref/SHA/time/JTI rejection;
- runtime truth states and no env-only `CONNECTED`;
- distributed key domain separation, no raw identity persistence, fixed-window
  semantics, local-only development truth and production fail-closed policy;
- metrics caps/saturation, alert rules, stable dedupe, lifecycle state
  machines, strict bodies/queries, DTO redaction and signed cursor rejection;
- provider truth and production rejection of every deterministic adapter.

### PostgreSQL integration

- multi-client atomic rate-limit races across independent Prisma clients;
- expired-bucket reset and bounded cleanup;
- duplicate and overlapping runtime invocation, lease expiry/reclaim,
  generation fencing, scheduler occurrence dedupe and crash before/after claim;
- stale execution before provider work and after provider acceptance;
- runtime disable/re-enable fencing and manual Admin revocation;
- Commerce expiry exact-once stock/reservation behavior;
- alert observation/dedupe/reopen and incident create/ack/resolve races;
- exact/changed idempotency replay, stale versions, IDOR and cross-scope denial;
- dead-letter/requeue bounds and signed pagination;
- every nullable constraint truth table and append-only history trigger;
- required query plans/index definitions and migration-created-row count zero.

### Built production HTTP/RSC/API

- unauthenticated/forged/expired/replayed OIDC requests before mutation;
- wrong repository/workflow/ref/SHA and malformed/oversized authorization;
- no-cache safe runtime results;
- view/manage and joint job permission separation, revocation and IDOR;
- malformed/forged/cross-scope alert/incident cursors;
- strict/oversized/duplicate/unknown fields;
- stable 429 versus distributed-store 503;
- safe Admin/RSC rendering and no internal fetch from Server Components.

### Complete closure

Run all focused and complete unit, PostgreSQL, and built HTTP/RSC/API suites
with zero unexplained skips; root ESLint; non-incremental root and Mobile
TypeScript; Prisma format/validate/generate; Next.js production build; Expo
dependency check and Doctor; iOS/Android Hermes exports; production/full/Mobile
dependency audits; dependency tree validation; `git diff --check`; and
source/history/server/browser/Hermes scans for credentials, OIDC tokens,
contacts, raw IP/session identifiers, payment instruments, provider payloads,
job authority, lease/fence values, and database URLs.

## Migration and staging plan

Local rehearsal requires:

1. fresh 1→49 database A;
2. fresh 1→49 database B;
3. populated 48→49 preservation upgrade;
4. second deploy no-op;
5. zero failed/rolled-back migrations;
6. byte-identical Migrations 1–48 and recorded Migration 49 checksum;
7. zero migration-created business or operations rows;
8. preserved accepted cross-stage fingerprints.

Authenticated staging must use the accepted direct non-pooler client-side TLS,
hostname/SNI/system-CA, exact role/database, and Prisma physical-client
attestation without printing credentials. It starts healthy 48/48, applies only
Migration 49, finishes 49/49, and proves a second deploy no-op.

The exact Gate 6D fixture initializes only deterministic disabled schedule,
runtime, rate, job, alert, incident, history and mutation rows. Two seeds must
produce one fingerprint. The smoke covers the runtime/rate/metrics/alert/
incident/Commerce-expiry contracts, then Gate 6A, 6B, 6C and affected Stage
3–5 successor smokes. Provider-success and immutable financial history remain
rollback-only where prior gates require it. Cleanup deletes exact fixture IDs
in dependency order, runs twice, removes zero on the second pass, preserves
foreign sentinels, and restores the preflight non-fixture fingerprint.

## Rollback and incident policy

Runtime disable is the first operational stop. It increments the control
generation so in-flight stale publication fails. Schedule disable prevents new
occurrences. Application rollback deploys the prior immutable code while
retaining additive schema and all job, invocation, alert, incident, history and
rate evidence. No migration or enum is reversed automatically.

After a runtime incident:

1. disable runtime and affected schedules;
2. inspect safe metrics, invocations, jobs, attempts and authoritative domain
   state;
3. establish external provider side-effect truth;
4. recover only expired leases through canonical services;
5. requeue only through the bounded authorized path;
6. re-enable after a successful health probe and current provider/runtime
   verification.

Never edit claims, fences, attempts, posted Journals, provider references,
alerts, incidents, or immutable history directly.

## Explicit non-goals and acceptance

Gate 6D does not onboard a production storage/scanner/communications/payment/
payout provider, add an external queue, claim human delivery, implement
physical-device or release QA, redesign the product, begin Stage 7/8, begin AI,
or modify PR #100.

No P0, P1, or P2, unexplained skip, failed check, credential residue,
fingerprint drift, unresolved review thread, or exact-head Actions/Vercel
failure is accepted. A Draft PR is author evidence only. Gate 6D and Stage 6
remain open until independent review accepts the exact head and the PR is
merged; this task does not merge it.
