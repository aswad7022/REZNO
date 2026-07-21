# Gate 6A — Durable Jobs and Scheduling Foundation

## Decision and scope

Gate 6A is a GO. Accepted Stage 4 and Stage 5 closure evidence assigns multiple later automations to Stage 6, all of which need the same durable execution semantics. The repository had no canonical general-purpose durable queue, scheduler, lease, fencing, retry, or dead-letter model. Gate 6A therefore introduces that shared foundation without activating storage/media, communications, payment, or settlement automation.

The only registered job type is `PLATFORM_HEALTH_PROBE`. It is inert: it validates the foundation payload and returns bounded metadata. It does not read or mutate a business domain. A future handler containing a domain reference must re-read authoritative state and authorization; a payload is never evidence of identity, Organization scope, ownership, provider outcome, amount, inventory, or permission.

## Durable model

PostgreSQL is the canonical durable truth.

- `PlatformJob` is the one canonical job row.
- `PlatformJobAttempt` records one immutable claim generation and its terminal outcome.
- `PlatformJobSchedule` stores one closed schedule identity per scope.
- `PlatformJobMutation` stores actor-scoped Admin idempotency results.

Migration 43, `20260721160000_platform_jobs_foundation`, is additive and creates no data. Migrations 1–42 are unchanged.

The closed lifecycle is:

`SCHEDULED → AVAILABLE/CLAIMED → RUNNING → SUCCEEDED`

Retryable execution follows `RUNNING → RETRY_WAIT → CLAIMED`. Exhausted retryable work becomes `DEAD_LETTERED`; non-retryable failure becomes `FAILED`. Only `SCHEDULED`, `AVAILABLE`, and `RETRY_WAIT` may be cancelled. `FAILED` and `DEAD_LETTERED` may be requeued by creating a new job; the original terminal row is not reopened.

## Claims, lease, and fencing

Claims use one PostgreSQL data-modifying CTE with deterministic indexed ordering, `FOR UPDATE SKIP LOCKED`, and a bounded batch. The claim atomically:

1. selects due work by priority descending, availability ascending, and ID ascending;
2. increments attempt count and monotonic fencing generation;
3. creates a cryptographically random UUID lease token;
4. writes owner, expiry, heartbeat, and claim timestamps;
5. creates exactly one canonical attempt row.

The authority is the pair of an unpredictable lease token and the current monotonic fencing generation. Start, heartbeat, completion, and failure must match job ID, worker identity, lease token, fencing generation, active state, and unexpired lease. A stale generation or token cannot apply a result. An active unexpired lease is not claimable or recoverable.

Heartbeat extensions are at most 120 seconds and never move beyond 900 seconds from the original claim. Gate 6A does not expose a public heartbeat route; only server-owned worker code can call it, preventing client-driven write amplification.

Expired claims are recovered in bounded, locked batches. A recoverable attempt becomes `RETRY_WAIT`; an exhausted attempt becomes `DEAD_LETTERED`. The old attempt is closed as `LEASE_EXPIRED`, so its token and generation can never apply completion.

## Completion, failure, and retry

Success metadata passes the registered result schema, is limited to 2 KiB in both application and PostgreSQL, and is hashed. An exact completion replay returns the stored terminal result. A valid changed replay conflicts. Raw exceptions are converted to a closed safe code and are never persisted or returned.

Retryability belongs to the server registry, not a client. Backoff is bounded exponential delay with deterministic SHA-256-derived jitter:

- minimum 30 seconds;
- maximum 3,600 seconds;
- factor two before the cap;
- jitter between 0.8× and 1.2×;
- at most ten attempts;
- overflow-safe future timestamps.

The health handler may retry only `TRANSIENT_FAILURE`, `HANDLER_TIMEOUT`, and `HANDLER_EXCEPTION`. The handler contract carries a cancellation signal and has a 5-second timeout.

## Scheduling

The schedule key and mapping are closed to `PLATFORM_HEALTH_PROBE`. Cadence is 60–604,800 seconds. Catch-up is capped at ten jobs, and next-run advancement skips the rest of a missed interval range in one deterministic calculation. Each scheduled occurrence uses a server-generated deduplication key containing schedule ID and due timestamp, preventing duplicate work. Scheduler mutation is actor-idempotent.

Schedules are disabled when created by internal fixture/future-domain code. There is no Admin schedule-creation API. A current `PLATFORM_JOBS_MANAGE` grant is required to enable or disable an existing eligible schedule. Gate 6A exposes a bounded manual tick but connects no cron.

## Request and execution bounds

| Boundary | Value |
| --- | ---: |
| JSON request | 8,192 bytes |
| job payload | 4,096 bytes |
| safe result | 2,048 bytes |
| safe error-code field | 64 characters |
| list page | 50 |
| worker batch | 10 |
| scheduler batch | 10 |
| maximum attempts | 10 |
| lease duration | 30–300 seconds |
| default lease | 120 seconds |
| maximum lease horizon | 900 seconds |
| heartbeat extension | 120 seconds |
| retry delay | 30–3,600 seconds |
| schedule catch-up | 10 |
| manual requeues per root | 3 |
| handler execution timeout | 5,000 ms |

JSON reads are streamed and bounded by both declared and actual bytes, require exact JSON content type and valid UTF-8, and reject unknown fields. Payload schemas contain references only and reject arbitrary handler names, commands, module paths, URLs, credentials, headers, webhook bodies, payment instruments, VINs, contact data, and addresses.

## Admin foundation

Two explicit permissions are added:

- `PLATFORM_JOBS_VIEW`: list jobs/schedules and read safe detail.
- `PLATFORM_JOBS_MANAGE`: trigger the allow-listed health probe, cancel, requeue, change schedule state, run one bounded worker batch, and run one bounded scheduler tick. It depends on view permission.

Every service revalidates active Person identity, current Admin grant, expiry, permission, and environment-superadmin state inside the same serializable transaction that performs the read or mutation. Client values never select Organization scope, payload, handler, worker identity, success, attempts, or authority.

Admin list cursors are HMAC-SHA256 authenticated with HKDF domain separation, bind current Admin scope, filters, page size and list kind, and preserve all six PostgreSQL fractional digits. DTOs omit payload values/hashes, lease tokens, raw worker IDs, idempotency hashes, and raw errors. Owner/worker identities are fingerprints only.

## Runtime truth

- durable store: `POSTGRESQL`
- external queue provider: `NOT_CONFIGURED`
- automatic scheduler: `NOT_CONNECTED`
- always-on worker: `NOT_CONNECTED`
- Redis: local Docker service only, not connected to Gate 6A
- storage provider: `NOT_CONFIGURED`
- payment provider: `NOT_CONFIGURED`

The manual worker and scheduler endpoints run only one bounded operation inside the current Web runtime. They do not imply continuous processing, crash-free long execution, Redis, BullMQ, SQS, Cloud Tasks, Vercel Cron, bank payout, real upload, or real payment capability.

## Handoffs and non-goals

Gate 6B owns storage cleanup, rescans, and rendition orchestration. Gate 6C owns communication dispatch, verified provider-event processing, payment retry, reconciliation, and settlement-statement scheduling. Gate 6D owns distributed rate limiting, expanded metrics/dashboards, alerts, incidents, and Stage 6 closure. All remain unstarted.

Stage 7 retains physical-device and release QA. Stage 8 retains broad visual polish. AI remains deferred until after Stage 8. PR #100 remains a protected, unchanged Draft reference.
