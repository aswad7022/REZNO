# Gate 5A — Managed storage and secure upload foundation

Status: architecture, implementation, local validation, and real-staging migration proof complete; final immutable-head checks remain pending.

Baseline: `origin/main` at `84da8d87b2b9a5676fe1b77cc015a31c46246849`, 38 repository migrations, and real staging at 38/38 before this gate. PR #120 is merged at this baseline. PR #100 remains an untouched, open Draft at `e46454df993ecccb06180060dda4353ec88e2641`.

## Scope and boundaries

Gate 5A owns the provider-neutral storage domain: canonical asset identity, direct-upload sessions, policy, integrity inspection, quotas, access issuance, soft deletion, bounded manual cleanup, Admin visibility, and deterministic test/staging adapters. It does not replace or connect the existing product image URL fields.

Gate 5B owns every product-facing integration and migration: avatars, Business logo/cover/gallery, Service and menu images, Store branding, Product media, ordering/replacement, transformations/thumbnails, Web/Mobile pickers, and legacy URL migration. Gate 5C remains unstarted and owns payments. Gate 5D remains unstarted and owns Stage 5 integrated closure. Stage 6 owns scheduled workers, queues, distributed limits, provider webhooks, and automatic cleanup/rescans. Stage 7 owns physical-device, camera/library, HEIC, signed-release, and poor-network QA.

No message/campaign attachments, documents, video, audio, GIF, SVG, archives, executables, arbitrary public hosting, URL import, remote fetch, upload-body proxy, base64 upload, automatic worker, or payment work is introduced here.

## Architecture audit

### Existing file and media inventory

All current media values are raw, nullable URL strings unless noted. There is no canonical provider key, asset owner, lifecycle, checksum, or storage identity attached to any of them.

| Domain/model | Field | Shape and current meaning |
| --- | --- | --- |
| Better Auth `User` | `image` | nullable raw external image URL; mirrored by profile update/provisioning |
| `Person` | `avatarUrl` | nullable raw external image URL |
| `BusinessProfile` | `logoUrl`, `coverImageUrl`, `ogImageUrl` | nullable raw external image URLs |
| `BusinessProfile` | `galleryUrls` | raw external image URL array |
| `BusinessProfile` | `website`, `googleMapsUrl`, social URL fields | user-supplied non-file external URLs |
| `Service` | `imageUrl` | nullable raw external image URL |
| `OrganizationMember` | `photoUrl` | nullable raw external image URL |
| `MenuItem` | `imageUrl` | nullable raw external image URL |
| `Store` | `logoUrl`, `coverImageUrl` | nullable raw external image URLs |
| `ProductMedia` | `url` | required raw external URL; `mediaType` permits legacy `IMAGE`/`VIDEO`, while current merchant creation writes `IMAGE` |
| `Order` | `storeLogoUrlSnapshot` | historical raw URL snapshot; deliberately immutable by Gate 5A |
| `OrderItem` | `imageUrlSnapshot` | historical raw URL snapshot; deliberately immutable by Gate 5A |

`Organization`, `Branch`, `Product`, `Review`, `Booking`, `Notification`, `Message`, and `CommunicationCampaign` have no direct file/attachment field. A Product reaches images through `ProductMedia`; an employee reaches a photo through `OrganizationMember.photoUrl`. No receipt/document/attachment/blob/object-key field exists.

There is no stored base64 file value, relative storage path, provider key, object bucket, upload reference, signed URL, or placeholder binary column in the audited production schema.

### Production write paths

