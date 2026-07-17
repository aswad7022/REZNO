# Stage 3D Commerce Admin and Stage 3 closure

Status: implementation and local closure completed on 2026-07-17; exact-head
real-staging evidence remains intentionally pending until the Draft PR preview is
Ready.

Baseline: `origin/main` and this worktree started at
`29d907b57cf7238805669e38469725660ca8d6ec`. The repository contains 33
forward-only migrations, and the real `rezno_staging` database was verified as
33/33 before this gate. PR #100 remains an unrelated Open Draft at
`e46454df993ecccb06180060dda4353ec88e2641`.

## Architecture audit

### Runtime and ownership map

- Admin authentication is resolved in `features/admin/services/admin-auth.ts`.
  It supports database `AdminAccess` grants and the `REZNO_ADMIN_EMAILS`
  environment allowlist. Commerce converts that result into a React-independent
  `CommerceAdminContext` in `features/commerce/services/authenticated-context.ts`.
- Transaction-time Commerce authorization lives in
  `features/commerce/services/authorization.ts`. It already rechecks the active,
  non-deleted `Person`, database access status/expiry/current permissions, or the
  environment allowlist. The context must be generalized so reads and mutations
  share the same exact dependency-aware permission policy.
- Admin navigation is rendered by `features/admin/components/admin-shell.tsx`.
  The Commerce link currently requires `COMMERCE_STORES_VIEW`, so Catalog-only,
  Inventory-only, Orders-only, and Audit-only administrators cannot discover the
  hub even though their direct permissions exist.
- `/admin/commerce` is a Store-only Gate 3A queue. The only implemented Admin
  Commerce routes are the hub, Store list, and Store detail.
- Gate 3A canonical Store writes are in `store-service.ts`; Gate 3B canonical
  Product/Variant/media writes are in `merchant-product-service.ts` and Inventory
  writes in `inventory-service.ts`; Gate 3C canonical Order aggregate writes are
  in `order-service.ts`. These services provide the transaction/lock/version/
  replay patterns Stage 3D must extend.
- Merchant Commerce navigation and the hub expose Store, access, Products,
  Inventory, and Orders. `REPORTS_VIEW` exists in the role model but no reports
  route, navigation entry, or report service exists.
- Public discovery uses `features/commerce/public/catalog-service.ts` and
  `public/visibility.ts`; Favorites use `customer-favorite-service.ts`; Cart and
  Checkout use their own aggregate services. The public and Checkout queries
  already require an ACTIVE Category, but Cart serialization does not currently
  include Category state and can therefore report an affected retained line as
  available.

### Current permission matrix and gaps

The locked Commerce Admin permissions already exist and are sufficient:

| Capability | View | Mutation |
| --- | --- | --- |
| Stores | `COMMERCE_STORES_VIEW` | `COMMERCE_STORES_REVIEW` |
| Categories and Products | `COMMERCE_CATALOG_VIEW` | `COMMERCE_CATALOG_MODERATE` |
| Inventory | `COMMERCE_INVENTORY_VIEW` | `COMMERCE_INVENTORY_MANAGE` |
| Orders | `COMMERCE_ORDERS_VIEW` | `COMMERCE_ORDERS_MANAGE` |
| Commerce Admin audit | `AUDIT_LOG_VIEW` | none |

The mutation dependencies are not enforced by Admin-access management today.
`grantAdminAccess` and `updateAdminAccess` normalize known values but accept, for
example, `COMMERCE_ORDERS_MANAGE` without `COMMERCE_ORDERS_VIEW`. Stage 3D will
reject these invalid combinations and will never silently add the missing View
permission. Super Admin retains all capabilities. The Commerce hub and top-level
navigation will use an any-Commerce-capability predicate; every card, link, RSC
payload, query, and action remains protected by its exact permission.

### Thirty-point findings

1. **Permission matrix:** all nine required permissions exist; dependency
   validation is missing from grant/update flows.
2. **Navigation:** the Admin Commerce link is incorrectly Store-specific and
   there is no permission-aware Commerce sub-navigation.
3. **Store coverage:** approve, reject, suspend, and reactivate are implemented
   with lifecycle checks, a serializable transaction, Store lock, expected
   version, UUID key, canonical hash, exact audit replay, and notification.
