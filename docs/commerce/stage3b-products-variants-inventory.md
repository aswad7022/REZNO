# Stage 3B — Products, Variants and Inventory

Status: mandatory pre-implementation architecture audit completed on 2026-07-17.

Scope: Gate 3B only. Merchant Orders and fulfillment, payments, MarketplaceCategory
administration, broad Commerce Admin moderation, managed media upload, Business
Mobile Commerce, physical-device QA, visual redesign and AI remain deferred.

## Baseline

- Source baseline: `origin/main` at
  `b371b19cf662e36bf7683e9a763c5987dd3dbfbc`.
- PR #113 is merged with that exact merge commit.
- Repository and `rezno_staging` both contain 31 applied migrations; staging has
  zero unfinished and zero rolled-back migrations.
- Staging currently contains two Products, two Variants, two InventoryItems and
  three StockMovements. It has no duplicate/missing active Default Variant,
  normalized SKU/option/slug collision or invalid Inventory state.
- PR #100 remains an unrelated Open Draft at
  `e46454df993ecccb06180060dda4353ec88e2641`.
- Gate 3C and Gate 3D have no Business operations routes. The existing Commerce
  hub truthfully labels Products/Inventory as Gate 3B and Orders as Gate 3C.

## Runtime architecture map

- Prisma schema and migrations define the Commerce aggregate and database
  invariants.
- React-independent Commerce domain and service modules live under
  `features/commerce`.
- Public and authenticated APIs live under `app/api/commerce`.
- Business Web currently exposes only the Commerce hub, Store operations and
  Owner Commerce-access administration under `app/business/commerce`.
- Admin Web exposes Store moderation only. Product moderation and category
  administration remain Gate 3D.
- Customer Web/mobile consume the public catalog and authenticated Cart,
  Checkout, Favorites, Orders and Notifications APIs.
- CI executes complete unit, PostgreSQL integration and production HTTP/RSC
  suites through `.github/workflows/marketplace-pr-ci.yml`.

## Mandatory architecture audit findings

1. Product lifecycle services currently support create-as-DRAFT, publish,
   archive and Admin suspend. Merchant update and unpublish do not exist.
2. Variant lifecycle currently supports create only. Update, atomic Default
   switch, archive and restore do not exist.
3. Product update is missing for name, slug, description and category, so
   `normalizedSearchText` cannot be maintained after creation.
4. Variant update/archive/default operations are missing and there is no
   replacement contract when the Default is archived.
5. ProductMedia has schema relationships and public reads, but no Merchant
   add/update/reorder/remove service or UI.
6. Business Product and Inventory pages do not exist. Merchant Inventory is API
   only.
7. Current publish readiness checks only ACTIVE Store plus one active Variant.
   They omit Organization/category state, exactly one active Default, Variant
   price/SKU/options/Inventory validity and media safety.
8. Existing Product/Variant mutations do not accept `Product.updatedAt` as an
   expected aggregate version and do not lock/touch the Product aggregate.
9. Existing Product/Variant mutations do not require UUID idempotency keys,
   canonical request hashes or stored authoritative replay DTOs.
10. Existing Merchant Product/Variant operations write no
    BusinessOperationMutation or BusinessAuditLog.
11. Inventory adjustment uses StockMovement as its exact-once ledger. The API
    accepts a UUID, but the service accepts a loose 8–200 character key, lacks
    an explicit canonical request hash and expected Inventory version, and does
    not write a Business audit row.
12. The current partial unique index allows at most one `isDefault=true`
    non-ARCHIVED Variant. It prevents multiple active Defaults but is broader
    than the required ACTIVE-only invariant and future atomic switching has no
    service contract.
13. Multiple active Defaults are currently database-blocked, and live staging
    has zero violations. The exact ACTIVE-only invariant must remain enforced
    after migration and service changes.
14. Zero active Default remains possible when a Default becomes INACTIVE or
    through future update/archive operations. Live staging has zero violations;
    services must reject any result with active Variants and no active Default.
15. SKU uniqueness is database-enforced by exact `(storeId, sku)`. Creation
    uppercases SKU, but collision errors are not mapped and historical/cross-case
    normalization is not centrally guaranteed. Live normalized collisions: 0.
16. Option uniqueness is database-enforced by exact `(productId, optionKey)`.
    Existing canonicalization does not reject duplicate normalized dimension
    names such as case/spacing-equivalent keys. Live normalized collisions: 0.