- `features/profile/actions/update-profile.ts` accepts an `avatarUrl` text field and writes Better Auth `User.image` plus `Person.avatarUrl`.
- `features/business/actions/update-business-profile.ts` accepts `logoUrl`, `coverImageUrl`, `galleryUrls`, and `ogImageUrl` text fields and writes `BusinessProfile`.
- Business Operations Service actions and `features/business-operations/services/service-catalog.ts` write `Service.imageUrl`.
- Business Operations workforce services write `OrganizationMember.photoUrl`.
- Restaurant management actions/services write `MenuItem.imageUrl`.
- Commerce Store profile services write `Store.logoUrl` and `Store.coverImageUrl`.
- `features/commerce/services/merchant-product-service.ts` creates/updates/reorders/deletes `ProductMedia` rows whose `url` is supplied by the merchant; deletion removes only the database row because no managed object exists.
- Checkout copies sanitized current URLs into Order/OrderItem snapshot fields. Those are historical reads/writes, not managed storage ownership.
- Identity provisioning may copy Better Auth `User.image` into `Person.avatarUrl`.

These paths accept bounded HTTPS image URLs and do not upload bytes. Gate 5A leaves them unchanged.

### Production read paths

Current URLs are read in profile forms, Business public/management views, public marketplace and mobile marketplace DTOs, public Business cards and metadata, staff profiles, Favorites, Booking and Restaurant catalog DTOs, Store/Admin commerce DTOs, product/order DTOs, and checkout snapshot creation. Public-facing marketplace and commerce output commonly applies `safePublicImageUrlOrNull`; several legacy internal/catalog DTOs return the stored string and rely on the validated writers.

Next Image is configured with an HTTPS wildcard remote pattern. `lib/security/public-image-url.ts` rejects credentials, literal IPs, single-label hosts, localhost, and common private DNS suffixes. It does not resolve DNS at write time, pin provider hosts, or establish object ownership. Next Image adds resolved-address protections when it fetches an image. Remaining risk is provider-independent remote-host reliance and possible DNS/rebinding/availability behavior; Gate 5A eliminates remote fetching from its own protocol but Gate 5B must decide how to retire legacy URL inputs.

### Upload/provider audit

- No production Route Handler calls `request.formData()` or `request.arrayBuffer()` for file upload.
- No Server Action treats a `FormData` value as `File`/`Blob`; current Server Actions parse text fields only.
- No mobile upload function, file picker, image manipulator, base64 upload, multipart route, remote URL import, presigned upload, or server-side URL fetch exists.
- No Vercel Blob, AWS S3, R2, Supabase Storage, Firebase Storage, MinIO, UploadThing, Cloudinary, or ImageKit client/configuration is present.
- No production storage provider environment-variable name or configured-provider evidence exists. Credentials were checked only for presence by name and never printed; no supported storage credential name is configured in repository code.
- No signed upload/download implementation, CDN storage configuration, bucket policy, provider cleanup, orphan cleanup, or object-listing operation exists.
- No object-key or original-file-name policy exists because no objects are managed.
- `sharp@0.34.5` is already installed transitively by Next 16.2.9, but is not a direct application dependency. No ImageMagick, Squoosh, MIME/magic library, checksum library, antivirus adapter, Expo Image Picker, or Expo Image Manipulator is declared. Gate 5A may make `sharp` direct because safe structural raster decoding is a required server capability and the exact compatible package is already present.

### Existing security building blocks

- Session-derived `Person` identity: `features/identity/server.ts`.
- Active Business is cookie-selected only among active memberships whose Role belongs to the same Organization. Production storage services must repeat membership/Role validation transactionally, not trust the rendered/cookie context.
- Organization management policy permits `OWNER`/`MANAGER`; `RECEPTIONIST`/`STAFF` are denied storage management.
- Admin access supports env super-admin and database grants with status/expiry and normalized permissions. Gate 5A adds explicit storage view/manage permissions and revalidates them in authoritative transactions.
- Existing domains provide UUID idempotency ledgers, request hashes, optimistic timestamps, serializable transactions, redacted `AdminAuditLog`, stable domain errors, process-local rate limiting, and staging database/marker guards.
- Stage 4 provides HMAC-SHA-256 cursor envelopes derived from `BETTER_AUTH_SECRET` through HKDF, fixed snapshots, lossless PostgreSQL microsecond timestamps, strict envelopes, scope/filter/page-size binding, and `(createdAt,id)` tuple ordering. Storage uses distinct signing domains.
- Environment logs use bounded metadata, but legacy URL values can still reveal remote paths if a caller logs them. Storage audit metadata must never contain object keys, checksums, filenames, signed URLs, authorization headers, contents, bucket names, or raw provider errors.

