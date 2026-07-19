# Gate 5B — Media lifecycle and domain integration

Status: mandatory existing-media audit complete; canonical implementation and migration 40 have not started in this document revision.

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

## Pending implementation evidence

The schema, lifecycle services, UI/API integrations, migration rehearsals, performance plans, staging fixture/smoke, security review, and final validation totals will be appended only after their respective proof completes.
