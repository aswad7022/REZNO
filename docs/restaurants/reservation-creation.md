# Restaurant reservation creation

Gate 2D implements creation and persisted confirmation for `RESTAURANT` and
`CAFE` businesses. Management, cancellation, rescheduling, restaurant reviews,
payments, and outbound messaging remain deferred.

## Domain boundary

Restaurant reservations use `Booking` as the lifecycle envelope and
`RestaurantReservationDetails` plus `RestaurantReservationItem` for the
restaurant-specific facts. They do not create or reference `Service` or
`BranchService`, do not use staff availability, and cannot be created through
generic booking endpoints. `Booking.branchServiceId` is therefore nullable only
for explicit restaurant reservations.

## Canonical policy

- The organization must be an active, visible, booking-enabled Restaurant or
  Cafe; the selected branch must be active, undeleted, tenant-owned, and have a
  valid IANA timezone.
- The authenticated Better Auth customer must be active, undeleted, onboarded,
  and phone-complete. Customer identity is never accepted from request data.
- Guest count is an integer from 1 through the anti-abuse ceiling of 100, then
  further limited by the actual active capacity at the branch.
- The branch timezone, a canonical local date, and a canonical UTC instant are
  required. The supported horizon is today through 90 local calendar days.
  Starts use 30-minute intervals and a server-owned fixed 90-minute duration.
  Invalid DST boundaries, past instants, closed days, blocked times, and a
  reservation that extends past closing fail closed.
- The customer may provide a configured seating-area label as a strict
  preference. The server chooses the smallest sufficient active table in that
  area, then breaks ties by table name and ID. No table IDs or table-management
  metadata are public.
- Preorder items are optional. Duplicate item IDs are normalized by summing
  quantities up to 20. Every item and its active category must belong to the
  restaurant; unavailable or foreign items reject the whole request. Prices are
  database-authoritative and `RestaurantReservationItem.unitPrice` is the price
  snapshot supported by the current schema.
- Notes are trimmed, limited to 500 characters, persisted as text, and rendered
  through normal escaped React text output.

## Concurrency, idempotency, and atomicity

Creation uses a Serializable transaction with up to four bounded attempts,
10-second acquisition wait, and 30-second remote-transaction timeout. A
transaction-scoped PostgreSQL advisory lock serializes allocation for a branch;
all organization, branch, hours, block, table, overlap, seating, menu, and price
facts are then re-read before allocation. This branch lock also covers
overlapping requests that start at different intervals.

The existing customer-scoped `Booking` idempotency fields are used. The SHA-256
request hash binds the business slug, branch, guest count, local date, instant,
fixed duration, seating preference, normalized preorder, and customer note.
Same-key/same-payload replay returns the original persisted reservation;
changed input returns `IDEMPOTENCY_CONFLICT`.

The Booking, restaurant details, normalized items, one `CONFIRMED` history row,
and one business notification are written in the same transaction. Any failure
rolls back every record.

## API and clients

Mobile uses the dedicated routes under
`/api/mobile/restaurant-reservations`. Public catalog responses contain safe
business, branch, seating-label, menu, and availability data. Availability and
all customer endpoints are `no-store`. Confirmation detail is authenticated,
customer-owned, and returns a safe 404 for another customer.

The mobile application routes `RESTAURANT` and `CAFE` marketplace entries to the
extracted restaurant flow; all other supported verticals continue through the
generic service-booking flow. The existing web reservation form calls the same
transactional creation service and no longer accepts an internal table ID or a
client-controlled duration.

## Operations

`npm run seed:staging:restaurant-qa` creates the isolated
`rezno-qa-restaurant-gate2d` fixture only after the exact confirmation token and
staging-target checks pass. It is transactional, deterministic, idempotent, and
never runs during application startup or deployment.
