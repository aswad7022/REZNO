# Stage 2C — Daily Booking and Restaurant Operations

## Pre-implementation evidence audit

This audit was completed against `origin/main` at
`62e5deeb8ec6c33ddcac028d6ae7c8d7f659d4a5` before Stage 2C implementation.
The repository and real staging database both contained the same 30 finished
Prisma migrations. PR #110 was merged at that commit. PR #100 remained open and
Draft at `e46454df993ecccb06180060dda4353ec88e2641`.

The existing application is database-backed, but its daily operations paths are
not one canonical operational architecture yet:

1. `/business/calendar` reads real Booking rows through
   `features/bookings/services/business-calendar.ts`. It applies an Organization
   predicate and a Staff `memberId` predicate, but returns one broad DTO for every
   role. The Staff result can therefore contain customer phone/email, notes,
   member options, Organization summary counts, mutation versions once added,
   and Restaurant data unless every individual query condition remains correct.
2. Calendar queries stop at 80 records and summaries stop at 500. There is no
   cursor, insertion snapshot, `(startsAt,id)` tie-break order, or tenant/role/
   filter binding, so busy days can be silently truncated.
3. Receptionist calendar reads are Organization-wide and do not require an
   active Branch. This conflicts with the established Gate 2A active-Branch
   Receptionist contract.
4. `/business/bookings` reads real generic and Restaurant Bookings but has no
   pagination. Its cards call the legacy mutation actions directly.
5. `/business/bookings/[bookingId]` has no concrete page. The catch-all Business
   route renders only registered placeholders or not-found. The only concrete
   generic detail services are customer-scoped.
6. `/business/bookings/[bookingId]/reschedule` is concrete, but its proposal
   action performs direct Prisma reads/writes. It has no expected Booking version,
   operational idempotency ledger, active-business form binding, tenant audit,
   customer Notification row, or membership revalidation inside its transaction.
7. `transitionBusinessBooking` writes Booking, pending requests, and status
   history directly. It checks a coarse role predicate before the transaction,
   but has no row lock, replay contract, expected version, audit, cancellation
   reason requirement, or lifecycle timing rule. A future CONFIRMED Booking can
   currently be completed or marked no-show.
8. Customer-to-Business request acceptance has a stronger serializable service
   and revalidates availability, assignments, schedules, and blocks. The Business
   adapter still supplies only Organization and Person, not the active membership
   and capability, and the mutation has no business ledger/audit/notification.
   Rejection has no Booking-version binding.
9. Business-to-customer proposal creation and customer response remain separate
   direct-Prisma paths. Business proposals do not persist
   `bookingUpdatedAtSnapshot`, do not use their existing creation idempotency
   fields, and can race a Booking update. Customer acceptance rechecks conflicts
   and blocks but not the complete Gate 2B staff eligibility policy.
10. Booking and BookingChangeRequest lookups are tenant/customer constrained in
    the main paths. The missing shared Business detail/mutation service makes
    consistent safe not-found behavior and IDOR regression coverage incomplete.
11. BookingStatusHistory is the durable lifecycle/activity source. Existing
    history notes mix canonical markers and free text, including cancellation
    reasons and detailed reschedule sentences. Raw notes must not be exposed as
    customer or Staff activity.
12. Booking snapshots (`serviceNameSnapshot`, `customerNameSnapshot`,
    `priceSnapshot`) and RestaurantReservationItem snapshots are already the
    historical truth. Existing management mutations preserve them; Stage 2C must
    continue to update only operational fields and relationships.
13. `/business/reservations` is a real Restaurant list, but it is a 50-row broad
    overview with no role-scoped contract, pagination, concrete detail route,
    lifecycle controls, expected versions, or business reschedule operation.
14. Customer Restaurant cancellation/reschedule is the strongest existing
    reference: it uses serializable retry, a Branch advisory lock, Booking and
    Restaurant detail optimistic versions, deterministic smallest-table
    allocation, immutable preorder snapshots, history, and notifications. Its
    `RestaurantReservationMutation` is customer-specific and cannot authorize or
    represent Business operations.
15. `/business/tables` and `/business/menu` are real pages. Their Server Actions
    write Prisma directly with Owner/Manager authorization, but lack strict
    operational envelopes, versions, replay, locks, impact checks, audit, and
    safe remove/lifecycle operations. Staff can currently reach their read
    services because Restaurant reads only check vertical membership.
16. Table allocation for public/customer Restaurant flows filters active tables
    in the same Branch, applies requested area and capacity, excludes overlaps,
    and chooses the deterministic smallest sufficient table. A table with null
    `branchId` is not allocatable by those flows. No existing code or database
    constraint declares table `code` unique, so Stage 2C will not invent a new
    uniqueness policy.
