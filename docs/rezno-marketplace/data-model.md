# REZNO Commerce Data Model

Status: proposed design only; no Prisma models or migrations have been applied

Audit date: 2026-07-12

## Existing models that remain authoritative

- `User` owns authentication credentials and sessions.
- `Person` is the customer/buyer identity.
- `Organization`, `OrganizationMember`, and `Role` define business tenancy.
- `Service`, `BranchService`, `Booking`, and restaurant reservation models remain the booking/services domain.
- `AdminAccess` and `AdminAuditLog` remain the administrative authorization/audit foundation.

Commerce references these identities but does not convert service or booking rows into commerce rows.

## Proposed ownership graph

```text
Organization 1 --- * Store 1 --- * Product 1 --- * ProductVariant 1 --- 1 Inventory
                               |                    |
                               * ProductImage       * InventoryMovement

Person 1 --- * Cart 1 --- * CartItem * --- 1 ProductVariant
Person 1 --- * Order 1 --- * OrderItem
                       |--- 1 OrderAddress
                       |--- * Payment
                       |--- * Shipment
                       |--- * OrderStatusHistory
```

An organization may own multiple stores. Seller authorization is always derived from the active organization membership and then constrained by `Store.organizationId`. A `Store` is a commerce profile, not an alias for `BusinessProfile`.

## Proposed entities

### Store

Core fields: `id`, `organizationId`, `name`, `slug`, `description`, `logoUrl`, `coverImageUrl`, `status`, `publishedAt`, `defaultCurrency`, `createdAt`, `updatedAt`, `deletedAt`.

Indexes/constraints: unique `slug`; index on `(organizationId, status)`; index on `(status, publishedAt)`.

### ProductCategory

Commerce-specific category tree with `id`, optional `parentId`, localized name/slug data, `status`, sort order, timestamps. It is separate from the existing service `Category`.

### Product

Core fields: `id`, `storeId`, `categoryId`, `name`, `slug`, `description`, `status`, `publishedAt`, timestamps, soft delete. Product identity and merchandising live here; purchasable price/stock live on variants.

Constraints: unique `(storeId, slug)`; indexes for public category/store feeds and creation time.

### ProductVariant

Core fields: `id`, `productId`, unique seller SKU scoped to store, title/options JSON, `price` decimal, optional `compareAtPrice`, `currency`, `status`, weight/dimensions when fulfillment requires them, timestamps.

Money must use `Decimal`, never floating point. Currency is an uppercase ISO 4217 code and must match order/cart currency policy.

### ProductImage

Core fields: `id`, `productId`, optional `variantId`, `url`, alt text/localization, sort order, timestamps. URLs reference managed media; database rows do not imply upload authorization.

### Inventory

Initial scope uses one row per variant: `variantId` unique, `onHand`, `reserved`, `version`, timestamps. `available = onHand - reserved` is derived and must never be negative. A later fulfillment-location model can replace the unique constraint with `(variantId, locationId)`.

### InventoryMovement

Immutable ledger: `id`, `variantId`, optional `orderId`, `kind`, signed `quantity`, resulting quantities or version, reason, actor identity, unique `idempotencyKey`, timestamp. Kinds include `RESERVE`, `RELEASE`, `SALE`, `RETURN`, and `ADJUSTMENT`.

### Cart / CartItem

`Cart`: `id`, `buyerPersonId`, `status`, `currency`, `expiresAt`, timestamps.

`CartItem`: `id`, `cartId`, `variantId`, `quantity`, timestamps; unique `(cartId, variantId)`.

Only the buyer can read or mutate the cart. Variant visibility, current price, and stock are revalidated server-side on every mutation and at checkout. An abandoned cart is not an order.

### Order

Core fields: `id`, public non-sequential order number, `buyerPersonId`, `storeId`, `status`, `paymentStatus`, `fulfillmentStatus`, currency, subtotal/discount/tax/shipping/total decimals, checkout idempotency key, timestamps, cancellation metadata.

Initial implementation should keep one store per order. A multi-store cart is split into separate orders inside one checkout group; this keeps seller authorization, tax, shipment, and cancellation boundaries explicit.

