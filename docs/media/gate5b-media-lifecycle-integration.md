# Gate 5B — Media lifecycle and domain integration

Status: implementation and local closure evidence complete; immutable PR-head CI, Preview, and real-staging evidence are recorded only after publication.

Baseline: `origin/main` at `52658f15ed050b57c79cb91faeb3e97645b1a116`, the merge commit of PR #121. The repository and real staging are both at 39/39 migrations. Gate 5A production provider truth remains `NOT_CONFIGURED`; the deterministic provider remains test/guarded-operator only. PR #100 remains an untouched Open Draft at `e46454df993ecccb06180060dda4353ec88e2641`.

## Scope and exclusions

Gate 5B connects inspected Gate 5A `StoredAsset` rows to typed Customer, Business, Service, Store, Product, and Menu-item media slots. It does not implement payments, a cleanup scheduler, provider webhooks, persistent transformations, message/review/campaign attachments, documents, video/audio, arbitrary remote import, physical-device QA, or visual redesign. Gate 5C, Gate 5D, and Stage 6 remain unstarted.

## Existing-media audit methodology

The audit covered the Prisma schema, production Server Actions and services, public and authenticated DTOs, metadata builders, Web image components, Customer Mobile types/screens, checkout snapshots, fixtures, local assets, Next Image configuration, and the shared URL sanitizer. Each row below records ownership and mutation authority, data origin and fetch behavior, injection risk, ordering/alt/snapshot semantics, lifecycle behavior, and the Gate 5B disposition.

### Canonical field inventory

