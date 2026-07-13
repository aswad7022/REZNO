# Milestone 2D customer Orders, Favorites, and in-app Notifications

## Scope

Milestone 2D adds authenticated customer Commerce Order list/detail/cancellation APIs,
Store and Product Favorites APIs, and exact-once Commerce lifecycle events in REZNO's
existing in-app Notification system. It does not add merchant/admin Order routes,
mobile or dashboard UI, push/email/SMS delivery, refunds, returns, online payment, or
Milestone 2E.

## Existing Notification architecture audit

REZNO already uses one general `Notification` model for admin announcements plus
Booking, Message, Review, Team, Restaurant, customer, and business dashboard
consumers. A notification can target a Person, an Organization, or a broad audience;
the existing dashboard aggregator combines these rows with Booking history and change
requests. `title` and `body` are rendered text. Before 2D there was no event metadata,
navigation payload or unique event identifier, and no standalone
notification HTTP inbox or mark-read API. Existing consumers therefore had no safe
database primitive for exact-once Commerce events.

Milestone 2D extends that same table with nullable `eventKey` and `metadata` columns.
Existing rows remain valid with null values. A unique index on nullable `eventKey`
provides exact-once delivery while allowing multiple legacy null rows. The existing
recipient/created-time index already matches current Notification list queries. A
speculative `Notification.readAt` field and unread index are intentionally excluded:
the current read-state implementation belongs to `Message`, and no approved
Notification mark-read or unread-count behavior exists. No Commerce-specific
Notification table or second unread source is introduced.

## Customer Order routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/commerce/customer/orders` | Cursor-paginated customer Order summaries |
| `GET` | `/api/commerce/customer/orders/[orderId]` | Immutable customer Order detail |
| `POST` | `/api/commerce/customer/orders/[orderId]/cancel` | Eligible cancellation with state-conflict repeat semantics |

All routes use Better Auth, resolve the active onboarded Person server-side, use JSON
envelopes and `Cache-Control: no-store, max-age=0`, and rate-limit by authenticated
Person. Cross-customer IDs return `404` without ownership details.

### List and cursor contract

The Order list accepts one each of `cursor`, `limit` (default 20, maximum 50),
`status`, `fulfillmentStatus`, `paymentStatus`, `fulfillmentMethod`, `storeSlug`, and
`sort` (`newest` or `oldest`). Unknown, duplicate, or malformed parameters fail.
Opaque Base64URL cursors bind their version/checksum to the customer, route scope,
sort, every active filter, timestamp, and stable Order ID. Another customer or a
changed filter cannot reuse a cursor.

Summaries use immutable Store and item snapshots and include safe Order/payment/
fulfillment state, total item quantity, decimal-string grand total, currency,
creation/expiry time, and a server-derived cancellation boolean. Booking records are
never queried.

### Detail and snapshot semantics

Details return immutable Store, Product, Variant option, media, price, fulfillment,
pickup, and delivery-address snapshots. They remain readable when current Store,
Product, Variant, or CustomerAddress records change, suspend, or archive. Totals are
decimal strings. Status history is deterministically ordered by timestamp and ID and
exposes actor type but not actor ID. Customer-authored reasons and the safe system
expiration code are visible; merchant/admin reasons are treated as internal and
serialized as null. Reservation IDs, movement keys, Organization IDs, customer IDs,
idempotency rows, and audit data are excluded.

### Cancellation

Cancellation accepts a JSON body containing only a normalized reason of 2–500
characters. It deliberately does not advertise an HTTP `Idempotency-Key`: the current
Order history schema cannot bind a key to the authenticated Person and canonicalized
reason or persist the original response. Advertising replay success would therefore be
unsafe. Cancellation is allowed for `PENDING`, or `CONFIRMED` while fulfillment remains
`UNFULFILLED`; paid, preparing, progressed, and terminal Orders fail with
`ORDER_NOT_CANCELLABLE`.

The existing Serializable Order service locks and rechecks the Order. Pending
cancellation releases reservations; confirmed/unfulfilled cancellation restocks
consumed stock. It voids unpaid Payment, appends one history row, creates exact-once
movement keys, and writes notifications in the same transaction. The service uses a
deterministic internal history key, and Order row locking plus a Serializable
transaction ensure that concurrent requests produce one mutation. Exactly one
concurrent request succeeds; sequential or concurrent repeats observe the terminal
state and return `409 ORDER_NOT_CANCELLABLE`. Cross-customer attempts remain a
privacy-safe `404`.

