# Gate 6B — Storage and Media Automation

Status: **ACTIVE / IMPLEMENTATION IN PROGRESS**. Acceptance requires an
independent review and merge. This document must not describe Gate 6B as
accepted while its pull request is Draft.

## Verified baseline

- Repository: `aswad7022/REZNO`.
- Exact base: `e30c51468cc93388e210f636cadc1b097e481ebf`.
- PR #125: closed and merged from exact head
  `c7f0f8a99eb27bf0dcc5fa853275e13963868ad5`; its merge commit is the exact
  Gate 6B base.
- Repository and staging baseline: 44 migrations before Migration 45.
- PR #100: protected Open Draft at
  `e46454df993ecccb06180060dda4353ec88e2641`.
- Production storage provider: `NOT_CONFIGURED`.
- Malware scanner: `SCANNER_NOT_CONFIGURED`.
- Automatic scheduler and always-on worker: `NOT_CONNECTED`.
- Gate 6C, Gate 6D, Stage 7, Stage 8, and AI work are not started here.

## Objective and authority

Gate 6B connects the accepted Gate 5A storage and Gate 5B media models to the
accepted Gate 6A durable-job lifecycle. PostgreSQL remains the durable
coordination authority. `UploadSession`, `StoredAsset`, `MediaContainer`, and
`MediaBinding` remain the business authority. Job payloads are strict internal
references and never authority for ownership, tenant, provider, object key,
URL, checksum, MIME, bytes, rendition dimensions, or authorization.

Every exact-item handler reloads its canonical row and source generation. It
does provider work outside long database locks, then locks and revalidates the
row, current platform lease/fencing generation, and source/binding generation
before committing a result.

## Closed job registry

Gate 6B adds exactly these types:

| Job type | Payload authority | Purpose |
| --- | --- | --- |
| `STORAGE_MAINTENANCE_DISCOVERY` | bounded `batchSize` only | find due expired sessions and `DELETE_PENDING` assets |
| `STORAGE_ORPHAN_CLEANUP` | exact `uploadSessionId` and expected version | delete only the canonical retained orphan key |
| `STORAGE_ASSET_DELETE_RETRY` | exact `assetId` and expected version | retry only a canonical `DELETE_PENDING` asset |
| `STORAGE_RESCAN_DISCOVERY` | bounded `batchSize` only | find explicitly eligible rescan rows |
| `STORAGE_ASSET_RESCAN` | exact `assetId` and expected version | rerun the accepted inspection policy over one source generation |
| `MEDIA_RENDITION_DISCOVERY` | bounded `batchSize` only | find active READY sources lacking their server-selected profile |
| `MEDIA_RENDITION_GENERATE` | exact source asset/version and closed profile | generate one immutable rendition generation |
| `MEDIA_RENDITION_CLEANUP_DISCOVERY` | bounded `batchSize` only | find exact stale/deletion-pending renditions |
| `MEDIA_RENDITION_DELETE` | exact rendition ID and expected version | delete one derived object without touching its original |

Payloads contain UUID references, positive versions, a bounded batch, or one
closed profile only. They contain no Person/Organization owner ID, object key,
provider selection, URL, checksum, signed target, file bytes, arbitrary size,
command, module, contact data, VIN, address, or payment data.

## Closed schedule registry

Gate 6B adds four platform-scoped schedule keys, each mapped one-to-one to its
discovery job:

- `STORAGE_MAINTENANCE_DISCOVERY`;
- `STORAGE_RESCAN_DISCOVERY`;
- `MEDIA_RENDITION_DISCOVERY`;
- `MEDIA_RENDITION_CLEANUP_DISCOVERY`.

Schedules are created only by guarded fixture/operator code, never by Migration
45 or a public API, and always start disabled. Gate 6B does not connect Vercel
Cron, an external queue, or an always-on worker. An authorized manual scheduler
tick and worker batch remain the only connected runtime.

