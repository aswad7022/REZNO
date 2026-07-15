# Stage 2B — Services and Workforce Operations

## Scope and evidence baseline

Stage 2B connects the existing Business Web routes `/business/services`,
`/business/team`, and `/business/team/[memberId]/availability` to the canonical
Gate 2A operational context, mutation ledger, audit log, locks, and serializable
retry layer. It does not add daily booking processing, Restaurant operations,
Commerce operations, Business Mobile, media, messaging, payments, or visual
redesign work.

The pre-implementation audit found:

- `/business/services`, `/business/team`, and the member availability route
  were database-backed, but their Server Actions wrote directly through Prisma.
- the catch-all `/business/[...segments]` route still owns unrelated placeholder
  destinations; no placeholder is used for a Stage 2B workflow after this gate.
- the Service editor coupled Service metadata, every Branch offering, and every
  staff assignment in one write. Price and duration were copied across selected
  Branches, assignments were mass-deleted/recreated, and no expected version,
  replay ledger, impact confirmation, or audit record existed.
- Service had only `ACTIVE`/`INACTIVE` and no deletion marker. BranchService had
  no timestamps, so neither safe soft archive nor offering optimistic concurrency
  was representable. Forward-only migration 30 adds only those missing fields.
- Category is a platform taxonomy without an Organization owner. The server
  validates that the referenced taxonomy record exists; it cannot enforce a
  tenant Category relation that the schema does not model.
- OrganizationInvitation was email-bound and authenticated, but lacked an
  operational revoke action and replay/audit behavior. Expiration written inside
  a transaction was previously rolled back when the action immediately threw.
- member profile, role, Branch assignment, and schedule writes duplicated role
  checks and trusted broad form payloads. Managers could attempt Manager changes.
- Staff could previously update their own weekly schedule. Stage 2B preserves
  the deliberate self-time-off policy but removes Staff schedule write access.
- the member availability loader allowed an authenticated Staff member to address
  another member ID in the same Organization. It is now self-scoped and returns
  a safe not-found result for forged or foreign IDs.
- Service staff eligibility previously treated an empty explicit assignment set
  as “all Branch employees.” That permissive fallback is removed everywhere.
- generic booking creation was already serializable and snapshot-preserving.
  Stage 2B keeps that foundation and makes optional automatic assignment choose
  only an explicitly assigned, Branch-assigned, scheduled, unblocked employee in
  deterministic `(createdAt, id)` order inside the booking transaction.
- future booking snapshots and relations were already the historical source of
  truth. Stage 2B lifecycle mutations preserve Booking rows, `priceSnapshot`,
  `serviceNameSnapshot`, times, and `memberId`.

## Canonical authorization

The single capability map is `features/business-operations/domain/policy.ts`.
Every mutation resolves the active authenticated membership, then revalidates
the same person, Organization, membership, role, and capability under lock.

| Capability group | Owner | Manager | Receptionist | Staff |
| --- | --- | --- | --- | --- |
| Service / offering read | all lifecycle states | all lifecycle states | active only | assigned active only |
| Service / offering write | yes | yes | no | no |
| Workforce read | all | all operational | active operational | self only |
| Invite / member / role write | Manager, Receptionist, Staff | Receptionist, Staff | no | no |
| Branch / Service assignment write | permitted targets | Receptionist, Staff | no | no |
| Staff schedule read | all permitted workforce | all permitted workforce | operational read | self only |
| Staff schedule write | permitted targets | Receptionist, Staff | no | no |
| Member blocks | all permitted targets | Receptionist, Staff | read only | own future blocks only |

No Stage 2B path grants Owner, transfers ownership, lets a Manager alter an
Owner/Manager, deletes Person identity, or authorizes from a client-supplied
Organization ID.

## Service and Branch offering lifecycle

Service metadata contains name (2–120), description (0–2000), optional HTTPS/URL
image (maximum 2048), global taxonomy Category, and the existing
`NONE`/`OPTIONAL`/`REQUIRED` selection mode. Branch price and duration remain only
on BranchService.

- deactivation removes the Service from discovery, availability, favorites, and
  new booking creation. Future active bookings require explicit confirmation and
  are never cancelled.
- archive is soft (`ARCHIVED` plus `deletedAt`) and requires the Service to be
  inactive with zero future active bookings, available offerings, or active
  staff assignments.
- an offering requires a same-Organization, non-deleted/non-archived Service and
  Branch. The unique Branch/Service relation is authoritative.
- price is a positive decimal string with at most eight integer and two fraction
  digits (`0 < price <= 99,999,999.99`). Persistence uses `Prisma.Decimal`.