| Model and field | Readers and surfaces | Writer, actor, and tenant scope | Current input and fetch/security behavior | Ordering, alt, snapshot, replace/delete | Gate 5B decision and migration implication |
| --- | --- | --- | --- | --- | --- |
| `Person.avatarUrl` | Customer profile; team/workforce projections; booking staff selection; Marketplace professional fallback | `update-profile` writes for the session-derived Customer Person; identity provisioning copies `User.image` on first Person creation | User-controlled external URL from Web is limited to bounded public-looking HTTPS. No base64/data URL persists. Public Web may eventually pass it to Next Image; Mobile currently uses initials rather than a managed avatar control. URL text itself is not stored-XSS when rendered as an image attribute, but remote optimization creates fetch/DNS risk. | Singleton; no stored alt; overwrite only; no provider deletion; not snapshotted into orders | `CUSTOMER_PROFILE`/`CUSTOMER_AVATAR` canonical binding. Stop the raw profile writer. Retain the column only as legacy fallback when no binding history exists. Migration 40 does not import or rewrite it. |
| Better Auth `User.image` | Auth callbacks, dashboard/session/current-user projection, `Person.avatarUrl` provisioning fallback | Auth provider/Better Auth and current profile action currently write it | External identity-provider URL or the same Customer-supplied HTTPS URL. It is not an owned object and may be third-party controlled. No base64 writer was found. | Singleton projection; no order or alt; account-provider updates may replace it | Keep as an authentication legacy projection, never as canonical asset identity. Customer media reads prefer the typed binding; no managed path is copied back into Better Auth storage. Remove the profile form's raw write. |
| `BusinessProfile.logoUrl` | public Business/search/home/cards, booking and restaurant projections, favorites, professional profile, metadata fallback, management preview | Business profile Server Action; current Owner/Manager active-Business scope | Bounded HTTPS through `isSafePublicImageUrl`. Several Marketplace reads sanitize, while Favorites and Restaurant reservation projections currently return the raw stored value. Next Image wildcard optimization may server-fetch it. | Singleton; generic Business-name alt on public surfaces; overwrite only; no provider delete | `BUSINESS_PROFILE`/`BUSINESS_LOGO`. Stop raw writes. Canonical first, legacy only before any slot history, safe placeholder last. Add no URL backfill. |
| `BusinessProfile.coverImageUrl` | public hero/cards/search, booking and restaurant DTOs, Customer Mobile nearby, management preview, metadata fallback | Same Business profile action and active Organization | Same external HTTPS and mixed sanitized/raw-read behavior as logo. Customer Mobile fetches remotely on device; its local helper currently accepts `http` or `https`, relying on server DTO safety. | Singleton; usually decorative or Business-name alt; overwrite only | `BUSINESS_PROFILE`/`BUSINESS_COVER`. Stop raw writes and make every projection use canonical/fallback resolution. |
| `BusinessProfile.galleryUrls` | public Business detail gallery and management form | Owner/Manager Business profile action parses a newline list | Ordered array of user-controlled external HTTPS values, filtered on several reads. Next Image currently optimizes public gallery URLs. No base64/data URL persists. | Array order is meaningful; no stored alt; whole-array replacement; no per-item identity/deletion | `BUSINESS_PROFILE`/`BUSINESS_GALLERY` collection. Canonical `MediaBinding` order and alt replace the writer. Any binding history switches the collection out of legacy-array mode. |
| `BusinessProfile.ogImageUrl` | `generateMetadata` for public Business page and management form | Owner/Manager Business profile action | External HTTPS after the shared validator; metadata consumers may cause crawler fetches outside REZNO. | Singleton; no alt/order; overwrite only | No Gate 5A purpose or required Gate 5B slot exists. Close new raw writes. Keep legal legacy metadata fallback only; managed Open Graph selection derives from canonical cover, then logo. No new purpose is justified. |
| `OrganizationMember.photoUrl` | team management, public professional profile, booking staff cards; falls back to `Person.avatarUrl` | team/workforce mutation by current Business management scope | Arbitrary media URL is accepted only after bounded public-HTTPS validation. Public Web can use Next Image. No data/base64 persistence. | Singleton; no stored alt; overwrite only | Staff photos are not integrated: Gate 5A has no staff-photo purpose. Close the arbitrary URL form/writer, retain safe legacy read fallback, and document a future purpose decision rather than abusing `CUSTOMER_AVATAR`. No migration 40 slot/container is added. |
| `Service.imageUrl` | Business service management, Marketplace detail/cards, booking catalog, favorites, professional pages | legacy Service actions and Stage 2 service-catalog mutations; current Owner/Manager Organization scope | External HTTPS after shared validators. Some public DTOs sanitize; booking/favorite and some internal DTOs currently return raw values. Next Image can optimize the URL. | Singleton; UI derives alt from service name; overwrite only; no provider delete | `SERVICE`/`SERVICE_PRIMARY` requiring `SERVICE_IMAGE`. Close all raw writers and batch-resolve canonical/fallback reads. |
| `Store.logoUrl` | Store/public/Customer cart and order DTOs, favorites, Admin Store views, checkout store-logo snapshot | merchant Store create/update Server Action; current Owner/Manager Store Organization | User-controlled external HTTPS after commerce schema validation. DTOs usually sanitize. | Singleton; Store-name alt; overwrite/remediation-to-null; snapshotted into `Order.storeLogoUrlSnapshot` | `STORE`/`STORE_LOGO`. Stop raw writes. New checkout snapshots use the stable canonical same-origin path when managed; historical strings stay unchanged. |
| `Store.coverImageUrl` | public Store lists/detail, Customer Mobile commerce, Store management/Admin | same merchant Store mutations and Organization scope | Same HTTPS validation and remote client/server image behavior as logo | Singleton; Store-name alt; overwrite/remediation-to-null; not snapshotted | `STORE`/`STORE_COVER`. Stop raw writes and use canonical/fallback resolution. |
| `ProductMedia.url` | merchant Product management, public Product cards/detail, Store catalog, cart, favorites, inventory/Admin DTOs, Customer Mobile commerce | merchant Product media add/update/remove/reorder; Owner/Manager Product/Store Organization | New arbitrary HTTPS image URL is currently accepted; credentials/private-looking hosts are rejected. Public DTOs sanitize. Provider ownership is nonexistent. | Collection up to 12; integer `sortOrder`; optional `variantId`; optional `altText`; media rows are physically deleted on remove; first item is snapshotted into orders | Keep rows as legacy collection history only. New canonical `PRODUCT`/`PRODUCT_IMAGE` bindings carry order, optional variant, and alt. Stop URL add/update/delete as the active media lifecycle; do not synthesize `StoredAsset` rows. |
| `MenuItem.imageUrl` | public Business menu, restaurant reservation menu, Business restaurant management | restaurant/Stage 2 menu-item create/update; current Business management actor | External HTTPS after shared validator. Marketplace sanitizes, while reservation-public currently returns the raw stored string. | Singleton; item-name alt where rendered; overwrite only; no provider delete | `MENU_ITEM`/`MENU_ITEM_PRIMARY` requiring `RESTAURANT_MENU_IMAGE`. Stop raw writes and use canonical/fallback projection. `MenuCategory` has no image field and receives no slot. |
| `Order.storeLogoUrlSnapshot` | Customer/Merchant/Admin order DTOs and history | checkout system transaction | Historical URL is sanitized on write/read. It may be external but is immutable order evidence, not an owned media object. | Immutable snapshot; no media lifecycle | Preserve every historical value. New orders snapshot a stable same-origin public managed path when canonical media exists, otherwise a safe legacy URL/null. Later source deletion may make the stable path return 404; the snapshot itself is not rewritten. |
| `OrderItem.imageUrlSnapshot` | cart/checkout result, Customer/Merchant/Admin order history | checkout system copies the first safe Product media URL | Same historical external-URL behavior as Store snapshot | Immutable per-line snapshot | Preserve history. New canonical orders snapshot `/media/<assetId>` rather than a provider URL/key. Do not rewrite historical orders. |

