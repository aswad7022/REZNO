# Restaurant reservation management

Gate 2E adds customer management for persisted `RESTAURANT` and `CAFE`
reservations. It deliberately remains separate from generic service-booking
cancellation, employee availability, `BranchService`, reviews, and
`BookingChangeRequest` approval workflows.

## Lifecycle and ownership

- Active and customer-manageable statuses are `PENDING` and `CONFIRMED`.
- Final statuses are `CANCELLED`, `COMPLETED`, and `NO_SHOW`.
- Completed means exactly `COMPLETED`; `NO_SHOW` remains visible only in All.
- Every customer request derives the Person from Better Auth, then requires the
  owned `Booking.customerId`, a null `branchServiceId`, and non-null
  `RestaurantReservationDetails`. Foreign and generic bookings return safe
  not-found responses.
- Detail and mutation services also verify that the duplicated business,
  branch, table, and menu-item relationships still belong to the Booking
  tenant. Corrupt cross-tenant links fail closed without serializing the
  related record.
- Historical detail remains readable when the organization, branch, table, or
  menu item becomes inactive. Cancellation of an existing eligible commitment
  also remains available after organization or branch deactivation.
- Reschedule options and reschedule mutations require the organization and
  branch to remain active, booking-enabled, marketplace-visible, and backed by
  an active table at that branch.

Cancellation and reschedule use the existing Organization
`cancellationWindowHours`; the established default is 24 hours. Both operations
must begin before the same exclusive deadline.

## Cancellation and direct reschedule

Cancellation is an immediate Restaurant-domain mutation. It sets `CANCELLED`,
`cancelledAt`, and the bounded optional reason in one Serializable transaction,
then appends one status-history entry and one Business notification.

Restaurant reschedule is also immediate. Business approval is neither present
nor required for the customer flow. The customer may change local date,
canonical UTC start, guest count, optional seating preference, and customer
note. Organization, branch, customer, status, fixed 90-minute duration, and
preorder are immutable.

The preorder policy is explicit: preserve the entire existing preorder without
revalidation or amendment during reschedule. New reservation items store name
and currency snapshots in addition to the database-authoritative unit price.
Migration 28 backfills existing rows but leaves the text snapshots nullable;
legacy rows prefer snapshots when present and otherwise fall back to the linked
current menu item.

Rescheduling re-reads the branch timezone, business hours, blocked times,
settings, and active branch tables after acquiring the same transaction-scoped
branch advisory lock used by creation. It excludes the current booking from
overlap checks, selects the smallest sufficient available table, and updates
the Booking plus Restaurant details atomically. The unchanged Booking status is
recorded with an explicit reschedule note because the existing history model
already uses same-status entries for non-status lifecycle changes.

## Replay and concurrency

Both mutations require a UUID `Idempotency-Key`. Dedicated
`RestaurantReservationMutation` rows bind `(customerId, idempotencyKey)` to the
Restaurant booking, mutation type, SHA-256 payload hash, starting Booking
version, and result Booking version.

- Same key, type, booking, and canonical payload replays the persisted result.
- Reusing the key with changed material input returns `IDEMPOTENCY_CONFLICT`.
- Replaying an older successful mutation after a later mutation returns
  `BOOKING_STATE_CONFLICT` rather than presenting a stale success.
- Each operation captures its expected Booking version before entering the
  branch lock. Conditional writes and Serializable bounded retries ensure
  simultaneous cancellation/reschedule or two reschedules produce one winner.
- Booking/details, mutation ledger, history, and notification commit together;
  any failure rolls the entire mutation back.

## API and pagination

Customer routes are no-store and rate-limited:

- `GET /api/mobile/restaurant-reservations`
- `GET /api/mobile/restaurant-reservations/[bookingId]`
- `POST /api/mobile/restaurant-reservations/[bookingId]/cancel`
- `GET /api/mobile/restaurant-reservations/[bookingId]/reschedule-options`
- `POST /api/mobile/restaurant-reservations/[bookingId]/reschedule`

List cursors are opaque, versioned, and tab-bound. They contain `startsAt`,
booking UUID, and the snapshot time. Upcoming orders ascending; All, Completed,
and Cancelled order descending. Counts use the same customer, Restaurant, and
snapshot scope. Customer DTOs never expose table IDs, table names, capacities,
internal notes, or another customer's data.

Mobile My Bookings is a presentation orchestrator with Services and Restaurants
selectors over separate APIs and policies. Restaurant mutations update local UI
only after persistence, then refresh list and detail authoritatively. Duplicate
taps are blocked and ambiguous network retries retain the same idempotency key.

## Operations

The existing confirmation-gated staging Restaurant fixture now includes one
future cancellable reservation, one future reschedule-eligible reservation,
one completed reservation, one cancelled reservation, stable preorder rows,
and sufficient tables. It remains transactional, namespaced, staging-only,
idempotent, and never runs automatically.