17. Menu categories use active/inactive visibility and menu items use available/
    unavailable visibility. No safe remove operations exist. MenuItem name/price/
    currency snapshots are already copied to RestaurantReservationItem and must
    never be rewritten by catalog changes.
18. Notification exists and has a unique `eventKey`, customer recipient and
    business scope. Generic Business lifecycle/proposal/request-response paths do
    not currently create Notification rows; customer Restaurant management does.
19. BusinessOperationMutation and BusinessAuditLog from Gate 2A can represent all
    Stage 2C Business mutations. Booking, RestaurantReservationDetails, table,
    category, and item `updatedAt` values can serve as optimistic/result versions.
    No schema change is required for the audited policy.
20. Current staging fixtures cover customer Booking, customer Restaurant,
    Organization core, and Services/workforce separately. None creates the full
    deterministic two-tenant daily-operations matrix or exercises role-scoped
    calendars, Business lifecycle, Restaurant Business reschedule, table/menu
    lifecycle, notification deduplication, or business audit.

## Canonical Stage 2C policy

Stage 2C extends the Gate 2A capability map and keeps every Business mutation on
the same active Organization actor reference. The active membership, Person,
Role, Organization, capability, and rendered Organization are revalidated inside
the serializable transaction after the relevant row lock.

| Capability group | Owner | Manager | Receptionist | Staff |
| --- | --- | --- | --- | --- |
| Booking read | Organization | Organization | active Branches | own assigned active-Branch generic agenda |
| Booking lifecycle/cancel/complete/no-show | yes | yes | yes on active Branches | no |
| Customer request response / business proposal | yes | yes | yes on active Branches | no |
| Restaurant reservation operations | yes | yes | active Branches | no |
| Restaurant table read | all states | all states | active Branch/table only | no |
| Restaurant table configuration | yes | yes | no | no |
| Restaurant menu read | all states | all states | active/available only | no |
| Restaurant menu configuration | yes | yes | no | no |

Calendar contracts are discriminated as `MANAGEMENT`, `RECEPTIONIST`, and
`STAFF_SELF`. Staff selects and serializes only Booking ID/reference, service and
Branch display names, start/end/timezone, customer display snapshot,
customer-provided service notes, and status. It has no customer phone/email,
other member identity, Organization summaries, Restaurant relationship, mutation
controls, versions, cancellation reason, or raw history notes.

Every calendar cursor binds version, Organization, role/scope, normalized view,
date and filters, snapshot time, last start time, and last ID. Today/upcoming use
`startsAt ASC,id ASC`; past/cancelled use `startsAt DESC,id DESC`. Counts are
independent queries and inserts after the snapshot cannot enter a later page.

The lifecycle is exactly PENDING→CONFIRMED/CANCELLED and
CONFIRMED→CANCELLED/COMPLETED/NO_SHOW. Final states are immutable.
COMPLETED/NO_SHOW require `now >= startsAt`; a past PENDING Booking is not
confirmable; cancellation remains allowed for either active status. Business
cancellation requires a trimmed customer-visible reason of 1–500 characters.

Same-status operational history uses an allowlisted event (`GENERIC_CHANGE_ACCEPTED`,
`BUSINESS_CHANGE_PROPOSED`, `RESTAURANT_RESCHEDULED`, or `TABLE_REASSIGNED`).
Lifecycle history records truthful from/to statuses. Raw history notes are never
part of customer or Staff DTOs.

Exact Business mutation replay returns the authoritative record only while its
result version remains current. Changed key reuse fails with
`IDEMPOTENCY_CONFLICT`; later target changes make an old replay stale. Successful
mutations atomically persist the target, one mutation ledger row, one sanitized
audit row, the required safe history row, and at most one recipient-scoped
Notification. Denied or rolled-back work leaves none of them.

Restaurant reschedule keeps Organization, Branch, customer, preorder rows and
their name/price/currency/quantity snapshots immutable. It validates active
Restaurant/Cafe, active same-tenant Branch, local hours, Branch blocks, table
capacity/area/activity and overlaps under the Branch advisory lock, then chooses
the smallest sufficient table unless a valid explicit table is selected.

Table deactivation is blocked while future active reservations use it. Hard
removal is allowed only without any RestaurantReservationDetails history.
Category removal requires no items. Item removal requires no
RestaurantReservationItem history; otherwise inactive/unavailable lifecycle is
the preservation path. Catalog mutations never rewrite reservation snapshots.

## Schema decision

No migration 31 is introduced by the audited design. The current schema safely
represents the policy through existing lifecycle flags, optimistic timestamps,
customer/business mutation records, notification event keys, and snapshot
columns. A migration will be added only if implementation or PostgreSQL tests
prove that an invariant cannot be enforced safely with those existing fields.