### Other audited media-like surfaces

| Surface | Evidence and decision |
| --- | --- |
| Branch | `Branch` has no image field. Location text/maps are not media. No container or migration target is added. |
| Menu category | `MenuCategory` has no image field. No implied category-image slot is created. |
| Product variant | No direct URL field. Existing `ProductMedia.variantId` scopes legacy media. Canonical Product bindings may reference a real same-Product `ProductVariant` FK. |
| Reviews | `Review` has no image/attachment field. Review attachments remain excluded. |
| Notifications/messages/campaigns | No canonical file field exists. Metadata and notification content are not media bindings; attachments remain excluded. |
| QR share image | Client-generated QR data is rendered with `unoptimized` Next Image and is not persisted. It is not domain media and does not justify data-URL support. |
| Static Web assets | PWA/app icons and framework SVGs under `public/` are trusted build assets. Same-origin static paths are legal legacy references but are not imported into storage. |
| Static Mobile assets | Expo icons, navigation/category PNGs, and fonts are compile-time `require(...)` assets. They remain outside managed domain media. |
| Seed/fixture remote URLs | Stage 2/3 deterministic seeds contain example HTTPS URLs and explicit unsafe sentinels to prove sanitization. They are staging/test data only and remain exact-ID guarded. No remote bytes are fetched. |
| Placeholder behavior | Web and Mobile mostly use icon/initial/gradient placeholders. These remain the last fallback after canonical resolution and legal legacy fallback. |

## Reader topology and bounded-query implications

- Marketplace search and detail already load bounded Organizations with nested profile/services/menu/team data, then build DTOs in memory. Gate 5B must batch-load containers, active bindings, and READY assets for the bounded target ID sets; it must not add one query per card.
- Booking, Restaurant, Favorites, and Customer Mobile APIs have independent projection paths. Several currently return raw legacy fields even though primary Marketplace/commerce DTOs sanitize them. All must use one media projection service so policy cannot drift.
- Commerce Store/Product queries already hydrate ordered Product media. Canonical binding resolution must be batched by Store/Product IDs and keep provider calls out of list transactions. Stable paths remove any need to issue signed URLs per list row.
- Customer profile is a singleton target and may use one bounded container query. Business gallery and Product collections must be capped by the slot registry.