17. Product slug is exact-unique per Store and create lowercases it, but collision
    errors are not mapped to a stable domain conflict. Live normalized
    collisions: 0.
18. ProductMedia URLs have no Merchant write validation. The shared
    `isSafePublicImageUrl` helper is already the canonical HTTPS/public-host
    policy and must be reused.
19. Historical unsafe ProductMedia URLs are currently returned raw by public
    list/detail, Favorites, Cart, Merchant-adjacent DTOs and mobile Marketplace.
20. Historical unsafe `OrderItem.imageUrlSnapshot` is currently returned raw by
    Checkout receipt and customer Order summary/detail DTOs. Stored snapshots
    must remain unchanged and browser serialization must fail closed to null.
21. Inventory fields are PostgreSQL `Int`, but the domain has no signed 32-bit
    persistence constants or safe-arithmetic checks. Database overflow can leak
    to a generic internal failure.
22. Adjustment delta is bounded only at the HTTP adapter and unchecked addition
    can exceed PostgreSQL Int capacity. Direct service callers can bypass the
    HTTP bound.
23. Low-stock threshold has only a nonnegative database check. No versioned,
    idempotent Merchant mutation exists and no upper persistence bound is
    enforced in the domain.
24. `reserved >= 0` and `reserved <= onHand` are database constraints.
    Checkout/order services lock Inventory and preserve reservation accounting;
    adjustment already rejects values below the reserved floor.
25. The Inventory adjustment route performs a direct Prisma reload after the
    service returns. The canonical service must instead return its final DTO
    record.
26. Merchant Inventory cursor binding includes filters and Organization but not
    membership/actor scope or a snapshot timestamp. Product and movement cursors
    do not yet exist.
27. A malformed Inventory cursor date throws raw JavaScript Error and becomes a
    generic 500 instead of stable `INVALID_CURSOR`. Public checksum/filter
    mismatch already fails safely.
28. Existing Product creation permits every non-ARCHIVED Store. Publish requires
    ACTIVE, while Inventory mutation does not check Store lifecycle. The gate
    needs one explicit state policy for every operation.
29. Product archive makes existing Cart lines unavailable without deleting them,
    which is correct. Future Product/Variant updates must preserve Cart rows and
    let Cart/Checkout recalculate authoritative availability/prices.
30. OrderItem snapshots and active InventoryReservations use restrictive or
    nullable historical relationships. Product/Variant archival must remain
    soft and must never rewrite snapshots or invalidate pending reservations.
31. Public visibility is mostly centralized, but Checkout does not recheck
    MarketplaceCategory status after a Cart is created. Media and Order snapshot
    serialization are also inconsistent across customer/mobile boundaries.
32. Migration 32 is required. Live query-plan inspection shows explicit Sort
    nodes for Merchant Product `(updatedAt,id)`, Merchant Inventory
    `(updatedAt,id)` and StockMovement `(createdAt,id)` paths because matching
    tie-break indexes are absent. Public Product `(createdAt,id)` already has a
    matching index and will retain it. The migration will also replace the
    broader non-ARCHIVED Default index with the exact ACTIVE/non-archived partial
    invariant. Existing staging data passed the ambiguity preflight, so no
    automatic data repair is required.

## Locked authorization matrix

| Role | Product read | Product create/update/archive | Variant/media | Inventory read | Inventory adjust/threshold |
| --- | --- | --- | --- | --- | --- |
| Owner | Fixed allowed | Fixed allowed | Fixed allowed | Fixed allowed | Fixed allowed |
| Manager | Explicit `PRODUCT_VIEW` | Exact explicit create/update/archive permission | Follows exact Product mutation permission | Explicit `INVENTORY_VIEW` | Explicit `INVENTORY_ADJUST` |
| Staff | Explicit `PRODUCT_VIEW` | Never | Never | Explicit `INVENTORY_VIEW` | Explicit `INVENTORY_ADJUST` |
| Receptionist | Never | Never | Never | Never | Never |

Owner continues to use the fixed Gate 3A permission baseline. Manager receives
only persisted effective permissions and never Store management, access
administration or Admin moderation. Staff's supported assignable Commerce subset
for this gate is only PRODUCT_VIEW, INVENTORY_VIEW and INVENTORY_ADJUST. Invalid
persisted Receptionist or Staff values remain ineffective.

