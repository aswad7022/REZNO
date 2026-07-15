# Stage 2A Business Operations Core

## Evidence audit

The pre-Stage-2A dashboard already had database-backed routes at
`/business/manage/settings`, `/business/manage/locations`, the per-Branch
working-hours route, `/business/public-profile`, the active-business selector,
generic booking availability, and Restaurant availability. The catch-all
Business routes outside these areas remain placeholders and are not part of
this gate.

The audit found these material gaps:

- authorization was repeated across Server Actions and did not express one
  complete Owner/Manager/Receptionist/Staff operational policy;
- a form rendered for Organization A could be submitted after another tab
  changed the active-business cookie to Organization B;
- settings, Branches, hours, and closures had no authoritative optimistic
  version, reusable replay ledger, or tenant audit record;
- Branch lifecycle changes used direct status updates and lacked complete
  reservation impact and archival relationship checks;
- working hours were replaced without a full concurrency/replay contract;
- Branch closures had create/delete only, no overlap lock, no update version,
  and a second mutation path on the public-profile management page;
- closure reasons were serialized to the public customer profile;
- Staff could reach Organization configuration reads, and Receptionist could
  not manage Branch closures despite the established operational role;
- the schema supports exactly one interval for each `(branchId, dayOfWeek)`;
  overnight and split-day intervals are therefore not supported by this gate.

## Canonical architecture

The React-independent implementation lives under
`features/business-operations`:

- `domain/policy.ts` is the role/capability matrix;
- `services/context.ts` re-resolves the active membership, Person,
  Organization, and Role for every operation and applies the established
  authenticated mutation rate limit;
- every mutation carries the Organization rendered with the form, while the
  actual Organization is derived from the authenticated membership; a mismatch
  fails with `ACTIVE_ORGANIZATION_CHANGED`;
- settings, Branch, hours, and block services enforce tenant scope, strict
  schemas, authoritative versions, canonical request hashes, UUID idempotency,
  and transactionally append audit records;
- Branch and Organization mutations use serializable transactions and row
  locks. Branch locks include both Branch ID and Organization ID;
- booking impact is counted from active `PENDING`/`CONFIRMED` Booking rows and
  separated into generic bookings and Restaurant reservations;
- Server Actions, pages, and components only adapt form/page state to these
  services.

## Role policy

| Capability | Owner | Manager | Receptionist | Staff |
| --- | --- | --- | --- | --- |
| Settings read/write | Yes | Yes | No | No |
| Branch read | Yes | Yes | Active only | No |
| Branch create/update/lifecycle | Yes | Yes | No | No |
| Branch archive | Yes | No | No | No |
| Hours read | Yes | Yes | Active only | No |
| Hours write | Yes | Yes | No | No |
| Branch blocks read/write | Yes | Yes | Active only | No |
| Tenant audit read | Yes | No | No | No |

Revoked/inactive/deleted membership, Person, or Organization records fail
closed. A Role whose Organization does not match the membership also fails
closed.

## Operational rules

- Gate 2A settings are limited to `bookingEnabled`, `marketplaceVisible`, and
  integer `cancellationWindowHours` in the inclusive range 0–720. Existing
  payment, notification, staff-selection, vertical, and Commerce fields cannot
  be mass assigned.
- Branch creation initializes seven deterministic closed days. Updates preserve
  existing relationships. An IANA timezone change is blocked while future
  active generic or Restaurant reservations exist.
- deactivation requires another active Branch and explicit confirmation when
  future reservations exist. It never cancels existing records.
- archival is Owner-only, soft, and restricted to an inactive Branch with no
  future active reservations, available BranchService, active assignment, or
  active Restaurant table. Historical Booking relations remain intact.
- hours require all seven unique weekdays, canonical `HH:mm`, an explicit open
  flag, and a same-day opening interval. The full schedule is replaced in one
  transaction. Reservations outside the new schedule require confirmation and
  remain unchanged.
- Gate 2A blocks always have `memberId = null`. Local input is interpreted in
  the Branch timezone, nonexistent local times are rejected, duration is at
  most 31 days, and overlaps are rejected under a tenant-scoped Branch lock.
  Only future/current blocks are mutable. Internal reasons are absent from all
  public/customer DTOs.

## Migration 29

Migration `20260715210000_business_operations_core` adds:

- `BusinessOperationMutation`, unique by Organization and UUID idempotency key,
  with actor membership, request hash, action, target, result, and result
  version;
- `BusinessAuditLog`, with Organization, actor membership/Person, action,
  target, sanitized before/after states, and timestamp.

Both records are written in the same serializable transaction as the business
mutation. Exact replay returns the recorded authoritative result. A changed
payload, foreign membership, later conflicting mutation, or stale version
fails closed.

## Public effects

The existing generic and Restaurant query/create services already require an
active Organization, visible/enabled settings, an active non-archived Branch,
valid hours, and no overlapping Branch block. Stage 2A preserves those shared
dependencies and removes the internal block reason from public profile
serialization. Existing and historical Booking reads do not depend on current
public availability.

## Deferred work

Stage 2B owns Services, BranchService configuration, workforce, assignments,
staff hours, and member-level blocks. Stage 2C owns daily booking operations.
Stage 2D owns Business Operations closure. This gate does not implement those
areas, Business Mobile, Commerce, payments, messaging, media, AI, or visual
redesign.