### Existing controls and gaps

| Control | Before Gate 5A |
| --- | --- |
| Accepted media | writer-specific HTTPS URL validation; product media is a safe public URL |
| Filename/key validation | none; no managed files/keys |
| MIME/size/magic/checksum | none |
| Decode/dimensions/animation/bomb defense | none |
| Public/private/internal policy | none; all usable media fields represent public URLs |
| Tenant ownership | URL row belongs indirectly to its domain record; no file ownership |
| Quarantine/inspection | none |
| Signed URL | none |
| Deletion | database URL removal only; no provider object cleanup |
| Orphan/session expiry | none |
| Storage quotas | none |
| Duplicate/partial/stale upload handling | none |
| CDN/provider status | none configured |

The legacy surface does not create path traversal or bucket escape because it has no filesystem/provider keys, but it has no defenses suitable for future managed objects. Base64 memory amplification and multipart oversized-body risk are absent because those inputs do not exist; Gate 5A continues to reject them and limits JSON body length. SVG/GIF/polyglot stored-XSS and decompression bombs become relevant only at byte inspection and are denied by format plus decoding policy. Arbitrary URL import and SSRF are explicitly excluded.

### Migration and indexes decision

Migration 39 is required. It adds `StoredAsset`, `UploadSession`, and `StorageMutation` plus storage enums and relations. Migrations 1–38 and legacy media fields remain untouched; there is no data backfill and no migration 40.

Required indexes cover:

- owner/scope asset pagination: `(ownerPersonId, createdAt, id)` and `(organizationId, createdAt, id)`;
- purpose/owner active-asset quota and lookup;
- Admin status/purpose/created pagination;
- actor/Organization session pagination;
- active session and pending-byte quota predicates;
- daily created/finalized quota windows;
- expired-session scan `(state, expiresAt, id)`;
- delete-pending retry `(state, deleteRequestedAt, id)`;
- provider/object uniqueness and exact session-to-asset uniqueness;
- actor/idempotency uniqueness for mutation replay, with action included in the authenticated request hash.

## Canonical design

### Terms and ownership

`StoredAsset` is the sole canonical managed object identity. `UploadSession` authorizes one direct upload and produces at most one asset. `StorageMutation` is the exact operation ledger. No parallel File/Blob/Media/Attachment model is added.

Every session/asset is exactly one of:

- Person-owned: `ownerPersonId` equals the authenticated active Person, with no Organization owner.
- Organization-owned: `organizationId` equals the current active Business and the current membership/Role is revalidated; Owner/Manager only.
- platform-internal: no Person/Organization owner and explicit storage Admin management permission.

The actor who created the record is retained separately for audit. Client payloads never include owner IDs, Organization IDs, Role IDs, permissions, provider, object key, bucket, or visibility.

| Scope | Identity source | Legal mutation actors | Current revalidation | Delivery |
| --- | --- | --- | --- | --- |
| Person | session-derived active `Person` | the same Customer Person | Person/User binding, active/onboarded/non-deleted state | PRIVATE only |
| Organization | active-Business membership | current Owner or Manager | Person, membership ID, Role ID/system role, Organization status, and tenant relation under row-share locks | PUBLIC-capable purposes only after READY |
| platform-internal | current Admin identity | storage-manage Admin | Person plus current env/database grant, status, expiry, and permission | INTERNAL; storage-view Admin only |

Admin visibility does not impersonate an owner: storage-view may inspect safe metadata, storage-manage may reject records and operate bounded cleanup, and private Customer/Business download remains unavailable to Admin.

### Purpose registry

The registry is server-only and rejects unknown strings. The initial matrix is:

| Purpose | Owner/actors | Visibility | MIME | Max bytes | Max active assets | Later owner |
| --- | --- | --- | --- | ---: | ---: | --- |
| `CUSTOMER_AVATAR` | Person/customer | PRIVATE | JPEG/PNG/WebP | 5 MiB | 5 | Gate 5B |
| `BUSINESS_LOGO` | Organization Owner/Manager | PUBLIC | JPEG/PNG/WebP | 5 MiB | 5 | Gate 5B |
| `BUSINESS_COVER` | Organization Owner/Manager | PUBLIC | JPEG/PNG/WebP | 10 MiB | 5 | Gate 5B |
| `BUSINESS_GALLERY_IMAGE` | Organization Owner/Manager | PUBLIC | JPEG/PNG/WebP | 10 MiB | 24 | Gate 5B |
| `SERVICE_IMAGE` | Organization Owner/Manager | PUBLIC | JPEG/PNG/WebP | 10 MiB | 50 | Gate 5B |
| `STORE_LOGO` | Organization Owner/Manager | PUBLIC | JPEG/PNG/WebP | 5 MiB | 5 | Gate 5B |
| `STORE_COVER` | Organization Owner/Manager | PUBLIC | JPEG/PNG/WebP | 10 MiB | 5 | Gate 5B |
| `PRODUCT_IMAGE` | Organization Owner/Manager | PUBLIC | JPEG/PNG/WebP | 10 MiB | 120 | Gate 5B |
| `RESTAURANT_MENU_IMAGE` | Organization Owner/Manager | PUBLIC | JPEG/PNG/WebP | 10 MiB | 120 | Gate 5B |
| `INTERNAL_STORAGE_TEST` | storage Admin/system | INTERNAL | JPEG/PNG/WebP | 1 MiB | 50 | Gate 5A diagnostics |

All allowed images require structural inspection. Public permission means only that a later READY asset may receive public delivery; it does not make an uninspected object public.

### Lifecycle

Asset states are `PENDING_UPLOAD`, `UPLOADED`, `PENDING_INSPECTION`, `READY`, `QUARANTINED`, `REJECTED`, `DELETE_PENDING`, and `DELETED`. Finalization records and inspects the uploaded object. Structurally valid static raster images become READY even when an optional malware scanner reports `SCANNER_NOT_CONFIGURED`; this is truthful because READY means the currently required policy passed, not that the file is virus-free. Invalid or undecodable content becomes REJECTED; inspection/provider uncertainty becomes QUARANTINED. QUARANTINED, REJECTED, DELETE_PENDING, and DELETED are never deliverable.

Session states are `CREATED`, `TARGET_ISSUED`, `UPLOADED`, `FINALIZED`, `ABORTED`, `EXPIRED`, and `FAILED`. A session has immutable expected MIME/size/checksum, provider/object identity, expiry, version, and one optional asset. Expired/aborted/finalized sessions cannot issue/finalize again. Exact replay returns the original result; changed reuse conflicts.

### Object keys and filenames

Keys are server-generated as `environment/purpose/opaque-owner-scope/random-uuid`. Both owner scope and final component are random UUIDs, so public URLs expose no Person/Organization identifiers. The environment and purpose are registry values. Original names are bounded to 180 characters, strip controls/path separators, normalize whitespace, and exist only as an optional display label. They never enter keys or audit logs. Keys reject `..`, backslashes, empty components, client prefixes, and anything outside the exact generated namespace.

### Provider truth and adapter

One server-only adapter implements `createUploadTarget`, `headObject`, `getObjectForInspection`, `createDownloadTarget`, and `deleteObject` with classified results: `READY`, `NOT_FOUND`, `NOT_CONFIGURED`, `TRANSIENT_FAILURE`, or `PERMANENT_FAILURE`. Upload targets must cryptographically or provider-policy enforce write-once creation (`If-None-Match: *`); overwriting a finalized key is outside the provider contract. Results expose only bounded safe metadata.

No persistent production provider is configured at the start of Gate 5A. Production therefore fails closed with `STORAGE_PROVIDER_NOT_CONFIGURED`. A deterministic memory adapter is allowed only in tests or an explicitly guarded staging operator process; it is not persistent storage and is impossible to select from production client input. No vendor SDK is speculatively added.