Every service derives the Person, selected Organization, exact active
membership, Role/SystemRole, effective permissions and Organization Store from
the canonical Gate 3A actor. Mutations transactionally revalidate the actor and
never accept client-controlled ownership or permission fields.

## Locked Store-state policy

| Store state | Product/Variant/media | Product publish | Inventory |
| --- | --- | --- | --- |
| DRAFT | Authorized preparation allowed | Forbidden | Read/prepare/adjust allowed |
| PENDING_REVIEW | Read-only to avoid changing the reviewed identity | Forbidden | Read-only |
| ACTIVE | Full permission-scoped operations | Allowed when ready | Full permission-scoped operations |
| REJECTED | Corrective preparation allowed | Forbidden | Read/prepare/adjust allowed |
| SUSPENDED | Corrective edits allowed, lifecycle cannot reactivate | Forbidden | Read/maintenance allowed |
| ARCHIVED | Read-only history | Forbidden | Read-only history |

Store and Organization public visibility always dominate Product visibility.
No Product mutation changes Store lifecycle.

## Product aggregate and DTO policy

Product is one aggregate containing identity, category, lifecycle, Variants,
active Default, media ordering, Inventory summaries and readiness. Product
`updatedAt` is the aggregate optimistic version. Every Product, Variant or media
mutation locks Product, checks the expected version, transactionally revalidates
the actor, updates Product `updatedAt`, writes exactly one mutation/audit pair and
returns the authoritative management DTO.

Structurally distinct DTOs are:

- `MERCHANT_PRODUCT_SUMMARY`: bounded identity/status/readiness, safe primary
  media, Variant/stock summaries and version only for mutation-capable actors.
- `MERCHANT_PRODUCT_MANAGEMENT`: safe full profile, Variants, media, Inventory,
  readiness, allowed actions and aggregate version.
- `MERCHANT_PRODUCT_READ_ONLY`: safe operational identity/status/Variant and
  Inventory information with no Product mutation envelope.
- `MERCHANT_INVENTORY_SUMMARY`: Product/Variant identity, safe primary media,
  quantities, threshold and low-stock state.
- `MERCHANT_INVENTORY_DETAIL`: summary plus version, bounded movement history
  and allowed Inventory actions.
- `PUBLIC_PRODUCT`: existing safe customer contract, hardened to omit/null unsafe
  media.

No DTO exposes sessions, customer PII, Cart ownership, raw unsafe URLs,
unrelated tenants, internal credentials or Admin moderation internals.

## Product validation, lifecycle and readiness

- Strict Zod schemas reject unknown fields and accept only bounded normalized
  identity, category UUID, expected version, rendered Organization guard and
  UUID idempotency envelope.
- Slugs are lowercase canonical ASCII slugs scoped to Store. Search text is
  recomputed after every identity/category-relevant update.
- Lifecycle is DRAFT create/edit, DRAFT→PUBLISHED publish,
  PUBLISHED→DRAFT unpublish, DRAFT/PUBLISHED/SUSPENDED→ARCHIVED archive, and
  ARCHIVED terminal. SUSPENDED corrective edits preserve SUSPENDED; Merchant
  reactivation is forbidden.
- Publishing requires active/non-deleted Organization, ACTIVE published Store,
  active category, valid Product identity, at least one ACTIVE non-archived
  Variant, exactly one ACTIVE Default, valid unique SKU/options, IQD prices and
  Inventory relationship for every active Variant, plus safe public media
  serialization. Positive stock is not required.
- A PUBLISHED update must remain publish-ready. The last active Variant cannot be
  archived until unpublish. Default archival requires an explicit active
  replacement.

## Variant, price and media policy

- SKU is trimmed, uppercase canonical and unique per Store.
- Option dimensions are Unicode-normalized, trimmed and case-folded for keys;
  duplicate normalized keys are rejected; at most three dimensions are allowed;
  deterministic sorted JSON produces one optionKey unique per Product.
- Price is a positive whole IQD value within Decimal(18,3);
  compareAtPrice is null or greater than price and within the same capacity.
- Default switching is atomic under Product lock. Every Product with active
  Variants has exactly one active Default; a PUBLISHED Product can never observe
  zero or multiple active Defaults.