## Existing URL and fetch security findings

`isSafePublicImageUrl` accepts at most 2,048 characters, requires HTTPS, rejects credentials, IP literals, single-label/private-suffix hosts, and malformed URLs. It does not accept same-origin relative paths, resolve DNS at write time, or establish object ownership. No production raw media writer accepts `data:`, `javascript:`, `file:`, `ftp:`, protocol-relative, or base64 media.

`next.config.ts` currently permits optimized HTTPS images from `**`. Sanitized URLs reduce obvious SSRF inputs and Next performs resolved-address checks, but a wildcard optimizer remains unnecessary once legacy values become fallback-only. Gate 5B must distinguish managed same-origin paths from legacy external URLs and must render legal legacy external references without Next server optimization (or suppress them). Mobile remote images are fetched by the device, not the REZNO server, but still require server-issued safe references; the nearby helper's current `http` acceptance must not become a production media-policy bypass.

Alt text is stored only on legacy `ProductMedia`; other surfaces derive it from Business/Service/Product/Menu names or use empty alt for decorative imagery. Gate 5B needs normalized, text-only binding alt with a 300-character bound and meaningful per-slot defaults.

## Writer closure inventory

Gate 5B must remove raw media URL fields from these production mutation contracts while leaving unrelated record fields writable:

- Customer `update-profile` (`avatarUrl`, and its `User.image` mirror);
- Business profile update (`logoUrl`, `coverImageUrl`, `galleryUrls`, `ogImageUrl`);
- legacy Service create/update paths (`imageUrl`);
- team/workforce member update (`photoUrl`, retained as legacy-only because no purpose exists);
- Store create/update (`logoUrl`, `coverImageUrl`);
- Product media URL add plus URL-row remove/reorder as the active lifecycle (legacy rows stay untouched);
- Menu-item create/update (`imageUrl`).

Strict contracts must reject raw URL/object-key/provider/checksum/signed-target overrides. Canonical attach/replace/detach/reorder operations become the only new media writers.

## Audit decisions before implementation

1. Use typed `MediaContainer`, `MediaBinding`, and `MediaMutation` models with real foreign keys; no generic target type/ID pair.
2. Migration 40 is required. It is forward-only, leaves migrations 1–39 and all legacy URL rows untouched, creates no fake asset/backfill, and adds no migration 41.
3. Integrate Customer, Business logo/cover/gallery, Service, Store logo/cover, Product/variant, and Menu item only. Staff and Business `ogImageUrl` remain safe legacy-only because no legal Gate 5A purpose exists.
4. Canonical history suppresses legacy fallback after detach, including empty canonical collections.
5. Public managed DTOs expose stable same-origin delivery paths only. Private Customer avatar uses authenticated delivery. Provider signed URLs, keys, checksums, versions, and ownership internals never enter persistent media DTOs or SSR HTML.
6. The production provider remains unavailable. Upload controls must expose this truth and must not fake an upload, proxy bytes, accept base64, or fetch a remote URL.

## Canonical architecture and migration 40

Migration `20260719210009_media_lifecycle_integration` is the only Gate 5B migration. It is forward-only and creates `MediaContainer`, `MediaBinding`, and `MediaMutation` plus closed enums for kinds, slots, binding states, and mutation actions. It does not remove, rewrite, import, or fetch any legacy URL and creates no fake `StoredAsset`. Migrations 1–39 remain byte-identical and no migration 41 exists.

`MediaContainer` has real nullable foreign keys to Person, Organization, Service, Store, Product, and MenuItem. A database check permits exactly one typed target family, target-specific partial unique indexes permit one container per entity, and a trigger rejects Service/Store/Product/MenuItem Organization mismatches even from direct SQL. Its positive integer version is the optimistic aggregate version.

