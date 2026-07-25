# Gate 6D — Platform Operations Closure

Status: **ACTIVE**. Author-side implementation, local verification, migration
rehearsal, and authenticated staging evidence are recorded. Gate 6D and Stage 6
remain open until exact-head CI/Vercel, independent review, and merge.

## Baseline and scope

- Exact base: `38ec9e3d6bd9db56f46e515cccab5dd6301bc63e`, the merge of
  PR #127.
- Gates 6A–6C are accepted and merged.
- PR #100 remains an untouched Open Draft.
- Stage 7, Stage 8, AI, provider onboarding, physical-device QA, and broad
  redesign remain outside this gate.
- Migration 49 is additive and creates no rows. Migrations 1–48 remain
  immutable.

## Closed operations registry

Gate 6D closes Stage 6 with 23 job types and 13 one-to-one schedule keys. It
adds only:

- `COMMERCE_ORDER_EXPIRY`, using the accepted bounded canonical Commerce expiry
  service;
- `PLATFORM_OPERATIONS_MONITOR`, reconciling bounded safe observations;
- `DISTRIBUTED_RATE_LIMIT_CLEANUP`, deleting at most 500 expired buckets.

The automatic runtime uses the Gate 6A scheduler, worker, leases, attempts,
fencing, retry, and dead-letter truth. One invocation runs at most ten due
schedules and five claimed jobs. Provider-heavy handlers retain a 15-second
bound below the accepted lease. No Customer, Business, or ordinary Admin
request performs provider work inline.

## Distributed rate limiting

Production consumption is one atomic PostgreSQL upsert. A bucket stores only a
versioned HMAC-SHA-256 key, count, fixed-window timestamps, and TTL. The key
binds the operation, policy, and normalized caller/tenant identity. Raw IP,
session, authorization, contact, and user-agent values are not persisted.

`BETTER_AUTH_SECRET` is accepted only when strong enough, then domain-separated
with HKDF. Production never falls back to memory: unavailable PostgreSQL
returns a stable no-store 503, while exhaustion returns 429 and `Retry-After`.
Memory is bounded and development/test-only.

Vercel deployments use the platform-injected `x-vercel-forwarded-for`
identity. Other deployments must explicitly select a proven edge-overwritten
header. Chained or malformed addresses are rejected. A request without any
trusted peer or fingerprint uses a stable operation-scoped unidentified key;
it cannot obtain a new allowance on every request.

## Runtime connection truth

The accepted runtime transport is a default-branch GitHub Actions scheduled
workflow invoking one Next.js Route Handler with a short-lived OIDC token.
Verification binds issuer, RS256 signature, audience, subject, numeric
repository ID, repository, workflow path, scheduled event, main ref, time/JTI,
commit SHA, and the exact deployed Vercel SHA before body parsing or mutation.
Only hashes of JTI/ref/workflow and the safe repository SHA are persisted.

Runtime control is created disabled. Enable/disable changes a monotonic
generation, invalidating old invocations. Acquisition, scheduler, worker,
handler authority, result publication, and finalization all require the exact
control generation, invocation, worker, lease UUID, fence, state, and unexpired
database time.

Before this PR is merged to `main` and the exact runtime URL/control are
configured and observed, automatic scheduler and worker truth remains
`NOT_CONNECTED`. A disabled or enabled-but-never-successful control does not
report `CONNECTED`.

## Health, alerts, and incidents

The overview exposes capped aggregates for jobs, retry/dead-letter state,
leases, schedules, storage/media, communications, payment/reconciliation,
settlement generation, rate buckets, alerts, and incidents. Counts saturate at
100 and hydrate no domain payload. Provider truth remains:

- communications: `NOT_CONFIGURED`;
- payment: `NOT_CONFIGURED`;
- storage: `NOT_CONFIGURED`;
- external queue: `NOT_CONFIGURED`.

Alerts use one stable server-owned deduplication key and
`OPEN`/`ACKNOWLEDGED`/`RESOLVED` lifecycle. Incidents are one-to-one with their
source alert and use the same lifecycle. All mutations revalidate current
permissions inside a serializable transaction, require a UUID idempotency key
and optimistic version, and return only an allow-listed stored result.
Histories and mutation records are protected by append-only PostgreSQL
triggers.

Alert/incident cursors authenticate kind, Admin scope, filters, page size,
snapshot, exact PostgreSQL microseconds, UUID continuation, and a
domain-separated HMAC. Detail DTOs validate the exact safe
`{count, saturated}` observation shape before returning it.

## Admin boundary

`PLATFORM_OPERATIONS_VIEW` permits the no-store overview, safe alert/incident
lists and detail. `PLATFORM_OPERATIONS_MANAGE` depends on view and permits
runtime control plus alert/incident lifecycle. Schedule bootstrap additionally
requires current `PLATFORM_JOBS_MANAGE`; the UI hides job controls and links
without their exact permission.

The Admin page renders the distributed backend/availability/fail mode,
communications/payment/storage provider truth, runtime state and observed
connection truth, safe metrics, alerts, and incidents directly from the server
data layer. It performs no internal HTTP round trip and exposes no credentials,
tokens, leases, raw payloads, or provider responses.

## Rollback

Disable runtime first, then disable affected schedules. Deploying prior code
retains the additive schema and durable evidence. Never reverse enum values or
edit jobs, claims, attempts, fences, alerts, incidents, histories, posted
journals, or provider references manually.

Migration rollback is not automatic. Migration 49 creates no actor, schedule,
job, rate bucket, runtime control, alert, incident, provider, business, or
financial row.