- Variant archive is soft and preserves Inventory, reservations, Cart and Order
  history. Restore is allowed only when SKU/option/default/readiness invariants
  still pass.
- New media is IMAGE-only, HTTPS/public-host safe, bounded, unique by URL within
  Product, maximum 12, with deterministic contiguous ordering and bounded alt
  text. Managed upload/video remain Stage 5.
- Historical unsafe ProductMedia and Order image snapshots remain stored but
  serialize as null/omitted at every browser/mobile boundary. Merchant removal
  detects the unsafe value server-side by media ID and never sends it raw.

## Inventory and ledger policy

- PostgreSQL Int policy is 0 through 2,147,483,647. Delta must be a safe,
  nonzero integer and the resulting values must remain in range.
- `onHand >= reserved >= 0`; Merchant never edits reserved directly.
- Adjustment requires INVENTORY_ADJUST, exact UUID idempotency key, canonical
  request hash, expected Inventory version, row lock and transaction-time actor
  revalidation. StockMovement remains the authoritative replay/quantity ledger;
  one sanitized BusinessAuditLog is added per first successful adjustment and
  replay adds none.
- Threshold is null or a bounded nonnegative Int and uses
  BusinessOperationMutation plus BusinessAuditLog with version/replay/stale
  protection.
- Low stock means threshold is non-null and available stock
  (`onHand - reserved`) is at or below threshold. Out of stock means available
  stock is zero.

## Pagination and performance policy

- Product list cursor binds membership actor, Organization, Store, search,
  lifecycle/category/publish/stock/readiness filters, sort and snapshot. Order is
  `updatedAt DESC, id DESC`.
- Inventory cursor binds the same actor/tenant scope plus inventory filters and
  snapshot. Order is `updatedAt DESC, id DESC`.
- Movement cursor binds actor/tenant and exact Inventory target plus snapshot.
  Order is `createdAt DESC, id DESC`.
- Malformed, cross-actor, cross-target or cross-filter cursors return stable
  `INVALID_CURSOR`.
- Candidate queries are bounded and hydrate only visible IDs. No page-size total
  and no full-table loading is allowed.

Migration 32 will be forward-only, leave migrations 1–31 unchanged, preflight
missing or duplicate active Default data, replace the Default partial index
precisely and add the measured composite cursor indexes. Existing database
constraints remain authoritative for SKU, option, slug and Inventory integrity.
The migration must be tested on a fresh 32-migration database and through a
31→32 rehearsal before staging.

## Public, Cart, Checkout and history policy

The canonical public rule requires active/non-deleted Organization, ACTIVE
published/non-archived Store, PUBLISHED published/non-archived Product, active
category and at least one ACTIVE non-archived Variant. Out-of-stock Products may
remain visible but unavailable for purchase.

Unpublish/archive never deletes Favorites or Carts. Cart lines become unavailable
when Product/Variant/category/Store state changes. Checkout transactionally
rechecks the same visibility and Inventory rules. Historical Order name,
Variant/options, SKU, price and image snapshots are never rewritten; only unsafe
image serialization is suppressed.

## Business Web and deferred boundaries

Gate 3B owns functional Arabic-first RTL pages for Product list/create/detail and
Inventory list/detail. Navigation, mobile dashboard navigation, command palette,
breadcrumbs and Commerce hub expose links only when their exact read capability
is effective. Mutation controls are structurally absent without their exact
capability.

Orders and fulfillment remain truthful Gate 3C deferred UI. Reports and broad
Commerce Admin remain deferred. No Gate 3C/3D URL is made functional by this
gate.

## Security decisions

- Tenant ownership is always derived and rechecked; Product, Variant, media and
  Inventory IDs use tenant-safe not-found behavior.
- Strict allowlists prevent mass assignment and ownership forgery.
- Unique constraints plus serializable Product/Inventory locks protect slug,
  SKU, option and Default races.
- Cursor fingerprints bind actor, tenant, filters, target and snapshot.
- All adapters suppress raw Prisma/PostgreSQL/JavaScript errors.
- Existing same-site session/Origin protections and exact Server Action
  FormData allowlists remain authoritative for CSRF boundaries.
- The process-local rate limiter is abuse mitigation only; database
  authorization, versioning and idempotency provide correctness.

This document is the locked implementation contract for Gate 3B. Changes beyond
it require a later gate rather than scope expansion.