`MediaBinding` references one container, one real `StoredAsset`, the creating Person, an optional detaching Person, and an optional real ProductVariant. It preserves ACTIVE/DETACHED history, collection order, bounded plain-text alt, and binding version. Partial indexes enforce one ACTIVE asset binding, one ACTIVE singleton per container/slot, and one ACTIVE collection row per order. Shape checks enforce singleton null order, gallery order 0–23, Product order 0–11, and legal variant placement. A trigger independently enforces container kind, asset owner/Organization, purpose, visibility, and ProductVariant scope.

`MediaMutation` records the current Person, optional Organization/container, closed action, actor-global UUID idempotency key, SHA-256 request hash, expected/result versions, status, and redacted result. The actor/idempotency unique key and serializable transaction/advisory-lock protocol provide exact replay and changed-request conflict behavior.

Migration rehearsal evidence:

- fresh database A: 1→40, 40/40, zero failed;
- fresh database B: 1→40, 40/40, zero failed;
- populated database: 39→40, 40/40, legacy preservation digest before and after `7eb42d14272ede9e84a251449c6cedacf259b2a9991150fcfa6c5bd16b2ba42f`;
- the populated rehearsal created zero media containers/bindings/mutations, proving there is no synthetic backfill.

## Slot and purpose registry

One server-only registry is the application allowlist. Arbitrary slot strings are rejected.

| Slot | Container | Required Gate 5A purpose | Shape / limit | Variant | Delivery |
| --- | --- | --- | --- | --- | --- |
| `CUSTOMER_AVATAR` | Customer profile | `CUSTOMER_AVATAR` | singleton / 1 | no | private |
| `BUSINESS_LOGO` | Business profile | `BUSINESS_LOGO` | singleton / 1 | no | public when target is public |
| `BUSINESS_COVER` | Business profile | `BUSINESS_COVER` | singleton / 1 | no | public when target is public |
| `BUSINESS_GALLERY` | Business profile | `BUSINESS_GALLERY_IMAGE` | collection / 24 | no | public when target is public |
| `SERVICE_PRIMARY` | Service | `SERVICE_IMAGE` | singleton / 1 | no | public when target is public |
| `STORE_LOGO` | Store | `STORE_LOGO` | singleton / 1 | no | public when target is public |
| `STORE_COVER` | Store | `STORE_COVER` | singleton / 1 | no | public when target is public |
| `PRODUCT_IMAGE` | Product | `PRODUCT_IMAGE` | collection / 12 | optional same Product/Store | public when target is public |
| `MENU_ITEM_PRIMARY` | Menu item | `RESTAURANT_MENU_IMAGE` | singleton / 1 | no | public when target is public |

Staff photo and dedicated Open Graph slots were intentionally not introduced: Gate 5A has no legal staff-photo or OG-only purpose. Their historical values remain sanitized legacy reads, with all new raw writers closed.

## Ownership and authorization matrix

| Target | Asset ownership | Legal mutation actor | Current-state revalidation |
| --- | --- | --- | --- |
| Customer profile | private asset whose `ownerPersonId` is the current Person and Organization is null | that Customer Person only | User/Person/session remains current |
| Business profile | asset Organization equals active Business | Owner, Manager | membership ID, Role ID, Person, Organization, and active-Business context |
| Service | same Organization as Service and asset | Owner, Manager | Service is same tenant and not archived/deleted |
| Store | same Organization as Store and asset | Owner, Manager | Store is same tenant and not archived |
| Product | asset Organization equals Store Organization | Owner, Manager | Product/Store tenant and lifecycle; optional variant belongs to same Product and Store |
| Menu item | asset Organization equals `businessId` | Owner, Manager | item and category remain in the same Business |

