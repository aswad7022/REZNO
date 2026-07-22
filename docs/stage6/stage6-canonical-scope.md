# Stage 6 — Admin and Platform Operations

Status: canonical Stage 6 scope. Gate 6A is accepted and merged; Gate 6B is
active. Gates 6C and 6D remain unstarted.

Gate 6B baseline: `origin/main` at
`e30c51468cc93388e210f636cadc1b097e481ebf`, the merge commit of PR #125,
with exactly 44 repository migrations. PR #125 merged Gate 6A from exact head
`c7f0f8a99eb27bf0dcc5fa853275e13963868ad5`. PR #100 remains an untouched
Open Draft at `e46454df993ecccb06180060dda4353ec88e2641`.

## Accepted repository evidence

The following accepted evidence defines Stage 6:

- `docs/stage5/gate5d-canonical-scope.md` assigns durable workers and queues,
  automatic scheduling, distributed coordination and rate limits,
  asynchronous provider-event processing and retries, automatic storage
  cleanup/rescans, rendition orchestration, scheduled reconciliation and
  settlement operations, and expanded platform operations to Stage 6.
- `docs/stage5/stage5-production-operations.md` exposes only bounded manual
  operations and explicitly hands durable execution, crash recovery,
  monitoring, alerting, automatic cleanup/rescans, media orchestration,
  provider retry, reconciliation, and settlement scheduling to Stage 6.
- `docs/communications/stage4c-admin-outbound-delivery.md` persists a
  domain-specific delivery lease and exports bounded due-dispatch operations,
  but states that no production scheduler or general durable queue exists.
  Stage 6 must connect later automation without replacing authoritative
  communication state.
- `docs/storage/gate5a-managed-storage-foundation.md` exports bounded manual
  exact-key cleanup and rescan attachment points for later Stage 6 scheduling.
- `docs/media/gate5b-media-lifecycle-integration.md` assigns persistent
  rendition orchestration and provider-independent retries to Stage 6.
- `docs/payments/gate5c-payments-financial-integrity.md` assigns asynchronous
  verified provider-event processing, retries, scheduled reconciliation, and
  scheduled settlement-statement generation to Stage 6 while preserving the
  accepted payment and ledger models as authoritative.
- `docs/communications/stage4-closure.md` assigns automatic workers,
  scheduling, distributed rate limiting, receipts/webhooks, monitoring, and
  expanded operations to Stage 6. It keeps device/provider receipt QA in Stage
  7 and broad visual redesign in Stage 8.
- `docs/commerce/stage3d-admin-stage3-closure.md` and
  `features/dashboard/feature-placeholder.tsx` name Stage 6 **Admin and
  Platform Operations**.
- Merged PRs #121, #122, #123, and #124 preserve the same handoffs and provider
  truth. PR #124 independently confirms that Stage 5 is complete and no Stage
  6 worker, scheduler, queue, schema, or migration 43 existed before this gate.
- Repository inspection found Redis only in local Docker Compose. No Redis
  client dependency, accepted external queue provider, Vercel Cron, generic
  durable-job model, always-on worker, or production scheduler is configured.
  Existing process-local rate limiting is defense in depth, not a distributed
  Stage 6 control.

These sources are mutually consistent. Stage 6 is an operations and automation
stage, not a new product domain. Later automation needs one durable execution
foundation before any domain handler is connected.

## Objective

Create a truthful, secure, restart-safe automation and platform-operations
layer over the accepted Stage 1–5 business truth. Work is divided so that a
single PostgreSQL-backed durable execution foundation is independently reviewed
before storage, media, communications, payments, distributed controls, or
cross-stage operational closure are activated.

## Included capabilities

Stage 6 owns:

1. a closed durable-job and schedule platform with atomic claims, leases,
   fencing, heartbeats, retry/dead-letter lifecycle, idempotency, and bounded
   manual execution;
2. automatic bounded storage cleanup/rescans and media rendition orchestration;
3. scheduled outbound communication dispatch, asynchronous verified provider
   events, provider retries, reconciliation, and settlement statements;
4. distributed rate limits and coordination, bounded queue/health dashboards,
   monitoring, alerts, incident state, and Stage 6 closure evidence.

## Excluded capabilities

Stage 6 excludes:

- new Customer, Business, marketplace, booking, restaurant, media, payment, or
  communications product truth;