4. **Store hardening gaps:** list DTO reuses Owner-management data; date parsing
   silently drops malformed dates; updated/readiness/public filters are absent;
   detail audit is fixed at 20 rather than cursor-paginated; Admin replay metadata
   does not explicitly bind source/access/permission; active-Order blockers are
   not shown.
5. **Category management:** no Admin routes, service, strict mutation schemas,
   lifecycle, impact preview, or audit path exists.
6. **Product moderation:** an old exported `suspendProduct` function updates by
   bare Product ID with no expected version, UUID idempotency, lock,
   transaction-time Admin revalidation, replay result, or sanitized before/after
   snapshot.
7. **Product reactivation:** no Admin clearance path exists. The locked policy is
   SUSPENDED to DRAFT only, with explicit Merchant republish afterward.
8. **Inventory visibility:** no cross-tenant Admin list/detail routes or DTOs
   exist.
9. **Inventory correction:** only the Merchant adjustment path exists. It has
   integer/reserved-floor protection but creates a BusinessAuditLog and is not an
   Admin correction contract.
10. **Order visibility:** no Admin Order list/detail routes or redacted DTOs
    exist.
11. **Existing Admin Order mutations:** none are production-reachable. The
    system expiration function exists, while Merchant/customer transitions are
    correctly actor-scoped.
12. **Safe Order limits:** the only safe additions are overdue PENDING expiry,
    UNPAID PENDING cancellation, UNPAID CONFIRMED cancellation with consumed
    stock restock, and DELIVERY_FAILED cancellation with explicit returned-stock
    confirmation. Paid, completed, OUT_FOR_DELIVERY direct cancellation, payment,
    refund, confirmation, and fulfillment mutations remain denied.
13. **Admin audit coverage:** Store moderation writes `AdminAuditLog`; the legacy
    Product suspension writes an incomplete row. No Category, Inventory, or Order
    Admin audit implementation exists.
14. **Audit pagination:** no Commerce audit route/service or opaque cursor exists;
    Store detail fetches a fixed unpaginated slice.
15. **Admin IDOR:** Store reads are globally keyed by ID, which is appropriate for
    Admin scope only after exact permission revalidation. New detail routes must
    validate UUIDs, authorize before loading, and expose domain-specific DTOs.
16. **AdminAccess expiry/revocation:** initial and transaction-time checks exist,
    but all new queries and every mutation must use them. Admin-access dependency
    validation is still missing.
17. **Environment Super Admin:** mutation-time allowlist revalidation already
    exists and must be retained for every new mutation and its replay path.
18. **PII:** current Merchant Order DTOs contain customer operational details and
    cannot be reused for Admin lists. Admin lists must structurally omit phone,
    address, coordinates, and instructions; detail may expose only bounded
    operational PII.
19. **Historical unsafe media:** safe URL serializers exist for Store, Product,
    Inventory, public, Favorite, Cart, and Order snapshots. Admin DTOs must expose
    safe URLs plus structural unsafe flags, never raw unsafe values.
20. **Inventory overflow/underflow:** `POSTGRES_INT_MAX`, safe-integer checks,
    `checkedInventoryResult`, and reserved-floor logic exist and can be reused.
21. **Reserved stock:** Merchant adjustment correctly refuses `onHand < reserved`.
    Admin correction must never mutate `reserved` and must lock the same aggregate.
22. **Paid Orders:** the Gate 3C engine checks Order/Payment consistency and blocks
    paid cancellation; the Admin wrapper must enforce this before any side effect.
23. **Category effects:** public catalog, Favorites, add-to-Cart, and Checkout use
    ACTIVE Category constraints. Retained Cart serialization is the gap; Order
    snapshots and reservations are already independent of later Category state.
24. **Product suspension effects:** public visibility, Favorites, add-to-Cart, and
    Checkout honor Product status. Retained Cart lines become unavailable when
    Product state is checked; existing Orders remain snapshot/reservation based.
25. **`REPORTS_VIEW`:** it is granted by the Commerce permission model and Owner
    effective permissions but has no route/service/navigation implementation.
26. **Placeholders:** the Merchant Commerce hub renders a truthful but unfinished
    “not available” card for any missing capability and has no Reports card. The
    deferred Stage 4–8 registry itself is correct and must remain unchanged.
