# REZNO Marketplace Milestone 2A Database

## Migration

New migration:

`prisma/migrations/20260712105932_commerce_milestone_2a_foundation/migration.sql`

Existing migrations were not edited. `pg_trgm` was not added because production extension privileges are not established; catalog search indexing remains a Milestone 2B decision.

## Models

Added:

- Store
- MarketplaceCategory
- Product
- ProductVariant
- ProductMedia
- InventoryItem
- InventoryReservation
- StockMovement
- CustomerAddress
- Cart
- CartItem
- CheckoutIdempotency
- Order
- OrderItem
- OrderAddress
- OrderStatusHistory
- Payment
- CustomerFavoriteStore
- CustomerFavoriteProduct

Changed existing models:

- Organization: optional Store relation.
- Person: address, Cart, checkout, Order, and commerce favorite relations.
- Role: typed commerce permission array.

Booking, Service, BranchService, restaurant, and existing favorite schemas were not renamed or repurposed.

## Database constraints

- One Store per Organization and globally unique Store slug.
- Store-scoped Product slug and Variant SKU.
- Product/Store compound ownership on Variant.
- One InventoryItem per Variant.
- Nonnegative onHand/reserved/version and `reserved <= onHand`.
- Positive reservation/movement/item quantities.
- One ACTIVE Cart per Person using a partial unique index.
- One active default address per Person and one active default Variant per Product using partial indexes.
- IQD-only currency checks and whole-IQD checks on all money columns.
- Positive Product price; compare-at price must exceed price.
- Order and OrderItem total equations; Order tax is exactly zero.
- Fulfillment/payment method pairing: delivery/COD and pickup/pay-at-pickup.
- One Payment and optional one OrderAddress per Order.
- Historical OrderItems, OrderAddress, Payment, reservations, movements, and status history use restrictive Order deletion paths.
- Unique buyer/idempotency key, movement key, reservation key, and history key.
- Latitude/longitude bounds and at least one changed dimension per history row.

## Safe backfill

The migration updates only Role rows whose `systemRole = OWNER`, assigning the 12 approved CommercePermission values. All other roles keep an empty array.

A disposable rehearsal database was migrated through the original 20 migrations, seeded with User/Person, Organization, OWNER and MANAGER roles, OrganizationMember, BusinessProfile, Service, BranchService, and Booking fixtures, then upgraded. Results:

- OWNER commerce permission count: 12.
- MANAGER commerce permission count: 0.
- Existing Booking preserved: 1/1.
- Existing User, two People, Organization, membership, BusinessProfile, and Service preserved with their original IDs.
- Booking-to-Organization/Branch/Customer/BranchService/Service relations remained intact.
- Migration status: current at 21 migrations.

## Rollback and recovery

Before production deployment: take and restore-test a database backup, rehearse migration and role backfill on a production-like copy, and keep commerce feature flags disabled.

Before commerce records exist, rollback can restore the backup or reverse the isolated migration in a disposable environment. After commerce Orders exist, do not drop these tables; disable commerce writes and deploy a forward repair. Stock reconciliation compares InventoryItem against immutable StockMovement and active InventoryReservation rows.

No migration was applied to the existing development `rezno` database during implementation. Migration creation/application used disposable databases only.