Receptionist, Staff, revoked members, replaced Role IDs, inactive People/Organizations, foreign active-Business contexts, foreign assets, and foreign ProductVariants fail closed. IDs sent by a client never establish Person or Organization ownership. Admin rejection separately requires current `STORAGE_RECORDS_MANAGE`; view-only, expired, and revoked Admin access cannot mutate.

## Attachment lifecycle and concurrency

Attach validates the exact target, expected container version, READY asset, slot/purpose/visibility/owner compatibility, active binding reuse, collection limit, and variant before inserting. A new container uses client version 0 and begins at version 1; every later mutation conditionally increments the container.

Replace is singleton-only. It locks the aggregate and asset, detaches the exact prior ACTIVE binding with actor/time/version history, creates the replacement, and commits one mutation result atomically. A missing current singleton is not treated as replace.

Detach preserves the `StoredAsset` and binding row, records detaching Person/time, increments binding and container versions, and makes the stable delivery route unavailable. It does not delete provider data. Delete remains a separate Gate 5A operation and returns `ASSET_IN_USE` while any ACTIVE binding exists.

Reorder accepts the exact complete set of unique ACTIVE binding UUIDs. It temporarily removes the locked set from the partial order index inside the same transaction, writes deterministic 0-based order, and restores ACTIVE state atomically. Missing/extra/duplicate IDs, stale versions, and singleton slots fail.

Alt updates normalize NFKC text, remove controls, reject HTML angle brackets, cap at 300 characters, and version both binding and container. Empty text becomes null. UI labels use meaningful domain names where available; decorative imagery uses empty alt.

All actions use serializable transactions, bounded retries for PostgreSQL serialization/deadlock outcomes, aggregate advisory locks, row locks, conditional versions, and actor-global UUID idempotency. Exact replay returns the stored redacted DTO; any material change, including actor membership/role scope, conflicts. Concurrent singleton replacement and collection attachment have one winner and no partial row.

## Asset deletion and Admin rejection

Gate 5A deletion now locks the asset and checks for an ACTIVE binding before entering `DELETE_PENDING`; attached assets return `ASSET_IN_USE`. After detach, deletion follows the existing provider-confirmed lifecycle while detached history remains.

Admin rejection locks and revalidates Admin authority and asset version, rejects the asset, detaches its active binding, increments the container, writes `ADMIN_DETACH_REJECTED_MEDIA`, completes the storage mutation, and writes a redacted Admin audit in one transaction. Any failure rolls the complete change back. Provider keys, signed targets, checksums, and raw provider errors are absent from mutation/audit results.

## Legacy compatibility and writer closure

Read precedence is canonical ACTIVE READY binding, then sanitized legacy value only when no canonical history exists, then placeholder/null. Once a slot has any canonical binding history, detaching or rejecting its last binding intentionally yields empty media; the old URL never reappears. Public batching loads only ACTIVE rows plus one distinct history marker per requested container/slot, never unbounded detached history.

Legacy references accept same-origin paths or normalized public HTTPS only. They reject credentials, HTTP, protocol-relative forms, control characters, data/base64, IP literals including IPv6, localhost, single-label/internal/private suffixes, and malformed/oversized input. No REZNO server fetches a legacy URL: Next Image optimization is globally disabled and Mobile receives only server-sanitized references. Gate 5B performs no DNS lookup, remote import, or byte fetch.

New raw URL fields are removed from Customer profile, Business profile, Service, Store, MenuItem, and workforce production contracts. All legacy ProductMedia add/update/reorder/remove services and the old Server Action reject without changing historical rows. Direct historical database fixtures remain readable only through the sanitizer. Service/menu/workforce audit snapshots record only a legacy-present boolean rather than copying raw URLs.

## Delivery and capability contracts

Managed DTOs expose type, slot, asset UUID, stable same-origin path, safe dimensions/MIME, order, variant, and alt. They never expose object key, checksum, provider object version, signed target, owner internals, or credentials.