| Runtime/provider state | Result |
| --- | --- |
| production with no approved provider | `NOT_CONFIGURED`; session creation returns the stable 503 domain error |
| persisted deterministic kind but adapter absent | safe provider failure; no fallback to another provider |
| unit/integration process with explicit injection | deterministic, non-persistent adapter |
| guarded staging operator (`REZNO_ENV=staging`, exact database and confirmation) | deterministic, in-memory adapter for that process only |
| any attempt to inject the deterministic adapter with `NODE_ENV=production` | hard refusal |

Upload/download targets expire in five minutes. Targets and signed query parameters are returned only to the authorized caller, never stored, logged, audited, rendered in unrelated HTML, or placed in DTOs after expiry.

### Direct-upload and transaction boundaries

1. An authenticated caller submits purpose, expected MIME/size, optional SHA-256 checksum, bounded display filename, a UUID idempotency key, and (for Business) the rendered active Organization context only for confusion detection.
2. A serializable transaction revalidates Person/membership/Role, takes a transaction-scoped advisory lock for the owner quota scope, enforces persistent active-session/pending-byte/daily/asset quotas, and creates the session/mutation atomically.
3. Target issuance revalidates authority/version in a short transaction, calls the provider outside database locks, validates HTTPS expiry/header/reference output and the provider's write-once guarantee, then conditionally records `TARGET_ISSUED`. Provider network calls are never held inside row-lock transactions.
4. The client uploads directly to that exact provider target. REZNO never accepts file bytes/base64/multipart.
5. Finalization revalidates authority/version, captures immutable provider/object identity, performs HEAD and bounded object inspection outside locks, then uses a serializable transaction/conditional version to atomically create one asset, finalize the session, and complete the mutation. A failed check creates no READY asset.

### Integrity and inspection

Expected checksum is lowercase 64-hex SHA-256. When provider metadata supports it, HEAD comparison is required. Inspection always computes SHA-256 over bounded bytes and compares the expectation. Provider MIME/size are hints that must exactly match the session before decode.

Structural inspection uses `sharp` with limits. It verifies magic bytes and decoded format, permits JPEG/PNG/WebP only, rejects zero bytes, malformed data, multiple pages/frames, animated WebP, and images over 40,000,000 decoded pixels. SVG/GIF/PDF/ZIP/HTML/XML/script/executable magic and unknown data are rejected. The decoder is bounded by purpose bytes and pixel limits to reduce decompression-bomb exposure.

Malware scanning is an abstraction. No production scanner is configured, so results truthfully report `SCANNER_NOT_CONFIGURED`; no asset is labelled malware-free. Supported static raster structural inspection is the required Gate 5A READY criterion. Unsupported content never becomes READY.

### Quotas and abuse controls

Persistent quota checks are authoritative and serialized per owner:

- at most 5 active Person sessions and 10 active Organization sessions;
- pending bytes at most 25 MiB per Person and 100 MiB per Organization;
- at most 30 Person or 100 Organization sessions created in a rolling UTC day;
- finalized bytes at most 100 MiB per Person or 1 GiB per Organization per rolling UTC day;
- per-purpose active assets as listed in the registry.

Process-local endpoint rate limits are additional defense only. Concurrent database transactions cannot silently exceed persistent quotas. Failure is `STORAGE_QUOTA_EXCEEDED`.

### Idempotency and concurrency

Every mutation requires a UUID key and stores SHA-256 of canonical JSON bound to actor, active Organization, action, purpose/visibility, expected metadata, target ID, and expected version. A unique actor/key constraint plus an actor/key advisory lock and serializable transaction gives exact replay across the whole storage mutation surface; a changed action or hash is `IDEMPOTENCY_CONFLICT`. Conditional version updates produce `STALE_VERSION`. Session-to-asset and provider/object unique constraints prevent double-finalization and cross-session reuse.

