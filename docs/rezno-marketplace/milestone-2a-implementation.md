# REZNO Marketplace Milestone 2A Implementation

Implementation date: 2026-07-12

Branch: `feat/rezno-marketplace-customer-mvp`

Baseline: `2df2bd895bdd5891364afde59d22a2901ab469e2`

## Scope delivered

Milestone 2A adds the commerce backend foundation only. It adds no mobile Marketplace UI, public catalog/search API, Cart/Checkout HTTP route, merchant dashboard, admin dashboard, online payment, tax, coupon, refund, return, payout, shipment, driver, tracking, production upload, or AI recommendation.

Commerce is isolated under `features/commerce` and remains separate from `features/marketplace`, Service, BranchService, Booking, and restaurant reservations.

Implemented modules:

- Typed commerce domain errors.
- Decimal IQD calculation and validation.
- Store lifecycle and visibility policy.
- Product/Variant validation and publication policy.
- Cart one-Store/version/quantity policy.
- Canonical checkout request hashing and idempotency decisions.
- Central Order, Fulfillment, and Payment state machines.
- Merchant/customer/admin authorization contexts.
- Store lifecycle services and audited admin moderation.
- Atomic Product/default-Variant/Inventory creation, additional Variant creation, publication, archive, and suspension.
- Customer address, Cart, and Store/Product favorite services.
- Inventory adjustment, reservation, release, consumption, restock, and immutable movement services.
- Trusted pending-Order creation with 15-minute reservations.
- Confirm, reject, customer/merchant/admin cancellation, fulfillment, offline payment, and expiration services.
- Guarded manual expiration command.

## Store ownership and permissions

`Organization` owns zero or one `Store` through a unique Store.organizationId. Store does not depend on BusinessProfile and no StoreMember was added.

Role now stores typed `CommercePermission[]`. The migration grants all 12 approved Milestone 2A permissions only to existing `SystemRole.OWNER` rows. MANAGER, RECEPTIONIST, STAFF, and custom roles retain the fail-closed empty default unless explicitly granted later.

Every merchant service resolves a Person/Organization membership, verifies that the Organization and Role belong together and are active, checks the required permission, and constrains the Store or Store-owned resource through the same Organization.

Commerce admin permissions extend the existing AdminAccess permission system. Store approval/rejection/suspension/reactivation and Product suspension use explicit permissions and existing AdminAuditLog.

## Money and checkout

All commerce amounts are `Decimal(18,3)`. Domain boundaries return decimal strings. Milestone 2A accepts IQD only and rejects effective fractional IQD. Calculations never use JavaScript `Number` for authoritative money.

Checkout accepts an internal trusted input containing customer, Cart/version, fulfillment, address, instructions, and UUID idempotency key. It reloads Store, Product, Variant, current price, Cart, address, and inventory. It calculates subtotal, product reduction, delivery fee, zero tax, and grand total server-side.

Checkout uses a serializable transaction, deterministic InventoryItem lock order, immutable snapshots, one offline Payment, Order history, reservations/movements, and Cart conversion. Same buyer/key/hash returns the same Order; changed input with the same buyer/key throws `IDEMPOTENCY_CONFLICT`.

Serializable conflicts are retried at most four times. PostgreSQL `40001`/`40P01`, Prisma `P2034`, and the current adapter's `TransactionWriteConflict` shape are retryable; domain/authorization/validation/stock/idempotency errors are not. Exhaustion returns a typed commerce conflict.

Store archival requires and persists a bounded reason. Store currency remains IQD-only and has no general mutation operation.

## State clarification

The owner instructions contained both “CONFIRMED cancellation only before PREPARING” and “after PREPARING only merchant/admin may cancel.” The implemented interpretation is:

- Customer: PENDING, or CONFIRMED while Fulfillment is UNFULFILLED.
- Merchant/admin: PENDING or CONFIRMED until DELIVERED/PICKED_UP, provided Payment is not PAID.
- Every cancellation requires a reason and restores/releases stock exactly once.

This is the only decision clarification. No approved model or payment scope was broadened.

## Known limitations

- No production scheduler invokes expiration yet.
- No shared Redis rate limiter is connected.
- Authenticated Better Auth Expo transport is not wired to commerce routes because no routes exist in 2A.
- ProductMedia stores URL references only; host/storage policy remains open.
- No seed fixture was added; integration tests create isolated deterministic-shaped data at runtime.
- In-app commerce notifications were not coupled into domain transactions; OrderStatusHistory is the implemented event source. Notification delivery remains for a later scoped task.