## Bounded discovery and deduplication

Discovery uses indexed due-state ordering with UUID tie-breakers and a maximum
batch of 50 domain candidates. Candidate selection is bounded and locked with
`FOR UPDATE SKIP LOCKED` or an equivalent conditional update. It enqueues only
exact IDs and expected generations. Item deduplication keys bind the immutable
resource ID, source version, action, and profile when applicable. No provider
call, bucket listing, object-prefix enumeration, or image processing occurs
inside discovery or a long row-lock transaction.

## Cleanup and deletion policy

- Active sessions are expired only in a bounded batch.
- Orphan cleanup requires an `EXPIRED` session, no `StoredAsset`, retention of
  at least 24 hours, and a canonical exact object key already stored on that
  session.
- `NOT_FOUND` is confirmed absence and may complete cleanup. Timeout or other
  uncertainty is never treated as success.
- A `DELETE_PENDING` asset is eligible only when no ACTIVE media binding exists.
- Persistent purpose quota is released only after provider-confirmed deletion
  or confirmed absence changes the asset to `DELETED`.
- Claims expire after 15 minutes and are conditional on the exact item/version.
- No operation accepts a provider, bucket, prefix, key, URL, or owner from a
  request or job payload.

## Rescan policy

Manual exact rescan accepts one `assetId`, positive `expectedVersion`, and UUID
idempotency key from a current Admin holding both `STORAGE_RECORDS_MANAGE` and
`PLATFORM_JOBS_MANAGE`. Automated discovery selects only `QUARANTINED` assets
whose inspection-policy version is stale. A READY asset can be rescanned only
through the explicit Admin operation; READY rows are not churned automatically.

The handler reuses Gate 5A's HEAD, bounded GET, checksum, MIME, static-raster,
pixel/animation/polyglot, scanner, second-HEAD, and immutable-version checks.
Provider/scanner uncertainty quarantines or retries according to its closed
classification; it never fabricates CLEAN. If a rescan rejects a previously
READY asset, the asset rejection and detachment of its ACTIVE binding/container
occur atomically so delivery stops immediately. A detached legacy URL never
resurrects after canonical slot history exists.

## Persistent rendition policy

The three server-owned immutable WebP profiles are:

| Profile | Maximum box | Use |
| --- | --- | --- |
| `AVATAR_256_WEBP` | 256 × 256 | private Customer avatar |
| `CARD_640_WEBP` | 640 × 640 | logos and compact Service/Menu media |
| `HERO_1600_WEBP` | 1600 × 1600 | covers, gallery, Product and larger detail media |

The profile is derived from the current ACTIVE `MediaBinding.slot`; a client
cannot select it. Sharp 0.35.3 performs bounded decode, EXIF orientation,
inside-box resizing without enlargement, deterministic WebP encoding, and no
metadata carry-over. Outputs have fixed format/quality/effort, bounded pixels
and bytes, and no EXIF/GPS/ICC/comment data.

`MediaRendition` binds one source `StoredAsset`, source asset version, source
checksum, source provider-object version, and profile. The unique identity is
source asset + source version + profile. Its immutable output key is generated
server-side from that identity and written once. READY requires a verified
provider HEAD matching output size, MIME, checksum, and object version. A stale
platform fencing generation or changed source/binding cannot publish.

The stable `/media/<assetId>` and authenticated avatar/Business delivery paths
remain unchanged. Authorization is checked before and after provider target
creation. Delivery selects a READY rendition only for the current exact source
generation/profile; otherwise it safely falls back to the READY original.
Rejected, detached, deleted, stale, or mismatched renditions are never served.

Rendition cleanup operates only on an exact rendition ID/key in
`DELETE_PENDING` or a server-marked superseded generation. It cannot delete the
source object and does not affect Gate 5A purpose quotas.

## Retry and terminal classification

- `TRANSIENT_FAILURE`, provider timeout/unavailability, and retryable handler
  timeout use Gate 6A bounded backoff and attempt limits.