- client-selected handlers, commands, module paths, URLs, provider credentials,
  tenant authority, financial values, or executable payloads;
- physical-device, camera/library/HEIC, hosted-action/deep-link, process-death,
  poor-network, signed release, TestFlight, Play Store, or real receipt QA;
- broad visual or brand redesign;
- AI assistant or AI product work;
- production provider onboarding without a separately accepted integration,
  credentials, deployment, and security review;
- modification of protected Draft PR #100.

## Internal gate decomposition

### Gate 6A — Durable Jobs and Scheduling Foundation

Status: **ACCEPTED** through merged PR #125.

- PostgreSQL-backed canonical jobs, attempts, schedules, and idempotent
  mutations;
- closed server-owned job types and versioned reference-only payload schemas;
- atomic bounded claims, unpredictable fencing tokens, leases, heartbeats,
  expiry recovery, safe completion, retry/backoff, terminal failure, and
  dead-letter lifecycle;
- deterministic bounded schedule ticks and duplicate suppression;
- minimum permission-scoped Admin list/detail/cancel/requeue/trigger/manual
  worker/manual scheduler operations;
- inert foundation/test handlers only;
- automatic production scheduler and domain automation remain not connected.

### Gate 6B — Storage and Media Automation

Status: **ACTIVE**. The authoritative design and acceptance record is
`docs/stage6/gate6b-storage-media-automation.md`.

- automatic bounded exact-key storage cleanup and rescan orchestration;
- persistent rendition-processing orchestration;
- provider-independent storage/media retry lifecycle;
- no fabricated provider and no expansion of accepted media ownership.

### Gate 6C — Communications and Payment Automation

Status: **UNSTARTED**.

- outbound dispatch scheduling over accepted campaign/delivery truth;
- asynchronous processing of already authenticated provider events;
- bounded provider retry orchestration;
- scheduled reconciliation and settlement-statement generation;
- no bank payout, arbitrary messaging, or client-derived financial authority.

### Gate 6D — Platform Operations Closure

Status: **UNSTARTED**.

- distributed rate limiting and coordination;
- bounded operational health, queue metrics, Admin operations views, alerts,
  and incident state;
- cross-gate staging, recovery, security, and Stage 6 closure evidence.

Gate 6B, Gate 6C, and Gate 6D must not begin before Gate 6A is independently
reviewed and merged.

## Gate 6A go/no-go decision

Decision: **GO**.

- Every later Stage 6 domain needs the same durable claim, lease, fencing,
  retry, schedule, idempotency, and operations foundation.
- No equivalent canonical platform queue exists. Communication delivery leases
  remain authoritative domain state and are not a reusable general queue.
- Jobs carry typed references only. Handlers must re-read accepted domain truth
  and current authorization/scope before applying effects.
- PostgreSQL is already the accepted durable production data store and can
  preserve job truth across process restarts without claiming an external
  provider.
- Production worker and automatic scheduler activation can remain truthfully
  `NOT_CONNECTED`; authorized bounded manual execution is sufficient for 6A.
- Gate 6A activates no storage, media, communication, payment, reconciliation,
  settlement, or rate-limit domain handler.

## Security boundary

- Job type, payload version, error code, schedule cadence, and handler mapping
  are closed server registries.
- Payloads are strict, bounded, reference-only, and reject secret-, URL-, VIN-,
  contact-, address-, payment-instrument-, command-, and module-shaped input.
- Current Admin access and explicit read/manage permissions are revalidated on
  every operation; actor and optional Organization scope are server-derived.
- Claims are atomic and bounded. Each lease has one unpredictable fencing token;
  stale heartbeats, completion, and failure application are rejected.
- Completion and mutation replays are exact or conflict; terminal state is
  immutable except an explicit permission-scoped requeue policy.
- Raw errors, exceptions, provider responses, credentials, authorization
  headers, signed URLs, and copied business/financial truth are never persisted
  or exposed.
- All list and execution operations are bounded, cursor-scoped, no-store, and
  auditable with safe metadata.

## Provider boundary

PostgreSQL is the canonical Gate 6A durable source of truth. Redis in local
Docker is not an accepted queue or distributed limiter. BullMQ, SQS, Cloud
Tasks, Vercel Cron, or another provider is not claimed. Production reports:

- durable store: `POSTGRESQL`;
- automatic scheduler: `NOT_CONNECTED`;
- always-on worker: `NOT_CONNECTED`;
- external queue provider: `NOT_CONFIGURED`;
- storage provider: `NOT_CONFIGURED`;
- payment provider: `NOT_CONFIGURED`.

## Web boundary

Gate 6A adds only a bounded Admin operations surface for safe job/schedule
metadata and guarded mutations. It adds no Customer or Business surface and no
broad visual redesign. Routes use current Next.js repository conventions,
server authority, signed domain-separated cursors, no-store behavior, strict
validation, stable errors, and safe localization where a UI is present.

## Mobile boundary

Gate 6A adds no Mobile API or UI. Mobile TypeScript, Expo Doctor, and Hermes
exports are regression evidence only. Physical-device QA remains Stage 7.

## Admin and operations boundary

Gate 6A may add distinct view/manage permissions and only these bounded
operations: list jobs, read safe detail, cancel eligible jobs, requeue eligible
failed/dead-letter jobs, manually trigger an allow-listed inert job, list and
enable/disable inert schedules, execute one worker batch, and execute one
scheduler tick. An operator cannot edit a payload, force success, bypass
attempts, select another tenant, run a command, fetch a URL, or mutate domain
truth directly.

## Migration policy

Gate 6A uses additive Migration 43 for the canonical job, attempt, schedule,
and mutation persistence. Remediation Migration 44 adds only durable
worker-operation lease/fencing and recovery fields/indexes required to close
the crash-recovery invariant. Migrations 1–43 are immutable. Neither migration
creates jobs, schedules, actors, mutations, or business rows. Fresh 1→44 must
pass twice; populated 43→44 must preserve existing Gate 6A and Stage 5 evidence;
a second deploy must be a no-op.

## Deployment and runtime assumptions

- Next.js 16 server routes/actions may perform one bounded manual batch but are
  not an always-on worker.
- Worker correctness cannot depend on process memory, sticky instances, or a
  single deployment.
- Database transactions and row locking own claims; fencing owns late-result
  rejection.
- Handler execution occurs outside the claim transaction and reapplies results
  only with the current lease token.
- Automatic invocation remains disconnected until a later gate accepts and
  authenticates a production runtime.

## Staging requirements

Staging must authenticate without printing credentials, select exact project
`rezno-staging` and database `rezno_staging`, start healthy at 43/43, apply only
migration 44, finish healthy at 44/44, and prove a second deploy is a no-op. A
direct non-pooler Neon URL, `verify-full`, authenticated expected host/role,
URL/current-user equality, an authorized client `TLSSocket`, system-CA and
hostname/SNI verification, TLS 1.2/1.3, direct non-loopback transport, and exact
reuse of the attested Pool/backend by Prisma are mandatory. Same-client
`pg_stat_ssl` remains diagnostic at the Neon proxy boundary rather than the sole
TLS authority. A
deterministic exact-ID fixture must run twice with one fingerprint and prove
single-winner claims, lease recovery, fencing, heartbeat ownership,
completion/retry/dead-letter, cancel/requeue, duplicate schedule suppression,
Admin scope, and truthful disconnected runtime. Exact cleanup must preserve all
foreign rows, its second pass must return zero, and the whole non-fixture data
fingerprint must remain unchanged.

## Closure requirements

Gate 6A closes only after migration rehearsal, focused and complete local
matrices, security review with no P0/P1/P2, real-staging fixture/smoke/cleanup,
exact-head Actions and Vercel, zero unresolved threads, independent review, and
merge. PR #100 must remain protected, physical-device QA must remain unclaimed,
and Gate 6B must remain unstarted.

Stage 6 closes only after Gates 6A, 6B, 6C, and 6D are independently accepted,
merged, and proven together. A merged Gate 6A does not complete Stage 6.

## Stage 7 boundary

Stage 7 owns physical-device behavior, camera/library/HEIC, hosted payment
handoff and deep-link return, poor-network and process-death recovery, signed
release builds, TestFlight/Play Store validation, and real provider receipt QA.

## Stage 8 boundary

Stage 8 owns broad visual redesign, final brand consistency, motion, and polish.

## AI boundary

AI work remains blocked until Stage 8 is fully reviewed, merged, and complete.
