# Platform Jobs Operations

## Operator surface

The Admin page at `/admin/platform-jobs` presents safe recent jobs, schedules, and explicit runtime truth. `/admin/platform-jobs/[jobId]` presents bounded lifecycle metadata and attempt fingerprints. The underlying Admin APIs are:

- `GET /api/admin/platform-jobs/jobs`
- `GET /api/admin/platform-jobs/jobs/{jobId}`
- `POST /api/admin/platform-jobs/jobs/trigger`
- `POST /api/admin/platform-jobs/jobs/{jobId}/cancel`
- `POST /api/admin/platform-jobs/jobs/{jobId}/requeue`
- `GET /api/admin/platform-jobs/schedules`
- `POST /api/admin/platform-jobs/schedules/{scheduleId}/state`
- `POST /api/admin/platform-jobs/worker/run`
- `POST /api/admin/platform-jobs/scheduler/tick`

Mutation bodies require a UUID `idempotencyKey`; versioned operations also require the currently displayed positive `expectedVersion`. The manual trigger accepts only `PLATFORM_HEALTH_PROBE`. Worker and scheduler batches are 1–10.

All JSON responses use `Cache-Control: no-store, max-age=0`. Operators must not use these routes as a continuous worker or cron replacement.

## Operational interpretation

`AVAILABLE` and due `SCHEDULED`/`RETRY_WAIT` rows are claimable. `CLAIMED` means an unstarted current lease exists. `RUNNING` means the current attempt started. A lease expiry is not proof that underlying domain work did or did not occur; a future domain handler must use authoritative idempotent domain mutation semantics in addition to platform fencing.

`FAILED` is a non-retryable terminal result. `DEAD_LETTERED` means retryable execution exhausted its attempts or lease recovery exhausted them. Requeue creates a new durable row and retains the failed original. At most three descendants may be created per root.

Cancellation affects queued states only. It cannot interrupt or declare an active attempt successful. If cancel races a claim, the PostgreSQL lock order gives one winner.

## Deployment model

Migration 43 must deploy before any Gate 6A route is used. A build can safely deploy with no worker connection: the migration creates no schedules or jobs and all runtime truth remains `NOT_CONNECTED`. An accepted later runtime must use the same PostgreSQL claim/lease/fencing services; it must not introduce an in-memory second source of truth.

For production incidents, first disable the external trigger/runtime if one is later connected, then inspect status/lease distributions read-only. Do not edit job rows by hand. Use authorized cancel/requeue only after identifying authoritative domain consequences.

## Monitoring foundation

Gate 6A stores the timestamps and indexed states needed for later metrics:

- queued work by status, priority, and `availableAt`;
- active leases and expiry;
- attempt outcomes and safe error codes;
- schedule enablement and next run;
- actor mutation history;
- retry and requeue counts.

Gate 6A does not connect alerts, telemetry export, or an expanded queue dashboard. Those belong to Gate 6D.

## Recovery and disaster recovery

PostgreSQL backup/restore covers jobs, attempts, schedules, and Admin mutation evidence together. After a database restore:

1. keep automatic workers and cron disconnected;
2. confirm schema and migration state is exactly healthy;
3. compare restored job/attempt counts and constraints;
4. recover only expired leases through the bounded recovery path;
5. inspect potentially external side effects in authoritative domains before requeue;
6. reconnect an accepted runtime only after a manual health probe succeeds.

Never reset attempt counts, fencing generations, dedupe keys, or terminal rows manually.

## Rollback

Application rollback is safe while no later gate depends on Migration 43: old code ignores the additive tables and permissions. Do not roll back the migration automatically or drop tables containing operational evidence. If a severe code issue exists, disable Gate 6A routes/runtime, deploy the previous application, retain schema/data, and prepare a reviewed forward fix.

## Staging runbook

Use an encrypted connection to exact project/database `rezno-staging`/`rezno_staging`, a non-production `NODE_ENV`, `REZNO_ENV=staging`, and exact confirmation `REZNO_STAGE6_GATE6A_CONFIRM=REZNO_STAGE6_GATE6A_STAGING_ONLY`. Do not print connection strings or credentials.

1. Confirm initial healthy 42/42 and Migration 43 absent.
2. Run canonical `prisma migrate deploy`.
3. Confirm 43/43, failed zero, rolled-back zero, then run deploy again for no-op.
4. Run `npm run seed:staging:platform-jobs-gate6a` twice; fixture and non-fixture fingerprints must match.
5. Run `npm run smoke:staging:platform-jobs-gate6a` once.
6. Run `npm run cleanup:staging:platform-jobs-gate6a` twice; the second removed count must be zero.
7. Confirm the non-fixture fingerprint remained identical through seed, smoke, and cleanup.

The fixture is scoped to the exact `6a000000-…` IDs and actor `rezno.qa.stage6.gate6a.admin`. Cleanup deletes mutations and attempts first, requeued children before roots, and then the exact schedule/actor/Organization records. The local-unencrypted override exists only to test the scripts against a disposable local PostgreSQL container and must never be used for real staging.