`/media/<assetId>` is a strict no-query public redirect. Before and after provider target creation it requires an ACTIVE compatible binding, READY PUBLIC asset, public-enabled slot, and a currently public typed target: visible Business, bookable Service/menu item, active published Store, or published Product with active category/variant. Draft/unpublished/archived targets return 404.

`/api/media/customer/assets/<assetId>` requires the current Customer and revalidates the active private avatar binding and ownership before and after provider work. `/api/media/business/assets/<assetId>` lets only the current Owner/Manager preview managed public assets on their own draft or public target, again revalidating membership, Role ID, target, binding, purpose, and tenant around provider work. All routes reject query parameters and apply scoped rate limits.

The capability endpoint reports the closed slot/purpose limits and the actual provider state. Production remains `NOT_CONFIGURED`, so `providerConfigured=false`, `directUploadAvailable=false`, UI controls are disabled with localized truthful copy, and delivery/upload attempts return `STORAGE_PROVIDER_NOT_CONFIGURED`. The deterministic provider is test and exact guarded staging-operator only.

## Product-surface integration results

- Customer Web reads canonical avatar and provides localized attach/replace/detach management.
- Business Web manages logo, cover, gallery, Service, Store, Product/variant, and Menu-item slots with versioned API calls, keyboard-operable reorder buttons, labeled errors, truthful disabled/loading state, and authenticated draft preview.
- Public Marketplace, Business/search/cards, booking, Restaurant, Favorites, Store/Product catalog, cart, Admin commerce, and order DTOs batch-resolve canonical references without N+1 provider calls.
- Customer Mobile reads the same stable references. Its client converts only `/media/` and authenticated media paths to the configured API origin, leaving navigation and arbitrary strings untouched. Avatar management uses the Gate 5A direct-upload flow, runtime private download target, canonical attach/replace/detach, localized AR/EN/CKB states, and a meaningful accessibility label.
- Mobile physical camera/library/HEIC/poor-network validation was not performed. Gate 5B adds photo-library selection only; physical-device proof remains Stage 7.

## Commerce snapshot policy

Cart and checkout resolve Store/Product media in bounded batches. A new order snapshots `/media/<assetId>` for canonical public media, or a sanitized legacy HTTPS/same-origin reference/null. It never stores a signed provider URL, object key, checksum, or credential. Existing `Order.storeLogoUrlSnapshot` and `OrderItem.imageUrlSnapshot` values are not rewritten.

Snapshots are historical display references, not retention pins. If the source binding is later detached or its asset is subsequently deleted through the legal lifecycle, the stable route returns 404 while the immutable snapshot string remains unchanged. This is explicit rather than silently resurrecting detached legacy media.

## Transformation boundary

Gate 5A exposes inspected original dimensions and no configured immutable transformation provider. Gate 5B therefore serves the inspected original through stable delivery with bounded client layout. It creates neither persistent derived files nor a `MediaRendition` table. Responsive immutable variants, CDN transformation policy, and persistent rendition operations remain a Stage 6/provider handoff; no migration 41 or worker was added.

## Performance and query plans

Public projections accept at most 500 already-authorized targets and use three fixed database queries: typed containers, relevant ACTIVE bindings joined to assets, and distinct slot history markers. They use Maps for in-memory assembly and make no provider call during list/detail database work. Galleries and Product media are database-bounded at 24 and 12. Management Service media uses the real Service ID internally even for identical names while preserving the restricted Receptionist/Staff DTO.