### Download and deletion policy

One service issues bounded download targets. PUBLIC requires READY and a public-permitted purpose. PRIVATE requires the current Person owner or current Owner/Manager membership in the owning Organization. INTERNAL requires current storage Admin view permission. Foreign records are hidden as NOT_FOUND where appropriate. No caller supplies a redirect/destination. Raw object keys are not returned by asset DTOs.

Deletion first authorizes and transitions to DELETE_PENDING, making the asset inaccessible immediately. Provider deletion runs outside the transaction; confirmed absence/deletion transitions to DELETED. Transient failure remains DELETE_PENDING for explicit retry. Normal product paths never hard-delete canonical records.

Manual commands cover expired sessions/orphan candidates and DELETE_PENDING retry. They operate only in the exact server-generated namespace, use bounded batches/cursors, never list/delete an entire bucket, and are ready for Stage 6 to schedule later. Orphan retention is 24 hours after session expiry; DELETE_PENDING retries are immediately eligible. No Cron/background worker is added.

Provider cleanup is claimed with private `providerCleanupClaimId`/`providerCleanupClaimedAt` columns on the exact session/asset. Claims expire after 15 minutes for crash recovery, are never exposed by DTOs, and prevent a direct deletion and manual cleanup from operating the same object concurrently. A successful orphan deletion records `ORPHAN_OBJECT_DELETED`, so later runs do not repeatedly delete the same key. Cleanup first selects at most the requested batch, including expiration transitions; it never performs an unbounded expiration update.

### Admin and audit policy

Permissions are `STORAGE_RECORDS_VIEW` and `STORAGE_RECORDS_MANAGE`; manage depends on view. View lists safe metadata and quarantine state. Manage permits reject/manual cleanup but does not grant arbitrary download of private customer data. Every operation revalidates current Admin access, status, expiry, and permission in its authoritative transaction and writes one redacted `AdminAuditLog`.

Audit metadata may contain state, purpose, visibility, safe size, safe provider class, and stable IDs. It excludes content, original filename, object key, checksum, bucket, URL, signed query, auth header, credentials, provider response/error, and foreign owner metadata.

### API and DTO contracts

Production JSON handlers cover create session; issue target; finalize; abort; list sessions/assets; asset detail; download target; delete; Admin list/detail; and authorized manual cleanup/retry. Strict schemas reject unknown fields, malformed UUIDs, duplicate query parameters, unexpected providers/keys/URLs/owners/visibility/roles, unsupported MIME, negative/oversized size, long names, and JSON bodies over 32 KiB. Stable errors redact Prisma/PostgreSQL/provider details.

DTOs are explicit `UPLOAD_SESSION`, `UPLOAD_TARGET`, `UPLOAD_FINALIZE_RESULT`, `STORED_ASSET_SUMMARY`, `STORED_ASSET_DETAIL`, `STORED_ASSET_PAGE`, `DOWNLOAD_TARGET`, `STORAGE_QUOTA_STATUS`, and `STORAGE_CLEANUP_RESULT`. They never expose credentials, buckets, raw keys/checksums, authorization headers, permanent signed URLs, audit internals, session cookies, database URLs, content, or foreign owner identifiers.

### Pagination

Asset and session cursors use versioned, server-only HMAC-SHA-256 envelopes, HKDF from the existing server secret, exact PostgreSQL microseconds, a fixed snapshot, indexed `(createdAt,id)` tuples, and actor/Organization/filter/page-size binding. Authorization is resolved before decoding. Signing domains are distinct:

- `rezno:storage:asset-cursor-signing:v1`
- `rezno:storage:session-cursor-signing:v1`

### Cleanup and orphan classifications

- Issued/not-uploaded and uploaded/not-finalized sessions become EXPIRED after their immutable expiry; their exact namespaced object is eligible after the 24-hour retention.
- Finalization after expiry is denied even if an object exists.
- Missing provider object cannot produce an asset.
- Missing object for an existing READY asset is surfaced as unavailable and queued only for manual investigation; it is not silently deleted.
- Provider object without a database session is deleted only when it matches an exact known expired session key; no broad provider enumeration occurs.
- Duplicate replay resolves through the mutation/session unique constraints.
- DELETE_PENDING remains inaccessible until manual retry confirms deletion.

