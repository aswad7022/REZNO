# Milestone 2C authenticated Commerce APIs

## Scope

Milestone 2C adds authenticated customer addresses, a server-side single-Store Cart,
trusted offline Checkout, and the minimum merchant Inventory read/adjustment surface.
It builds on the Milestone 2A Commerce schema and services and the Milestone 2B public
catalog. No Prisma schema or migration change is required.

This milestone deliberately excludes customer Order browsing, merchant Order
management, Favorites, Notifications, mobile or dashboard UI, guest Commerce,
multi-Store Checkout, online payment, and Milestones 2D/2E.

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/commerce/customer/addresses` | List the authenticated Person's active addresses |
| `POST` | `/api/commerce/customer/addresses` | Create an address |
| `PATCH` | `/api/commerce/customer/addresses/[addressId]` | Update an owned active address |
| `DELETE` | `/api/commerce/customer/addresses/[addressId]` | Soft-delete an owned active address |
| `POST` | `/api/commerce/customer/addresses/[addressId]/default` | Atomically select the default address |
| `GET` | `/api/commerce/customer/cart` | Read the active Cart without creating one |
| `DELETE` | `/api/commerce/customer/cart` | Close the active Cart using its expected version |
| `POST` | `/api/commerce/customer/cart/items` | Add or merge a Variant |
| `PATCH` | `/api/commerce/customer/cart/items/[cartItemId]` | Change an item's quantity using the expected Cart version |
| `DELETE` | `/api/commerce/customer/cart/items/[cartItemId]` | Remove an item using the expected Cart version |
| `POST` | `/api/commerce/customer/cart/replace` | Atomically replace a cross-Store Cart |
| `POST` | `/api/commerce/customer/checkout` | Create or replay a pending offline-payment Order |
| `GET` | `/api/commerce/merchant/inventory` | List Inventory for the active Organization's Store |
| `POST` | `/api/commerce/merchant/inventory/[inventoryItemId]/adjustments` | Apply an idempotent Inventory adjustment |

Only these methods are implemented. Next.js returns `405` for unsupported methods.
Every authenticated Commerce response is JSON with `Cache-Control: no-store,
max-age=0`.

## Authentication, ownership, and authorization

Routes use the existing Better Auth session adapter. The server resolves the active,
onboarded `Person`; no customer identifier is accepted from a request body. A missing
or invalid session returns `401 UNAUTHENTICATED`.

Customer resources are always queried with the authenticated Person ID. An address,
Cart, or Cart item belonging to someone else is indistinguishable from a missing
resource and returns `404 NOT_FOUND` where applicable. Checkout also scopes its
idempotency record and Order result to that Person.

Merchant routes resolve the active Organization through the existing membership and
active-business selection convention. A single valid membership is selected
unambiguously; multiple memberships require the existing `rezno-active-business-id`
cookie. Role Organization ownership is checked, the Organization must be active, and
the operation requires `INVENTORY_VIEW` or `INVENTORY_ADJUST`. Inventory queries also
join through `Store.organizationId`; another Organization's Inventory cannot be read
or adjusted. No `StoreMember` or alternate authorization system is introduced.

The HTTP smoke uses real Better Auth signup/session cookies. It also sends an Expo
plugin-compatible request with `expo-origin: rezno://`; both transports reach the same
server-side Person resolver. No bearer-token or API-key path was added.

## Address contract

Create accepts only `recipientName`, `phone`, `city`, `area`, `street`, optional
`additionalDetails`, optional `landmark`, an optional latitude/longitude pair, and
optional `isDefault`. Update accepts only the mutable subset. Unknown fields,
malformed UUIDs, empty required values, excessive lengths, impractical phone values,
or half of a coordinate pair are rejected.

The first active address becomes the default. Selecting another default and clearing
the old default happen in one Serializable transaction. Deleting the default promotes
the oldest remaining active address, ordered by `createdAt` and then ID, which makes
the result deterministic. Deletion is soft and never changes immutable
`OrderAddress` rows.

Address DTOs are returned only to their owner. Address bodies, coordinates, and
customer instructions are not logged by these routes or services.

## Cart lifecycle and optimistic concurrency

A Person has at most one `ACTIVE` server Cart and each Cart has one Store. A read with
no Cart returns `{ "data": null }` and performs no database write. Cart mutation never
creates an `InventoryReservation` or `StockMovement`.

The maximum quantity per item is `99`. A first add creates a Cart after resolving the
Variant's Store and validating public Store/Product/Variant visibility plus available
stock. Re-adding the same Variant merges its quantity. Mutations use an expected
positive Cart version and increment it exactly once. A stale version returns
`409 CART_VERSION_CONFLICT`.

Removing the final item marks the Cart `ABANDONED`. Clearing an active Cart does the
same and a repeated clear is safe. A cross-customer item ID returns `404` and cannot
affect the owner's Cart.

### Different-Store conflict and replacement

Normal add never silently discards an existing Cart. It returns
`409 CART_STORE_CONFLICT` with only the current public Store identity, incoming public
Store identity, and current Cart version. No Cart data changes on that response.

`POST /cart/replace` is the sole explicit replacement operation. It accepts
`cartId`, `cartVersion`, `variantId`, and `quantity`; validates the incoming catalog
state before mutation; then abandons the old Cart and creates the new one in one
Serializable transaction. The database's one-active-Cart constraint and version
guard prevent two active Carts. Concurrent replacement attempts produce one winner
and one version/conflict outcome without partial clearing.

### Cart DTO