- `NOT_CONFIGURED`, invalid/stale references, ineligible state, checksum/MIME
  mismatch, unsafe source, profile mismatch, and provider permanent failure are
  non-retryable terminal outcomes. Configuration absence never creates a hot
  loop.
- Lease expiry is recovered only through Gate 6A; domain publication also
  checks the current job lease token and fencing generation.
- Exhausted retryable work is dead-lettered. A terminal row is not silently
  reopened.

## Admin and HTTP boundary

Gate 6B adds a no-store safe status response plus strict, bounded Admin routes
for allow-listed discovery and one exact asset rescan. Both current permissions
are checked before enqueue and again transactionally. Bodies are streamed and
bounded; unknown/duplicate fields and query parameters fail closed. Responses
contain safe IDs, state, version, counts, profile names, and runtime truth only.
They never expose object keys, provider object versions, checksums, signed URLs,
credentials, raw errors, claim tokens, or fencing authority.

## Migration policy

Exactly one additive Migration 45 may add the closed enums, rendition model,
inspection-policy/rescan fields, foreign keys, checks, and due-state indexes.
It creates no jobs, schedules, renditions, assets, sessions, bindings, orders,
actors, Organizations, or provider state. Migrations 1–44 are immutable.

## Staging, rollback, and recovery

Staging starts at the authenticated healthy 44/44 state, uses the accepted
direct non-pooler client-side TLS/physical-Pool attestation, records the whole
non-fixture fingerprint, applies only Migration 45, and finishes healthy 45/45
with a second deploy no-op. The exact-ID fixture runs twice with one fingerprint;
the bounded smoke exercises cleanup, rescan, rendition and Gate 5A/5B/6A
regressions; exact cleanup runs twice and preserves foreign sentinel hashes and
the original database fingerprint. Operational detail is in
`storage-automation-operations.md`, `media-rendition-operations.md`,
`gate6b-security.md`, and `gate6b-test-plan.md`.

Application rollback disconnects invocation and deploys the previous code while
retaining the additive schema and all job/domain evidence. Migrations and enum
values are not reversed automatically. Recovery uses only expired Gate 6A
leases, canonical item-claim revalidation, exact provider state, and authorized
bounded requeue; no operator edits rows or assumes timeout means success.

## Completion criteria

Gate 6B requires complete local matrices, two fresh and one populated migration
rehearsal, real-staging TLS/migration/fixture/smoke/cleanup evidence, production
audit zero, explicit classification of any development-only advisory, no open
P0/P1/P2, exact-head Actions and Vercel success, zero unresolved review threads,
independent review, and merge. Until then it remains ACTIVE and its PR remains
Draft.

## Current evidence

Local validation passed 7 focused unit, 434 complete unit, 14 focused
PostgreSQL, 385 complete PostgreSQL, 6 focused built-server HTTP, and 114
complete HTTP tests. Build, Mobile TypeScript, Expo dependency/Doctor, and both
Hermes exports passed. Two fresh 1→45 rehearsals and a populated 44→45 rehearsal
passed without data drift. Authenticated staging reached healthy 45/45, ran two
identical seeds, passed 64 Gate 6B checks and 75/50/59 Gate 5A/5B/6A successor
checks, removed 58 fixture rows then zero, and retained non-fixture fingerprint
`51f91a54f3d34335477ad613342c374803a26d6b401271973f7cffa89613d2d2`.
Exact-head CI, Vercel, review threads, independent review, and merge remain
pending, so Gate 6B is not accepted.

## Explicit non-goals

Gate 6B does not implement communication/payment automation, provider webhooks,
distributed rate limiting, alerts/incidents, broad platform dashboards, a real
storage/scanner provider, cron, an always-on worker, physical-device QA, Gate
6C/6D, Stage 7/8, or AI. It does not mark its PR Ready and does not merge it.