## Implementation and evidence

### Implemented surface

Migration 39 is the single forward-only schema change. It adds the three canonical tables, closed enums, database ownership/key/checksum/state/claim constraints, actor-global idempotency uniqueness, and bounded-query indexes. No legacy URL column or row is rewritten and there is no migration 40.

Production handlers now provide Customer and Business session create/list/target/finalize/abort, quota status, asset list/detail/download/delete, public READY download, and Admin safe list/detail/quota/reject/internal-delete/manual-cleanup. Bodies are streamed with a hard 32 KiB limit, JSON and fields are exact, bodyless download issuance rejects overrides, query parameters reject duplicates, and public/authenticated/Admin routes have bounded process-local rate limits in addition to persistent quotas.

Finalization performs first HEAD, bounded object retrieval, SHA-256 and structural raster decode, scanner abstraction, then a second HEAD comparing size, MIME, provider checksum, and object version before one serializable asset/session/mutation commit. Upload targets require exact five-minute expiry, HTTPS, PUT, content length/type, `If-None-Match: *`, an allowlisted safe provider reference, and a provider write-once assertion. Target URLs are bounded and never persisted.

### Migration rehearsal

- repository baseline: 38 migrations at `84da8d87b2b9a5676fe1b77cc015a31c46246849`;
- final fresh rehearsal A: migrations 1→39, 39 applied, three storage tables and four cleanup-claim columns present;
- final fresh rehearsal B: migrations 1→39, same result;
- populated rehearsal: raw migrations 1→38, deterministic legacy User/Person/Business media rows, then exact migration 39;
- legacy fingerprint before/after: `e8b5d62771d5d932db6f0fc1707dd2b0` unchanged;
- managed-asset backfill count: `0`;
- migrations 1–38 remained byte-untouched and no legacy field was removed.

### Performance evidence

PostgreSQL plans with sequential/bitmap alternatives disabled prove the intended access paths rather than accepting a valid plan by name alone:

| Operation | Proven index |
| --- | --- |
| Person asset page | `StoredAsset_ownerPersonId_createdAt_id_idx` |
| Organization asset page | `StoredAsset_organizationId_createdAt_id_idx` |
| unfiltered Admin asset page | `StoredAsset_createdAt_id_idx` |
| active session/pending-byte quota | `UploadSession_ownerPersonId_state_expiresAt_idx` or owner pagination index |
| expired-session batch | `UploadSession_state_expiresAt_id_idx` |
| delete-pending batch | `StoredAsset_state_deleteRequestedAt_id_idx` |
| exact mutation replay | `StorageMutation_actorPersonId_idempotencyKey_key` |

List hydration is two bounded queries, quota aggregation is a fixed query set, provider calls occur outside database transactions, cleanup uses exact claimed rows, and no provider bucket listing exists.

### Local validation evidence

- clean root install: 1,051 packages; direct `sharp@0.34.5` uses the version already compatible with Next;
- clean Customer Mobile install: 503 installed / 504 audited;
- root audit: five moderate, zero high/critical, all inherited tooling/framework paths; no new direct Gate 5A advisory;
- Mobile audit: ten moderate, zero high/critical, inherited Expo/xcode/uuid tooling;
- ESLint: zero warnings/errors;
- root non-incremental TypeScript and Mobile TypeScript: passed;
- Prisma format/validate/generate: passed;
- Gate 5A unit: 19/19;
- Gate 5A PostgreSQL: 18/18 after the final security hardening;
- complete unit suites on the final local tree: 353/353;
- complete PostgreSQL suites on a fresh 39/39 database with the CI signing environment: 318/318;
- production HTTP/RSC/API against the final Next production build: 88/88;
- Next 16.2.9 production build, Expo dependencies, Expo Doctor 20/20, public config, Android Hermes export, and iOS Hermes export: passed; physical devices were not used.