27. **Duplicate write paths:** `catalog-service.ts` exports obsolete create,
    Variant, publish, archive, and unsafe Admin suspend functions. No production
    caller uses those writes; only its legacy public Store/Product predicates are
    imported by old Favorite helpers. Those Favorite helpers are also not routed.
    The obsolete writes can be removed after tests are moved to canonical paths.
28. **Current indexes:** Store queues, Store updates, merchant Products,
    Inventory updates/movements, Store-scoped Orders, Order history, and actor/
    action Admin audit prefixes are indexed. Global Admin Product/Order/audit
    cursor sorts and full target audit history are not fully covered.
29. **Migration 34:** required, but limited to indexes proved by Stage 3D global
    cursor queries. The proposed Category status/display candidate was rejected
    because the implemented queue orders by `updatedAt`; the final migration adds
    Category updated/id, Product status/updated/id, Product category/status/
    updated/id, Order status/updated/id, AdminAuditLog created/id, and
    AdminAuditLog target/type/created/id.
30. **Stage 3 closure:** technically achievable in this gate without Stage 4–8.
    It requires the missing Admin domains, reports, public/Cart consistency,
    removal of obsolete write exports, comprehensive automated coverage, fixture,
    exact-head CI/Vercel, and real-staging closure.

## Locked implementation architecture

### Admin context, replay, and DTO boundaries

One React-independent Admin resolver will issue the server-derived context. A
single permission helper will express the four mutation-to-view dependencies and
the any-Commerce hub predicate. Every mutation will run in a serializable
transaction and, before its first side effect and again after target locks where
appropriate, verify User/Person, source or AdminAccess, expiry/status, normalized
permissions, Super Admin state, and exact requested permission.

`AdminAuditLog` remains both the audit ledger and replay ledger. Its canonical
request hash and sanitized metadata will bind source, AdminAccess ID, permission,
action, target type/ID, expected version, and normalized input. Exact replay
returns the stored safe result and creates no new audit, movement, history, or
notification row. Any changed binding returns `IDEMPOTENCY_CONFLICT`.

Admin list/detail DTOs are separate named structural contracts. Read-only DTOs do
not carry expected versions or mutation controls. Mutation controls are added only
when the current actor has the matching mutation permission and the aggregate is
eligible. Owner-management DTOs are not Admin list contracts.

### Lifecycle policies

- Store transitions remain Gate 3A transitions. ARCHIVED is terminal.
- Category transitions are ACTIVE to INACTIVE, INACTIVE to ACTIVE, and ACTIVE or
  INACTIVE to ARCHIVED. ARCHIVED is terminal and there is no hard delete.
- Any non-ARCHIVED Product can be suspended with a bounded reason. Only SUSPENDED
  can be cleared, and clearance returns it to DRAFT with `publishedAt` cleared.
- Admin Inventory correction changes only `onHand` by a signed nonzero delta,
  preserves `reserved` and threshold, emits exactly one ADMIN StockMovement and
  one Admin audit row, and is unavailable for archived relationships.
- Admin Order intervention extends the Gate 3C aggregate engine and its inventory
  lock/release/restock/history/notification mechanics, but records ADMIN actor
  history and no Merchant BusinessAuditLog.

### Pagination, time, privacy, and performance

Every Stage 3D collection uses an opaque checksum cursor bound to Admin identity,
source/access, permission, collection target, normalized filters, sort, and a
single evaluation snapshot. Dates require complete ISO-8601 instants with `Z` or
an explicit offset, are inclusive, and invalid values are visible validation
errors rather than silently ignored. Page sizes and date ranges are bounded;
Merchant reports default to the last 30 completed UTC days and allow at most 90
days.

Admin lists use projected selects and bounded counts. Order list DTOs redact PII;
audit metadata is recursively sanitized and only safe target links are rendered.
Reports use bounded aggregate SQL, return operational counts only, and never
hydrate customer rows or expose financial/customer fields.

## Canonical write-path registry