- duration is an integer from 5 through 1440 minutes. Zero, negative, fractional,
  string, NaN, and out-of-range values fail closed.
- price/duration/availability material changes report future active booking impact
  and require confirmation. Existing price snapshots and booking times are not
  rewritten.
- an offering is physically removed only if it has no Booking or favorite
  relationship; otherwise deactivation is the supported lifecycle.

## Staff selection and availability

- `NONE`: no employee is attached; Branch hours and Branch-wide blocks define
  availability.
- `OPTIONAL`: a customer may choose an eligible employee. Without a choice, the
  booking transaction deterministically assigns an eligible explicit Service
  assignment. A null-employee booking is retained only when no Service assignment
  exists, preserving the existing no-provider product behavior.
- `REQUIRED`: the customer must choose an eligible explicit Service assignment.

An eligible employee must have an active Person and membership in the same
Organization, an active Branch assignment, an explicit Service assignment, a
weekly interval covering the slot, no member block, and no active booking overlap.
Branch-wide blocks continue to affect every employee. Member blocks affect only
their member. Serializable booking creation and overlap rechecks prevent a
concurrent double booking.

## Invitations, membership, and assignments

Invitations normalize email with NFKC/lowercase, require an expiry between one
hour and 30 days, prohibit duplicate valid pending invitations and active
memberships, and restrict target roles by inviter authority. The established
architecture identifies an invitation by unguessable UUID plus the authenticated
recipient email/person; it has no separate raw token column to store or log.
Create, revoke, and acceptance are transactional. Exact acceptance replay returns
the single membership; changed/different replay fails. Expired status persists
before the domain error is returned.

Membership deactivation/removal preserves Person and Booking history and removes
the member from new availability through the active-membership predicate. Future
active bookings require confirmation and are not reassigned or cancelled.

Branch and Service assignment changes are unique, same-tenant, role-restricted,
replay-safe, and impact-aware. Service assignment additionally requires at least
one active Branch assignment because the current ServiceStaffAssignment schema is
Organization-wide; Branch eligibility is the intersection at availability time.

## Schedules and member leave

The existing Availability table is retained. The current Business Web product
supports one canonical non-overnight interval per weekday/Branch, although the
table can store multiple rows. Updates always submit exactly seven unique days,
use `HH:mm`, remain within Branch hours, and use the Branch timezone. A membership
`updatedAt` touch is the schedule aggregate version. Bookings outside the proposed
schedule require confirmation and remain unchanged.

Gate 2B owns BlockedTime rows with non-null `memberId`; Gate 2A continues to own
Branch blocks with null `memberId`. Member blocks use Branch-local input converted
to canonical instants, reject nonexistent local time, have a maximum duration of
31 days, reject overlap, and keep the reason inside authenticated Business views
and audit only. Staff can manage only their own future block on an actively
assigned active Branch. Receptionist is read-only.

## Mutation, concurrency, audit, and security

Every Stage 2B write uses a UUID idempotency key, canonical SHA-256 request hash,
active Organization form context, target/aggregate expected version, bounded rate
limit, row locks, a serializable transaction with bounded retry, one
BusinessOperationMutation row, and one sanitized BusinessAuditLog row. Relationship
creation versions use their immutable `createdAt`; mutable aggregates use
`updatedAt`; deletion records the deletion instant for exact replay.

Server Actions accept strict field allowlists and are thin adapters. Next Server
Actions provide same-origin/Origin validation; business identity and active
membership checks remain the authorization boundary. Cross-tenant IDs return
not-found/conflict without disclosing foreign data. Audit sanitization removes
passwords, tokens, cookies, sessions, authorization values, and database URLs;
invitation email/secret material is not included in operational audit payloads.
No production mock fallback is used.

## Validation assets

- unit: capability/role matrices, strict schemas, price/duration, schedules,
  invitation expiry, explicit staff policy, hashing, audit sanitization, migration,
  and fixture safety.
- PostgreSQL: Service, offering, invitation, membership, assignment, schedule,
  block, historical preservation, availability, automatic assignment, replay,
  stale, tenant, rollback, and concurrency behavior.
- live HTTP: real authenticated Business pages and progressive Server Actions for
  Owner/Manager writes, Receptionist/Staff reads, active-business stale forms,
  schedules, member self-scope, and cross-tenant IDs.
- staging fixture namespace: `rezno-qa-business-workforce-stage2b`; it is manual,
  transactional, deterministic, idempotent, staging-marker protected, exact-token
  protected, and refuses production/prod/live targets.