The guarded local `rezno_staging` operator rehearsal is 39/39. Fixture run one and run two both produced `3bebae60d7efb88d890b301b6efd9c80f0ab6efeb1aa9c1031dd9ecb415636ee`; smoke passed 32 checks. Exact cleanup removed 22 assets, 30 sessions, three Admin grants, six memberships, six Roles, two Organizations, 12 People, and 12 Users, with zero remaining mutation/audit rows. The second cleanup returned zero for every category.

### Real-staging evidence

Draft PR #121 supplied an immutable Vercel staging Preview for head `0cd83100cf89099762d9386a15eaf356db2c33c3` before the operator touched real staging. Authenticated Neon discovery selected exactly the `rezno-staging` project, exact `rezno_staging` database, verified owner role, direct non-pooler endpoint, and required SSL. The database URL and credentials stayed in process memory and were not persisted.

Read-only preflight reported 38 total, 38 successfully applied, and zero failed migrations. Forward-only `prisma migrate deploy` applied migration 39 only; postflight and final status reported 39/39 with zero failed migrations. Two fixture executions produced the identical fingerprint `3bebae60d7efb88d890b301b6efd9c80f0ab6efeb1aa9c1031dd9ecb415636ee`. The guarded in-memory deterministic-provider smoke passed 32 checks and made no persistent-provider or human-delivery claim.

Exact cleanup removed 22 assets, 30 sessions, three Admin grants, six memberships, six Roles, two Organizations, 12 People, and 12 Users; the smoke had already removed its own mutation/audit rows. A second cleanup returned zero for every category, and all three storage tables ended at zero rows. A whole-database pre/post fingerprint over every non-storage, non-migration public table remained `15596b840153cedca59f65e851adb6e08a5477e767806086f45c75b79f242590`, proving that Stage 1–4 data—including the retained Stage 3/4 fixtures—was unchanged.

### Security review

The review covered asset/session IDOR, active-Business and Person/Organization confusion, membership/Role/Admin revocation races, object-key injection/path traversal/bucket escape, provider and URL injection, SSRF, MIME/extension/polyglot/SVG/animation bypass, decompression/pixel/request-body amplification, replay/cross-actor idempotency/concurrent finalization/stale versions/quota races, signed-target/provider/checksum/foreign-metadata leakage, deletion/cleanup races and overreach, deterministic-provider production activation, fixture production guards, and PII in keys/logs/audits.

Hardening performed during review included actor-global mutation keys, database-authoritative expiry, write-once upload targets, bounded/safe provider target and metadata validation, provider-throw classification, a second immutable metadata check, exact raster boundaries, 40,000,000-pixel decoding, scanner-failure quarantine, authenticated scope-bound cursors, public download rate limiting, dedicated cleanup claims, batch-bounded expiration, one-time orphan reconciliation, exact-key-only delete retry, and a general Admin pagination index. No known P0/P1/P2 remains locally. This finding must be rechecked against review threads and exact-head CI before Ready for Review.

### Pending final immutable-head closure

The documentation-only evidence commit intentionally changes the PR head after the first real-staging proof. Its exact-head GitHub Actions, both Vercel checks, final 39/39 fixture/smoke/cleanup recheck, unresolved review-thread count, and Ready-for-review transition must therefore be recorded against the final pushed SHA rather than claimed in advance here.

Production provider status: **not configured; production persistent upload is not claimed**. Deterministic provider status: **test/guarded staging-operator only; in-memory and non-persistent; never production**. Malware scanner status: **not configured; READY means static-raster structural policy passed, not virus-free**. Physical-device QA: **not performed; Stage 7**.

Gate 5B, Gate 5C, Gate 5D, and Stage 6 remain unstarted. Gate 5B receives the future media-field integration and migration handoff; Stage 6 receives the manual cleanup attachment point. Current verdict: **pending final immutable-head checks and review**.