| Domain | Canonical entry point after Stage 3D |
| --- | --- |
| Merchant Store | `store-service.ts` |
| Merchant Product/Variant/media | `merchant-product-service.ts` |
| Merchant Inventory | `inventory-service.ts` |
| Merchant/customer/system Order | `order-service.ts` |
| Admin Store moderation | `store-service.ts` through Admin actions |
| Admin Category administration | new Category Admin service |
| Admin Product moderation | new Product Admin service |
| Admin Inventory correction | new Inventory Admin service |
| Admin Order intervention | Gate 3C `order-service.ts` extension |

The obsolete service `catalog-service.ts` and its mutation exports were removed.
The unrouted legacy Favorite helpers that depended on it were removed as well;
the routed customer Favorite and public catalog services remain canonical. No
compatibility wrapper bypasses the canonical invariants.

## Migration and operational plan

Migrations 1–33 remain byte-for-byte untouched. Migration 34 adds only the six
proved logical indexes with normal forward migration SQL. Fresh-schema and
33-to-34 rehearsal are complete locally; real-staging deploy is deferred until
the exact PR-head Preview is Ready.

The deterministic fixture namespace is `rezno-qa-commerce-admin-stage3d`. It
creates scoped Admin identities and bounded Commerce aggregates, preserves
foreign and prior-gate data, executes twice with an identical fingerprint, and
resets only its own namespace. No physical-device QA is part of this gate.

## Deferred ownership

Stage 4 remains Notifications and Messaging; Stage 5 remains Media, Storage and
Payments Foundation; Stage 6 remains Admin and Platform Operations; Stage 7
remains Release QA; Stage 8 remains Final Visual Polish. REZNO AI remains after
Stage 8. This gate does not modify those owners or their registry.

## Implemented Stage 3D architecture

### Authorization and capability surfaces

`commerceAdminPermissions` is the single locked list of Commerce Admin
capabilities. `effectiveAdminPermissions` normalizes database grants, rejects
mutation permissions whose View dependency is absent, and gives a current
Super Admin the complete set. Admin-access creation and update reject invalid
combinations instead of silently escalating them. The Commerce navigation and
hub accept any Commerce capability, while every sub-navigation item, count,
route, query, mutation control, and target link checks its exact permission.

`resolveAuthenticatedCommerceAdmin` is React-independent. Database-backed and
environment-backed access both require an authenticated User and an active,
non-deleted Person. Database access additionally requires current ACTIVE status,
unexpired access, and current effective permissions. Every mutation repeats the
check inside its serializable transaction and binds the resolved source/access
to the replay ledger.

### Store moderation closure

Store list and detail now use dedicated Admin structural DTOs. The list supports
status, search, submitted/updated ranges, readiness, and visibility filters. The
detail supplies safe profile/readiness data, Organization state, media flags,
bounded Product/Inventory/Order counts, active blockers, available controls, and
cursor-paginated target audit history. It exposes neither membership data nor
customer PII.

Gate 3A transitions remain authoritative. Approve, reject, suspend, and safe
reactivation require the exact permission, UUID key, exact version, canonical
hash, locked Store, current Admin revalidation, normalized reason where needed,
and exactly one audit/notification side-effect on the first success. Replay is
side-effect free and changed replay or a stale version fails closed.

### Category lifecycle and impact

The Category service owns ACTIVE create, profile/order update, ACTIVE to
INACTIVE, INACTIVE to ACTIVE, and ACTIVE/INACTIVE to terminal ARCHIVED. Inputs
are strict; name, lowercase slug, regenerated normalized name, signed display
order, target UUID, exact version, UUID key, and request hash are bounded.

Deactivation/archive impact is calculated from bounded Product, published
Product, active Cart-item, and nonterminal historical Order counts. Published
impact requires explicit confirmation. Category state is not copied into Product
state: public discovery, Favorites, new Cart additions, retained Cart
availability, and Checkout read the authoritative Category relationship;
existing Cart rows remain stored, and existing Order snapshots/reservations
remain readable and processable.

### Product moderation

Admin Product list/detail are separate from Merchant DTOs. List rows include
only Product, Store/Organization, Category, lifecycle, safe primary media,
active Variant count, public visibility, readiness, and update time. Detail is
read-only for Merchant-owned profile, prices, SKU/options, Category assignment,
media, and threshold. Historical unsafe media is represented by structural flags
and a null safe URL.

