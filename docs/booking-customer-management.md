# Customer booking management policy

This document records the Gate 2B runtime policy implemented by the shared
booking domain and services. The Prisma enums remain the source of persisted
status values.

## Lifecycle

- Active bookings: `PENDING`, `CONFIRMED`.
- Final bookings: `CANCELLED`, `COMPLETED`, `NO_SHOW`.
- The Completed mobile tab means exactly `COMPLETED`. `NO_SHOW` remains visible
  in All without being presented as completed.
- Upcoming means an active booking whose `startsAt` is at or after the list
  snapshot time.
- The Branch IANA timezone is authoritative for calendar dates and display.

## Customer cancellation and change requests

- Customer identity always comes from the authenticated session. Services
  scope every read and mutation by `customerId`; a foreign booking is a safe
  not-found response.
- Customer cancellation and reschedule eligibility use the same Organization
  `cancellationWindowHours` setting (24 hours only when the existing setting is
  absent). The deadline is exclusive: the mutation must commit before it.
- Cancellation remains available for a persisted eligible booking if its
  Organization or Branch later becomes inactive. This lets a customer release
  an existing commitment. Reads of existing bookings also remain available.
- New change requests and approvals require an active, non-deleted
  Organization, Branch, Service, offering, and eligible staff relationship.
  Restaurant and cafe reservations remain on their separate flow.
- Only one pending change request may exist per booking. A request created by
  the customer is answered by an authorized business operator. A proposal
  created by the business is still answered by the customer through the
  pre-existing web path.
- Business approval revalidates the slot and compares the booking `updatedAt`
  snapshot captured when the request was created. A stale request cannot
  overwrite a newer booking state.

## Replay and concurrency

- Cancellation and customer change-request mutations require a UUID
  `Idempotency-Key`. The persisted request hash binds the key to the customer,
  booking, and canonical payload. Same-key/same-payload retries replay the
  prior result; changed payloads return `IDEMPOTENCY_CONFLICT`.
- Mutations run in serializable transactions with bounded retry for database
  serialization conflicts.
- Status history is written in the same transaction as the booking mutation,
  so history failure rolls back the entire operation and successful replay
  cannot duplicate history.

## Pagination

- Customer lists use an opaque base64url cursor containing the tab, booking
  `startsAt`, booking UUID, and list snapshot time.
- Ordering is `startsAt + id`: ascending for Upcoming and descending for all
  historical views. The filter context is bound to the cursor, so a cursor
  cannot be reused across tabs.
- Restaurant reservations are excluded from this service-booking API.