### OrderItem

Snapshot fields: product/variant IDs where available, product name, variant title, SKU, unit price, currency, quantity, discount/tax/line totals, image URL. Product deletion or later price edits never rewrite historical order lines.

### OrderAddress

Immutable checkout snapshot: recipient name, phone, country/region/city, address lines, postal code where applicable, delivery instructions. Sensitive address reads are limited to buyer, authorized seller fulfillment roles, and authorized admins.

### OrderStatusHistory

Immutable transition ledger with from/to status, actor type/id, reason, metadata, and timestamp. It follows the proven booking-history pattern but has commerce-specific statuses and permissions.

### Payment

Provider-neutral record: `id`, `orderId`, provider, provider reference, status, amount, currency, idempotency key, failure/refund metadata, timestamps. Provider secrets never enter client-visible records. Callback processing verifies signatures and is idempotent.

### Shipment

Core fields: `id`, `orderId`, provider/service, tracking reference/URL, status, shipped/delivered timestamps, provider metadata. Shipment state is updated by authorized seller/admin actions or verified provider events.

## Proposed status values

- Store: `DRAFT`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`.
- Product/variant: `DRAFT`, `ACTIVE`, `INACTIVE`, `ARCHIVED`.
- Cart: `ACTIVE`, `CHECKED_OUT`, `ABANDONED`, `EXPIRED`.
- Order: `PENDING_PAYMENT`, `CONFIRMED`, `PROCESSING`, `READY_TO_SHIP`, `SHIPPED`, `DELIVERED`, `CANCELLED`.
- Payment: `PENDING`, `AUTHORIZED`, `PAID`, `FAILED`, `CANCELLED`, `PARTIALLY_REFUNDED`, `REFUNDED`.
- Fulfillment/shipment: `UNFULFILLED`, `PROCESSING`, `READY`, `SHIPPED`, `DELIVERED`, `RETURNED`, `CANCELLED`.

## Permission matrix to add before writes

| Capability | Buyer | Seller member | Admin |
| --- | --- | --- | --- |
| Browse published catalog | Public | Public | With catalog view permission |
| Manage own cart | Own person only | Own person only | No implicit access |
| Place/view order | Own person only | Store orders with order-view permission | With order-view permission |
| Manage catalog | No | Owned store + catalog-manage permission | With catalog-manage permission |
| Adjust inventory | No | Owned store + inventory-manage permission | With inventory-manage permission |
| Advance fulfillment | No | Owned store + order-manage permission | With order-manage permission |
| Refund/cancel after payment | Policy-limited request | Explicit order/refund permission | Explicit order/refund permission |

Candidate admin permissions: `COMMERCE_CATALOG_VIEW`, `COMMERCE_CATALOG_MANAGE`, `COMMERCE_ORDERS_VIEW`, `COMMERCE_ORDERS_MANAGE`, `COMMERCE_INVENTORY_MANAGE`, and `COMMERCE_REFUNDS_MANAGE`. Seller permissions require a business-role representation; the current `Role` model has no permission list, so that design must be approved before seller mutations.

## Database invariants

- All tenant-owned rows include an ownership path that can be enforced in every query.
- Quantities are positive at input boundaries; inventory totals cannot be negative.
- SKU uniqueness is scoped and documented.
- Order numbers are public-safe and non-sequential; internal IDs remain UUIDs.
- Checkout idempotency keys are unique per buyer/action.
- Provider event IDs are unique.
- Soft-deleted/suspended rows are excluded by default public scopes.
- Historical order/address/item/payment records are not cascade-deleted with catalog records.
- `createdAt`/`updatedAt` use timezone-aware timestamps.

## Migration sequence

1. Add enums and store/catalog tables with no public writes.
2. Add inventory and immutable movement ledger.
3. Add carts.
4. Add orders, snapshots, status history, and addresses.
5. Add payments and shipments.
6. Add permissions and audited seller/admin operations.

Each migration requires schema validation, generated-client checks, authorization tests, rollback/recovery notes, and staging verification. No step is authorized by this design document alone.