Any non-ARCHIVED Product can be suspended with a required reason. Only SUSPENDED
can be cleared, and clearance returns it to DRAFT with `publishedAt` cleared so
the Merchant must explicitly satisfy readiness and republish. Suspension hides
new discovery/Favorites/Checkout and makes retained Cart rows unavailable; it
does not mutate active reservations or historical Order snapshots.

### Inventory oversight and correction

Admin Inventory list/detail expose cross-tenant operational data with exact
permission, bounded search/status/availability/reserved filters, safe media,
available quantity, threshold, version, active reservation count, and cursor-
paginated StockMovement history. Customer data is absent.

Correction changes `onHand` only by a signed nonzero delta. A locked aggregate,
current permission, exact version, UUID replay key/hash, bounded reason, safe JS
integer, PostgreSQL Int capacity, and `onHand >= reserved` are mandatory.
`reserved` and threshold are immutable. A first success creates exactly one
ADMIN ADJUSTMENT movement and one Admin audit, never a Business audit. Archived
Store/Product/Variant relationships and inconsistent relationships fail closed;
suspended aggregates remain operationally correctable without becoming public.

### Order oversight and intervention

Admin Order summaries are structurally redacted: no phone, address, coordinate,
or instructions. Detail provides only necessary operational PII plus immutable
snapshots, Payment consistency, reservations, movements, lifecycle, Merchant
audit summary, and Admin history. Lists support the locked operational filters,
complete ISO ranges, snapshot cursors, overdue and delivery-failure queues.

Admin intervention calls the Gate 3C aggregate engine. It permits overdue
PENDING expiration; UNPAID PENDING cancellation; UNPAID CONFIRMED cancellation
with canonical restock; and DELIVERY_FAILED cancellation only after explicit
physical-return confirmation. It denies confirmation, fulfillment advancement,
payment, completion, PAID/COMPLETED cancellation, direct OUT_FOR_DELIVERY
cancellation, refund, amount/snapshot edits, and actor impersonation. First
success has one ADMIN history event, one Admin audit, canonical release/restock,
and exact customer/Merchant notification; replay duplicates nothing and no
Merchant BusinessAuditLog is written.

### Audit, reports, and DTO policy

`/admin/commerce/audit` returns Commerce-related AdminAuditLog rows only. Its
descending `(createdAt,id)` cursor is bound to actor, source/access, permission,
filters, target, and evaluation snapshot. Metadata is recursively sanitized;
credential/session/authorization/database/customer/payment secrets are not
serialized. Target links are capability-aware.

`/business/commerce/reports` closes `REPORTS_VIEW` with a read-only operational
report. It defaults to the last 30 completed UTC days, accepts at most 90 days,
uses one evaluation instant and bounded aggregate SQL, and returns lifecycle,
fulfillment, completion/closure, units, bounded top Products, low/out-of-stock,
active Product, and Store readiness/visibility metrics. It intentionally omits
revenue, profit, settlement, fees, taxes, refunds, providers, and all customer
PII.

The implemented structural contracts are
`ADMIN_COMMERCE_OVERVIEW`, `ADMIN_STORE_SUMMARY`, `ADMIN_STORE_DETAIL`,
`ADMIN_CATEGORY_SUMMARY`, `ADMIN_CATEGORY_DETAIL`, `ADMIN_PRODUCT_SUMMARY`,
`ADMIN_PRODUCT_DETAIL`, `ADMIN_INVENTORY_SUMMARY`, `ADMIN_INVENTORY_DETAIL`,
`ADMIN_ORDER_SUMMARY`, `ADMIN_ORDER_DETAIL`, and
`ADMIN_COMMERCE_AUDIT_ENTRY`. Mutation versions and controls are present only in
eligible DTOs for an actor with the matching mutation permission.

### Canonical mutation and replay policy

AdminAuditLog is the only generic Admin mutation/replay ledger. The stored
binding covers Admin User, environment/database source, AdminAccess ID,
permission, action, target type/ID, expected version, and canonical request hash.
It stores a safe result plus sanitized before/after metadata. Exact replay
returns that result and writes zero additional rows. Any binding change yields
`IDEMPOTENCY_CONFLICT`; denial yields zero audit, ledger, movement, history, or
notification side effects.

Production-reachable mutation ownership is now:

| Aggregate | Canonical service |
| --- | --- |
| Merchant Store | `store-service.ts` |
| Merchant Product/Variant/media | `merchant-product-service.ts` |
| Merchant Inventory | `inventory-service.ts` |
| Merchant/customer/system/Admin Order | `order-service.ts` |
| Admin Store | `store-service.ts` via Admin actions |
| Admin Category | `admin-category-service.ts` |
| Admin Product | `admin-product-service.ts` |
| Admin Inventory | `admin-inventory-service.ts` |

The old services-layer `catalog-service.ts` and unrouted duplicate Favorite
helpers were removed. Public reads remain in `features/commerce/public`, and no
production caller or exported compatibility write bypasses actor, version,
idempotency, lock, audit, or lifecycle invariants.

## Pagination, performance, and migration evidence

Admin cursors use checksummed opaque envelopes bound to the actor, source/access,
exact permission, target, normalized filters, sort, page size, and one evaluation
snapshot. Complete ISO-8601 instants must carry `Z` or an explicit offset;
bounds are inclusive and invalid input is shown as a validation error. Admin and
report ranges and page sizes are bounded, and totals do not depend on page size.

Migration `20260717193000_commerce_admin_stage3d_indexes` is migration 34. It
adds:

- `MarketplaceCategory(updatedAt,id)`;
- `Product(status,updatedAt,id)`;
- `Product(categoryId,status,updatedAt,id)`;
- `Order(status,updatedAt,id)`;
- `AdminAuditLog(createdAt,id)`;
- `AdminAuditLog(targetType,targetId,createdAt,id)`.

With sequential scans disabled solely to make candidate selection observable on
the small deterministic fixture, PostgreSQL selected every new index for its
matching Category, Product, Order, global-audit, and target-audit query. Existing
Store queue, Inventory update, StockMovement history, Order-history, and report
plans selected their existing indexes, so no redundant replacements were added.
The originally suggested Category status/display index was not added because it
does not match the implemented updated-time cursor.

Local migration proof:

- a fresh empty database deployed migrations 1–34 successfully;
- an independent database deployed 1–33 from an isolated migration copy, then
  deployed only migration 34 successfully;
- a second fresh database deployed the corrected final migration 1–34;
- both final databases reported 34 migrations and no pending migration;
- migrations 1–33 were not edited.

## Deterministic fixture and local validation evidence

The local exact-name disposable `rezno_staging` database ran the fixture twice.
Both runs produced fingerprint
`101c94ba87b3c458c707b29ddae24436ee0665d7ab285099782bf8461a8f229e` with 11
AdminAccess rows, 7 Stores, 5 Inventory items, 8 Orders, and 4 seeded Admin audit
rows. The fixture includes 13 logical Admin identities (including environment,
expired, revoked, and foreign identities), all required Commerce lifecycle
states, unsafe-media sentinels, reserved/near-Int Inventory, Order/Payment/
reservation states, Business/Admin audits, Merchant reports, and a foreign
tenant. It resets only its owned namespace.

Local validation completed on 2026-07-17:

| Validation | Result |
| --- | --- |
| root clean install | passed |
| ESLint | passed |
| root non-incremental TypeScript | passed |
| Prisma format/validate/generate | passed |
| unit suite | 255/255 |
| PostgreSQL integration suite | 226/226 |
| production HTTP/RSC/Server Action suite | 66/66 |
| focused Stage 3D unit/integration | 17/17 |
| Next production build | passed; all Stage 3D routes emitted |
| mobile clean install and TypeScript | passed |
| Expo dependency validation | up to date |
| Expo Doctor | 20/20 |
| Android export | passed |
| iOS export | passed |
| diff whitespace validation | passed |

The existing Prisma/pg adapter emits a non-failing `client.query()` deprecation
warning in older concurrent integration paths. Dependency audit reports five
root and ten mobile moderate advisories, with no high or critical advisory at
the configured threshold; suggested automatic fixes are breaking dependency
downgrades and were not applied in this gate.

## Real-staging evidence

Pending the exact PR-head Vercel Preview. This section will be replaced with the
deployment SHA, Ready URL, 34/34 deploy evidence, two identical fixture runs,
prior Gate 3A–3C fingerprint proof, scoped-role smoke results, exact side-effect
counts, cleanup, and deterministic restoration before the Draft PR is marked
Ready.

## Stage 3 closure matrix

