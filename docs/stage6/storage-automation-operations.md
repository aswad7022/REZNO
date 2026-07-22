# Gate 6B Storage Automation Operations

## Runtime truth

Gate 6B persists storage/media work in PostgreSQL and executes it only through
the accepted bounded Gate 6A worker path. Production remains inert until a
later accepted runtime is connected:

- storage provider: `NOT_CONFIGURED`;
- malware scanner: `SCANNER_NOT_CONFIGURED`;
- automatic scheduler: `NOT_CONNECTED`;
- always-on worker: `NOT_CONNECTED`;
- external queue: `NOT_CONFIGURED`.

The deterministic adapter is non-persistent and may run only in tests or the
guarded staging fixture. It throws if selected under `NODE_ENV=production`.

## Discovery and exact-item work

`STORAGE_MAINTENANCE_DISCOVERY` selects, in deterministic due-time/UUID order,
at most 50 expired sessions and 50 unbound `DELETE_PENDING` assets. It may
expire a bounded set of active sessions, but it never calls a provider. It
creates only `STORAGE_ORPHAN_CLEANUP` and `STORAGE_ASSET_DELETE_RETRY` children
with exact IDs and expected row versions. Active bindings exclude asset
deletion. Unique job type/scope/deduplication keys suppress concurrent or
repeated discovery.

Orphan cleanup requires an exact `EXPIRED` session, no `StoredAsset`, at least
24 hours after expiry, a server-generated exact key, and an available or
expired canonical cleanup claim. Asset deletion requires exact
`DELETE_PENDING`, expected version, and no ACTIVE binding. Provider work occurs
outside the database transaction. `READY` deletion and confirmed `NOT_FOUND`
are success; timeout or uncertainty is retryable and cannot release quota.

`STORAGE_RESCAN_DISCOVERY` selects only stale-policy `QUARANTINED` assets. A
READY asset is never scheduled merely because time passed; an authorized Admin
must request its exact version. Rescan repeats HEAD, bounded read, checksum,
magic/MIME, static-raster limits, optional scanner, and second HEAD. The result
is committed only while job lease/fence, asset version, provider object
generation, and claim remain current.

If an inspection rejects a formerly READY source, rejection, ACTIVE binding
detachment, container version change, and rendition supersession commit in one
serializable transaction. Delivery therefore stops without resurrecting a
legacy URL.

## Manual operations

`GET /api/admin/storage/automation` exposes only safe runtime/registry truth.
The discovery and exact-rescan mutations require a current active Person, a
non-revoked Admin grant, both `STORAGE_RECORDS_MANAGE` and
`PLATFORM_JOBS_MANAGE`, a UUID idempotency key, and bounded strict JSON.
Operators cannot provide tenant ownership, provider, key, URL, checksum,
profile, result, lease, or worker authority.

Keep all four Gate 6B schedules disabled until a separately reviewed Gate 6D
runtime decision. Manual scheduler and worker batches are diagnostic bounded
operations, not cron replacements.

## Incident recovery

1. Keep automatic invocation disconnected and disable any later external
   trigger before investigation.
2. Inspect canonical job, attempt, domain state, lease expiry, and safe error
   code; never infer provider success from a timeout.
3. Let Gate 6A recover only an expired job lease. The item handler separately
   validates its domain claim and exact generation.
4. Confirm provider object state through the configured provider abstraction;
   never enumerate a bucket or delete a prefix.
5. Requeue only an eligible terminal job through the permission-scoped Gate 6A
   operation. Do not edit attempts, fencing generations, versions, claims, or
   quota state manually.

`PROVIDER_NOT_CONFIGURED`, stale reference, permanent inspection rejection,
and source/profile mismatch terminate without a hot loop. Provider
unavailability and timeout use bounded retry/backoff; exhausted attempts become
dead-letter evidence.

## Deployment, rollback, and staging

Migration 45 is additive and creates no jobs, schedules, sessions, assets,
renditions, bindings, actors, or provider state. An application rollback keeps
the schema and operational evidence: disconnect invocation, deploy the prior
application, retain Migration 45, and prepare a forward fix. Do not drop the
new columns/table or reverse enum values in an incident.

Staging uses exact database `rezno_staging`, the authenticated direct
non-pooler Neon endpoint, `sslmode=verify-full`, expected host/role
confirmations, and the Gate 6A client-side TLS/physical-Pool attestation. The
Gate 6B scripts additionally require exact confirmation
`REZNO_STAGE6_GATE6B_STAGING_ONLY` and healthy 45/45:

1. `npm run seed:staging:storage-media-gate6b` twice;
2. `npm run smoke:staging:storage-media-gate6b`;
3. `npm run cleanup:staging:storage-media-gate6b` twice;
4. `npm run fingerprint:staging:storage-media-gate6b`.

Both seeds must share one fixture fingerprint. The smoke must preserve the
non-fixture fingerprint and pre-existing foreign Person/Organization sentinel
hashes. The second cleanup must remove zero, the final non-fixture fingerprint
must equal the pre-migration value, and migrations must remain healthy 45/45.

The authenticated 2026-07-22 run satisfied this runbook: healthy 44/44→45/45,
Migration 45 checksum `bf1ca0d7…14389`, second deploy no-op, seed fingerprint
`98ade600…d768c6` twice, 64 Gate 6B checks, cleanup 58 then zero, and unchanged
non-fixture fingerprint `51f91a54…d2d2`. Gate 5A/5B/6A successor smokes passed
75/50/59 checks after bounded Prisma `P2028` transaction retry was added.

Communication/payment automation remains Gate 6C. Automatic runtime,
distributed coordination, alerts, incidents, and Stage 6 closure remain Gate
6D.