The Cart DTO contains its ID/version, currency, safe public Store identity, item IDs,
public Product/Variant identity and presentation, option values, primary media,
quantity, current decimal-string prices, total quantity, informational subtotal,
availability, and truthful `priceChanged` state. It never contains SKU, exact stock,
reserved stock, Organization IDs, moderation reasons/statuses, or Prisma Decimal
objects. Cart prices remain informational and are never trusted by Checkout.

## Checkout contract

`POST /api/commerce/customer/checkout` accepts one UUID in the `Idempotency-Key`
header and only these JSON fields:

* `cartId`
* `cartVersion`
* `fulfillmentMethod` (`STORE_DELIVERY` or `CUSTOMER_PICKUP`)
* `addressId` for delivery only
* optional `customerInstructions`, trimmed, whitespace-normalized, and limited to
  1,000 characters

Unknown fields are rejected. The client cannot supply Person/Store/Order IDs, payment
or Order state, currency, prices, totals, discounts, fees, or Inventory values.

The canonical idempotency fingerprint contains the Cart ID, Cart version,
fulfillment method, address ID or `null`, and normalized instructions. It is scoped
to the authenticated Person. Same Person/key/request replays the original receipt;
same Person/key/different request returns `409 IDEMPOTENCY_CONFLICT`; different People
may independently use the same UUID.

### Trusted transaction

The Milestone 2A Checkout service runs a bounded-retry Serializable transaction. It
rechecks Cart ownership/status/version/items, Store publication/status/currency and
fulfillment configuration, Product/Variant availability, available Inventory, owned
delivery address, Store delivery area, current Variant prices, delivery fee, minimum
Order value, and whole-IQD money rules. Client and Cart snapshots are not authoritative.

Inventory rows are locked in deterministic ID order. A successful Checkout creates
exactly one `PENDING` Order, immutable Store/Product/Variant/options/SKU/media/price
snapshots, an immutable delivery address snapshot when applicable, initial status
history, one truthful offline Payment, active reservations, and exact-once `RESERVE`
movements. It increases `reserved` without reducing `onHand`; database constraints
prevent negative or over-reserved stock. Reservations expire exactly 15 minutes after
Order creation. The source Cart becomes `CONVERTED`, so it cannot create a second
Order.

`STORE_DELIVERY` requires an owned active address and uses `CASH_ON_DELIVERY` with
`UNPAID`. `CUSTOMER_PICKUP` forbids an address and uses `PAY_AT_PICKUP` with `UNPAID`.
No online-payment or fake provider behavior exists.

Creation and replay both return HTTP `201` with a stable receipt. The DTO contains
Order identity/reference and state, fulfillment/payment method and state, public
Store snapshot, immutable item snapshots, the owning customer's address snapshot
when present, decimal-string totals, currency, `expiresAt`, and `createdAt`. It omits
Inventory/reservation IDs, movement keys, Organization IDs, admin data, and generic
Order retrieval.

## Merchant Inventory contract

Inventory list supports bounded `q`, signed opaque `cursor`, `limit`, and
`availability` parameters. Query text may match Product name, Variant option values,
or merchant-only SKU. Pagination orders by `updatedAt` and ID and binds each cursor
to its filters and Organization. The DTO contains only InventoryItem/Product/Variant
identity, Product name, option values, SKU, on-hand, reserved, computed available,
operational Product/Variant availability, and update time.

Adjustment accepts exactly `delta` (a non-zero integer), a required bounded `reason`,
and a UUID `operationKey`. The Inventory target comes from the path. In a trusted
transaction it locks the row, preserves `reserved`, enforces `onHand >= reserved >= 0`,
updates `onHand`, and appends immutable `ADJUSTMENT_IN` or `ADJUSTMENT_OUT` movement.
The movement key is deterministically scoped to Organization and operation key.
Canonical movement metadata binds the key to actor, Organization, Inventory target,
Variant, delta, and reason. An identical replay returns the original result; reuse
with another request or tenant returns `409 INVENTORY_CONFLICT`.

## Envelopes and errors

Detail/mutation responses use `{ "data": ... }`; collections add `pageInfo` with
`nextCursor` and `hasNextPage`. Typed domain and validation failures are centrally
mapped to the approved stable codes. Cross-owner resources use privacy-safe `404`
responses. Unexpected failures become a generic `500 INTERNAL_ERROR`; Prisma, SQL,
stack traces, and internal authorization details are not serialized.

## Rate limiting

The existing shared in-process limiter is reused with a one-minute window. Address and
Cart reads allow 120 requests; address mutations and Inventory adjustments allow 30;
Checkout allows 10; other Cart mutations use the shared authenticated default of 60;
merchant Inventory reads allow 120. Customer buckets use the authenticated Person;
merchant buckets use authenticated User plus active Organization. Identifiers are
internal only. A rejection returns `429 RATE_LIMITED` and `Retry-After`.

Process-local limiting is adequate for development and remains a production release
gate; a distributed limiter is required for horizontally scaled deployment.

## Validation and test strategy

Unit tests cover address/Cart/Checkout/Inventory validation, canonical hashing,
decimal serialization and DTO exclusions, cursor behavior, authenticated rate-limit
key construction, and safe error mapping. Disposable-PostgreSQL tests cover address
defaults/ownership, Cart lifecycle and concurrent replacement, Checkout price/fee
recalculation and immutable snapshots, exact-once reservations/movements,
idempotency/overselling races, merchant permissions and tenant scope, and concurrent
negative adjustments. Live HTTP tests run a production Next server with the real
Better Auth cookie and Expo-compatible transport.

No fixture or seed is added to production code. The known test/runtime limitation is
the existing `pg` warning when concurrent work is intentionally issued on a client
already executing a query. Rate limiting remains process-local. No external address
verification, payment provider, or distributed job for reservation expiry is added
in this milestone.