## Favorite routes and behavior

| Method | Route |
| --- | --- |
| `GET`, `POST` | `/api/commerce/customer/favorites/stores` |
| `DELETE` | `/api/commerce/customer/favorites/stores/[storeId]` |
| `GET`, `POST` | `/api/commerce/customer/favorites/products` |
| `DELETE` | `/api/commerce/customer/favorites/products/[productId]` |

POST accepts only `storeId` or `productId`. Creation requires the current public
visibility predicate and is idempotent, including concurrent unique-key races. Store
and Product relations remain separate from existing Business/Service Favorites.

Lists use customer- and collection-bound opaque cursors, return current public DTOs,
and never expose exact Inventory or moderation state. Hidden resources are omitted,
but their favorite rows are preserved. Reactivation makes them visible again. DELETE
queries the authenticated customer's relation directly, so a hidden target remains
removable; a missing or other-customer relation returns `404 FAVORITE_NOT_FOUND`.

## Commerce Notification design

### Event matrix

Customer events:

* `order.created`
* `order.confirmed`
* `order.rejected`
* `order.preparing`
* `order.ready_for_pickup`
* `order.out_for_delivery`
* `order.delivered`
* `order.cancelled`
* `order.expired`

Merchant events:

* `order.new`
* `order.customer_cancelled`

Checkout writes `order.created` and `order.new` in its trusted transaction. Existing
Order transition, customer cancellation, and expiration services write the remaining
events in the same transaction as state, history, Payment, reservation, and stock
changes. Failed or rolled-back operations write none.

### Recipients

The customer recipient is the Order-owning active Person. Merchant recipients are
active, onboarded People in the Store Organization whose Organization is active and
whose Organization-owned role explicitly has `ORDER_VIEW` or `ORDER_MANAGE`.
Unauthorized roles, inactive/deleted People, and other Organizations fail closed. No
`StoreMember` is introduced.

### Exact-once and privacy

Every row has a deterministic unique key:

`commerce:<orderId>:<eventType>:<recipientPersonId>`

`createMany(..., skipDuplicates: true)` plus the unique index makes concurrent/retried
transactions converge on one row per Order/event/recipient. Idempotent Checkout and
transition replays do not append another notification.

Metadata contains only event type, Commerce Order ID/reference, Store public name,
safe status, localization keys, and a notification-page destination. It excludes
address, phone, customer instructions, Inventory, payment internals, idempotency keys,
and membership details.

### Localization

Commerce notification copy is centralized outside transition services with Arabic,
English, and Kurdish variants plus stable localization keys. The same non-destructive
migration adds `KU` to the existing database `LanguageCode` enum so each recipient's
stored preference selects rendered Arabic, English, or Kurdish copy. REZNO's UI locale
remains `ckb`; the single Commerce locale adapter explicitly maps `ckb -> KU`, so
clients never send a new UI locale value. `AR` and `EN` map directly, while `TR`, null,
or another unsupported stored preference safely falls back to English.
Existing admin notifications continue to store their original rendered title/body.

## Rate limits

Order list reads allow 60/minute, detail reads 120/minute, cancellation 10/minute,
Favorite reads 60/minute, and Favorite mutations 30/minute per authenticated Person.
Rejections return `429 RATE_LIMITED` and `Retry-After`. The limiter remains process-local
and is a production scaling gate.

## Migration and test strategy

The one non-destructive migration only adds two nullable columns and one unique index to
`Notification`. It is tested both as a fresh 22-migration deployment and as an upgrade
from the approved 2C schema. Disposable PostgreSQL tests cover customer isolation,
snapshot survival, cursor pagination, concurrent Favorite adds, hidden/reactivated
Favorites, pending/confirmed cancellation, exact-once stock/history/Payment behavior,
Checkout races, all approved lifecycle events, merchant recipient filtering,
expiration replay, and legacy Notification-row compatibility. Live Next tests use real
Better Auth Web cookies and Expo-compatible `expo-origin` transport.

Known limitations remain: the rate limiter is process-local, no production scheduler
is claimed for expiration, the current global Notification UI has no mark-read action,
no physical-device UI QA is possible because 2D adds no UI, and concurrent test paths
still surface the existing `pg` busy-client deprecation warning.