Representative PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` evidence covers container-by-target partial unique indexes; the ACTIVE singleton partial index; ACTIVE ordered collection index; ACTIVE asset index; actor/idempotency unique index; Organization/kind list index; and Product target plus ordered Product binding indexes. The populated fixture selected `MediaContainer_business_profile_target_key`, `MediaBinding_active_singleton_slot_key`, `MediaBinding_containerId_state_slot_sortOrder_id_idx` (index-only for gallery and Product), `MediaBinding_active_asset_key`, `MediaMutation_actorPersonId_idempotencyKey_key`, `MediaContainer_kind_updatedAt_id_idx`, and `MediaContainer_product_target_key`. Execution times were 0.014–0.060 ms locally. Plan proof comes from PostgreSQL, not SQLite or mocks.

## Deterministic fixture and local staging rehearsal

The manual fixture marker is `rezno-qa-media-gate5b`. It has exact UUIDs/timestamps/order for 11 actors, two Organizations and settings, supported/foreign targets, 32 assets covering READY/REJECTED/QUARANTINED/DELETE_PENDING, six containers, 15 active/history bindings, 12 mutations, and legacy values. Safety requires `NODE_ENV=test`, `REZNO_ENV=staging`, the exact confirmation token, PostgreSQL, database name `rezno_staging`, and 40/40. Cleanup addresses only exact IDs and rejects production/live markers.

Local rehearsal results (not represented as real staging): run 1 and run 2 produced identical fingerprint `cdd3643643e1a400d5cf7f770bac02974cbe7a92485175b1f19ba69a905b25da`; focused smoke passed 50 checks and restored the same fingerprint; cleanup removed the exact fixture counts including 32 assets, 15 bindings, 12 media mutations, six containers, and two settings; second cleanup returned zero for every table.

Real staging evidence is added from the immutable exact PR-head Preview only. No credential, database URL, provider key, signed URL, OIDC token, or auth secret is printed or persisted.

## Security review

The explicit review covered binding/container IDOR, Person/Organization/active-Business confusion, membership and Role-ID replacement, Receptionist/Staff escalation, Admin permission bypass, non-READY/purpose/visibility mismatches, cross-slot/target/variant reuse, partial-index races, reorder/replacement concurrency, attached deletion, rejection without detach, raw writers, legacy SSRF/client request risk, alt-text XSS, signed URL/object-key leakage, detached legacy resurrection, Next Image fetching, provider-state truth, fixture production guards, and cleanup scope.

Findings fixed during review included: removing a module-global target display cache; bounded history-marker loading; closing all remaining ProductMedia mutation functions; redacting raw legacy URLs from audit snapshots; post-provider binding/actor revalidation; strict public-target lifecycle checks; an authenticated same-tenant draft preview route; absolute trusted Mobile managed-media resolution; collision-free Service ID mapping without widening restricted DTOs; and stronger legacy host/IP rejection. No P0, P1, or P2 remains in the reviewed Gate 5B code.

## Validation and handoff

Local evidence on the frozen source tree includes clean root/Mobile installs, Prisma format/validate/generate, zero-warning ESLint, root and Mobile TypeScript, 16/16 focused media unit tests, 372/372 complete unit tests, 11/11 focused PostgreSQL media tests, 337/337 complete PostgreSQL tests, and 94/94 complete production HTTP/RSC/API tests with no skip. The non-overlapping complete regression total is 803/803. The final production build passed, as did the Expo dependency check, Expo Doctor 20/20, and Android/iOS Hermes exports. Source, Mobile, server-build, and client-build credential scans found no real credential or local test secret; the only source-pattern matches are documented placeholders and tests. `npm audit` reports no high or critical advisory: the root has five moderate advisories in Prisma development tooling and Next's bundled PostCSS path, while Mobile has ten moderate advisories in Expo CLI/config/prebuild tooling. The proposed automated fixes are incompatible major-version changes, and none of the affected tooling paths accepts or serves Gate 5B media at runtime; no P2 finding is open. Exact-head CI/Preview, real-staging 40/40 execution, and PR state are recorded only after publication.

Production storage remains unconfigured and physical-device QA remains not performed. Gate 5C (payments) and Gate 5D (Stage 5 closure) remain unstarted. Gate 5D receives this document, migration/staging/CI evidence, the provider truth, and the physical-device deferral; it must not treat Gate 5B alone as Stage 5 completion.