| Surface | Route/service | Authorization | Automated proof | Staging | Remaining limitation / owner |
| --- | --- | --- | --- | --- | --- |
| Merchant Store lifecycle | `/business/commerce/store`; `store-service.ts` | `STORE_VIEW`/`STORE_MANAGE` | Gate 3A + full regressions | pending final smoke | managed upload: Stage 5 |
| Commerce access | `/business/commerce/access` | Owner role policy | Gate 3A + Stage 3D dependency tests | pending final smoke | no limitation in Stage 3 |
| Products | `/business/commerce/products`; canonical Merchant service | Product permissions | Gate 3B + full regressions | pending final smoke | managed media: Stage 5 |
| Variants | Product detail; canonical Merchant service | Product permissions | Gate 3B + full regressions | pending final smoke | no limitation in Stage 3 |
| Product media metadata | Product detail; canonical Merchant service | Product permissions | unsafe-media unit/HTTP regressions | pending final smoke | upload/storage/transformation: Stage 5 |
| Inventory | `/business/commerce/inventory`; `inventory-service.ts` | Inventory permissions | Gate 3B + Stage 3D regressions | pending final smoke | no limitation in Stage 3 |
| Orders | `/business/commerce/orders`; `order-service.ts` | `ORDER_VIEW`/`ORDER_MANAGE` | Gate 3C + full regressions | pending final smoke | gateways/refunds: Stage 5 |
| Fulfillment | Order detail/actions; Gate 3C engine | `ORDER_MANAGE` | lifecycle/race/replay PostgreSQL + HTTP | pending final smoke | courier integration excluded |
| Operational reports | `/business/commerce/reports`; report service | `REPORTS_VIEW` | Stage 3D unit/PostgreSQL/HTTP | pending final smoke | financial reports/payments: Stage 5 |
| Admin Stores | `/admin/commerce/stores`; Store/Admin query services | Store View/Review | Gate 3A + Stage 3D | pending final smoke | no limitation in Stage 3 |
| Admin Categories | `/admin/commerce/categories`; Category Admin service | Catalog View/Moderate | Stage 3D PostgreSQL/HTTP | pending final smoke | no limitation in Stage 3 |
| Admin Products | `/admin/commerce/products`; Product Admin service | Catalog View/Moderate | Stage 3D PostgreSQL/HTTP | pending final smoke | Merchant profile ownership retained |
| Admin Inventory | `/admin/commerce/inventory`; Inventory Admin service | Inventory View/Manage | Stage 3D PostgreSQL/HTTP | pending final smoke | no limitation in Stage 3 |
| Admin Orders | `/admin/commerce/orders`; Gate 3C engine wrapper | Orders View/Manage | Stage 3D PostgreSQL/HTTP | pending final smoke | payment/refund actions: Stage 5 |
| Admin Commerce audit | `/admin/commerce/audit`; audit service | `AUDIT_LOG_VIEW` | cursor/privacy/replay tests | pending final smoke | platform-wide operations: Stage 6 |

All Stage 3 cards and routes are implemented, reachable, authorized, tested, or
explicitly owned by a later locked stage. Notification-center/outbound delivery
is Stage 4; media/storage and payments/refunds/settlements are Stage 5;
production scheduler and platform operations are Stage 6; physical-device and
release QA are Stage 7; visual redesign is Stage 8; AI begins only after Stage 8.

## Security review

The final local review explicitly tested or inspected Admin/target IDOR,
permission-dependency bypass, access expiry/revocation, environment access
revalidation, Store/Category/Product/Inventory/Order races, replay across actor/
source/permission/target/action, cursor cross-permission reuse, PII and unsafe
media serialization, reserved-stock mutation, Int overflow/underflow, paid and
OUT_FOR_DELIVERY denial, duplicate release/restock/audit, mass assignment, raw
database error responses, CSRF/Origin behavior of real Server Actions, temporary
credential files, production mock fallback, and legacy exported writes.

No P1 or P2 finding remains locally. Process-local rate limiting remains an
explicit deployment limitation: it is safe per process but is not a distributed
global quota and belongs to Stage 6 platform operations. No credentials or
temporary environment files were created, and no physical-device QA is claimed.
The final security verdict remains conditional only on exact-head CI/Vercel and
real-staging closure.
