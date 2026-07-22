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

Migrations 43 and 44 must deploy before any Gate 6A route is used. Migration 43 creates the durable platform model; Migration 44 makes worker-operation idempotency crash-recoverable. Neither creates schedules, jobs, attempts, or mutations. A build can safely deploy with no worker connection and all runtime truth remains `NOT_CONNECTED`. An accepted later runtime must use the same PostgreSQL claim/lease/fencing services; it must not introduce an in-memory second source of truth.

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

A `PROCESSING` worker mutation is not manually editable. Exact replay first revalidates current Admin authority. It returns bounded `PROCESSING` while the operation or its jobs are live, reclaims the operation after expiry, resumes a pre-claim crash, recovers only operation-owned expired attempts, or finalizes entirely from canonical terminal attempts. The original stored batch bound is never expanded. Operation and job tokens, generations, and worker identity are internal and must never be copied into an incident report or API response.

## Rollback

Application rollback is safe while no later gate depends on Migrations 43–44: old code ignores the additive tables/columns and permissions. Do not roll back migrations automatically or drop tables/columns containing operational evidence. If a severe code issue exists, disable Gate 6A routes/runtime, deploy the previous application, retain schema/data, and prepare a reviewed forward fix.

## Staging runbook

Use authenticated Neon discovery to obtain the ready primary branch's exact direct non-pooler host and role. Pass only those non-secret values as `REZNO_STAGE6_GATE6A_EXPECTED_DATABASE_HOST` and `REZNO_STAGE6_GATE6A_EXPECTED_DATABASE_ROLE`. The connection must target exact project/database `rezno-staging`/`rezno_staging`, use `sslmode=verify-full`, have a non-production `NODE_ENV`, `REZNO_ENV=staging`, and exact confirmation `REZNO_STAGE6_GATE6A_CONFIRM=REZNO_STAGE6_GATE6A_STAGING_ONLY`. Do not print the host, connection string, username, password, or credential in logs/reports.

The guard requires all proofs together: parseable PostgreSQL URL, exact database path, exact authenticated direct `.neon.tech` host, no `-pooler`, URL/current-role equality, authenticated expected-role equality, exactly one `sslmode=verify-full`, a pre-created one-client Pool with explicit system-CA `rejectUnauthorized: true` and exact SNI, and a successful client-side `TLSSocket` attestation. It also proves the Prisma adapter used that Pool and reused the exact backend identity observed by the attested node-postgres client. URL TLS parameters are not passed to node-postgres and therefore cannot replace the explicit SSL object. A remote session cannot bypass certificate, hostname, URL, host, role, database, or physical-client verification.

`pg_stat_ssl` is retained as a same-client backend diagnostic. `true` adds confirmation. `false` is accepted only when the full client proof succeeds, because Neon places its proxy in front of direct and pooled connections and terminates the verified client TLS boundary there. Never describe a successfully attested `TLSSocket` as plaintext. The only unencrypted exception is `NODE_ENV=test` plus explicit confirmation, exact loopback host, exact local database/role equality, and no remote/pooler target.

1. Confirm initial healthy 43/43 and Migration 44 absent.
2. Run canonical `prisma migrate deploy`.
3. Confirm 44/44, failed zero, rolled-back zero, then run deploy again for no-op.
4. Run `npm run seed:staging:platform-jobs-gate6a` twice; fixture and non-fixture fingerprints must match.
5. Run `npm run smoke:staging:platform-jobs-gate6a` once.
6. Run `npm run cleanup:staging:platform-jobs-gate6a` twice; the second removed count must be zero.
7. Confirm the non-fixture fingerprint remained identical through seed, smoke, and cleanup.

The fixture is scoped to the exact `6a000000-…` IDs and actor `rezno.qa.stage6.gate6a.admin`. Cleanup deletes mutations and attempts first, requeued children before roots, and then the exact schedule/actor/Organization records. The local-unencrypted override is enforced only for `NODE_ENV=test`, an exact loopback host, and the matching local database/role; it exists only to test the scripts against a disposable local PostgreSQL container and cannot authorize real staging.

## Prior Gate 6A staging evidence

The 2026-07-21 run established the historical 42→43 migration and fixture evidence below, but its guard allowed URL verification to substitute for `pg_stat_ssl=true`. That evidence remains useful as historical data proof but is not sufficient for the remediated staging/TLS gate. A new authenticated 43→44 run must satisfy the fail-closed contract above before PR #125 can become Ready.

Both exact-ID seed runs produced fixture fingerprint `260f58ac3c8fbbf9a2f62e68806a33c9a8dc9dd6c585fdf12d9c099f66816d17`. The smoke passed 38 checks and retained provider/runtime truth. The non-fixture fingerprint remained `51f91a54f3d34335477ad613342c374803a26d6b401271973f7cffa89613d2d2` through seed, smoke, and cleanup. Exact cleanup removed 23 fixture rows; the second cleanup removed zero, and final historical-data postflight retained the pre-migration fingerprint.

## 2026-07-22 verified transport preflight

Authenticated Neon CLI discovery resolved exactly one `rezno-staging` project, its ready primary branch, one direct non-pooler read/write endpoint, database `rezno_staging`, and the matching owner role. The generated client URL used `sslmode=verify-full`, and the URL host, URL role, authenticated endpoint, authenticated role, current database, and current user all matched without printing credentials or endpoint identity.

Probe A inspected the established node-postgres stream and proved a real `TLSSocket`, `encrypted=true`, `authorized=true`, no authorization error, TLS 1.3, a present/current peer certificate, successful Node hostname verification, exact socket SNI, direct port 5432, and non-loopback transport. Probe B supplied that same one-client Pool to `PrismaPg`, matched database/role/migration state, and proved reuse of the exact attested backend identity. Both reported healthy 43/43 and the same authenticated target. Local `psql`/libpq was unavailable, so Probe C is explicitly `UNAVAILABLE_NO_LOCAL_LIBPQ_BINARY` and is not substituted by provider tooling.

The same attested client returned `backendPgStatSsl=false`. This is consistent with the Neon proxy boundary and does not contradict the cryptographic client-socket evidence. Migration 44 remained absent during these non-mutating probes. The dependency security gate subsequently reached zero production advisories and only three accepted development-only Moderate P3 findings.

## 2026-07-22 authenticated staging closure

Canonical `prisma migrate deploy` applied only Migration 44 and advanced the authenticated target from healthy 43/43 to healthy 44/44 with zero failed or rolled-back migrations. The pre/post-migration non-fixture fingerprint remained `51f91a54f3d34335477ad613342c374803a26d6b401271973f7cffa89613d2d2`. A second canonical deploy found all 44 migrations and reported no pending migrations.

Both exact-ID seed runs produced the identical fixture fingerprint `260f58ac3c8fbbf9a2f62e68806a33c9a8dc9dd6c585fdf12d9c099f66816d17` and retained the same non-fixture fingerprint. The smoke passed 59 checks, including crash-recoverable worker-operation cases, and produced only scoped fixture changes. Exact cleanup then removed 35 fixture rows; the second cleanup removed zero. The final fingerprint postflight was healthy 44/44 and exactly matched the pre-migration non-fixture fingerprint. Every seed, smoke, cleanup, and fingerprint command repeated the same client TLS and Prisma physical-client attestation before database use.
