# Stage 3A — Merchant Commerce and Store Operations

Status: pre-implementation architecture audit completed on 2026-07-17.

Scope: Gate 3A only. Product/variant/inventory management, Merchant Orders and
fulfillment, broader Commerce administration, payments, media upload, mobile
Business Commerce, physical-device QA, visual redesign and AI remain deferred.

## Baseline

- Source baseline: `origin/main` at
  `c35b6fd0e1040805047666251055cbd302bd0114`.
- PR #112 is merged into that baseline.
- Repository and `rezno-staging` both contain 30 applied migrations before this
  gate.
- `/business/commerce` is still owned by the deferred Stage 3 registry before
  this implementation replaces it with a concrete route.
- PR #100 remains an unrelated Open Draft at
  `e46454df993ecccb06180060dda4353ec88e2641`.

## Existing architecture and runtime map

The Commerce foundation is a Next.js application with React-independent domain
and service modules under `features/commerce`, thin route handlers under
`app/api/commerce`, Business pages under `app/business`, Admin pages under
`app/admin`, and the customer Marketplace in the Expo mobile application.

The runtime entry points inspected for this gate are:

- public catalog: `app/api/commerce/public/*` backed by
  `features/commerce/public/catalog-service.ts`;
- authenticated customer Commerce: `app/api/commerce/customer/*`;
- Merchant Inventory: `app/api/commerce/merchant/*`;
- Business Web: the `/business` layout, navigation, command palette and mobile
  dashboard navigation;
- Admin Web: the `/admin` layout and `AdminShell`;
- mobile customer Marketplace, Cart, Checkout, Orders, Favorites and
  Notifications through the existing customer APIs;
- PostgreSQL state through Prisma schema/migrations and the existing Commerce
  fixtures and test suites.

No current Business or Admin Store page exists. The catch-all Business route
returns `notFound()` for Commerce because the deferred registry is documentary,
not a functional placeholder.

## Schema and migration audit

### Existing invariants that are reusable

- `CommercePermission` contains the approved 12-permission set.
- Owner roles are seeded with all 12 permissions; non-owner roles default to no
  Commerce permissions.
- `Store.organizationId` is unique, so the database already enforces one Store
  per Organization.
- `Store.slug` is globally unique.
- Store lifecycle values are `DRAFT`, `PENDING_REVIEW`, `ACTIVE`, `REJECTED`,
  `SUSPENDED` and `ARCHIVED`.
- `Store.updatedAt` is a database-maintained timestamp and is suitable as the
  optimistic version. A second integer version is unnecessary.
- Store currency columns use exact `Decimal(18,3)` values and the Commerce
  domain restricts persisted currency to IQD.
- `Product`, `ProductVariant`, `InventoryItem`, `InventoryReservation`,
  `StockMovement`, `Cart`, `Order`, `OrderItem`, `OrderStatusHistory` and
  `Payment` retain immutable/historical Commerce relationships needed by Store
  archive and visibility rules.
- `BusinessOperationMutation` already provides Organization-scoped UUID
  idempotency, canonical request hash, actor membership, result version and
  sanitized replay result.
- `BusinessAuditLog` already provides Organization, actor membership/person and
  before/after records.
- `Notification.eventKey` is globally unique and supports exact-once Store
  lifecycle notifications without a new notification table.

### Proven schema gaps

`AdminAuditLog` currently records only action, actor, target, metadata and time.
It cannot safely provide exact replay, changed-replay conflict, an expected
result version or a stored replay DTO for Admin moderation. A separate third
Commerce ledger would duplicate the existing audit architecture. Therefore
migration 31 is required to extend `AdminAuditLog` with nullable
`idempotencyKey`, `requestHash`, `resultVersion` and `result`, plus an
actor/key unique constraint. Legacy Admin audit rows remain valid because the
new fields are nullable.

The Admin queue requires deterministic ordering by `submittedAt, id` and the
general list by `updatedAt, id`. Existing Store indexes cover
`organizationId,status` and `status,publishedAt`, but not these bounded cursor
queries. Migration 31 will add the evidence-backed Store indexes
`(status, submittedAt, id)` and `(updatedAt, id)`.

No other model or lifecycle column is required. Migrations 1–30 remain
immutable.

## Mandatory behavior audit

1. Existing Store transitions are `DRAFT -> PENDING_REVIEW|ARCHIVED`,
   `PENDING_REVIEW -> ACTIVE|REJECTED|ARCHIVED`,
   `REJECTED -> DRAFT|ARCHIVED`, `ACTIVE -> SUSPENDED`, and
   `SUSPENDED -> ACTIVE|ARCHIVED`. `ARCHIVED` is terminal.
2. Store creation, submission, rejected reopen and archive exist as services;
   there is no Store profile/settings update service.
3. All current Store lifecycle mutations lack a client-supplied expected
   version. Some use status-based `updateMany`, but that is not an exact
   optimistic version contract.
4. All current Store lifecycle and Admin moderation mutations lack UUID
   idempotency.
5. Those mutations also lack canonical request hashes and replay results.
6. Merchant Inventory has specialized StockMovement audit semantics. Current
   Store mutations write neither `BusinessOperationMutation` nor
   `BusinessAuditLog`, while mature Business Operations services write both in
   the same serializable transaction.
7. Admin Store moderation writes an `AdminAuditLog` per attempt, but does not
   revalidate AdminAccess in the transaction and cannot replay exactly.
8. One Store per Organization is protected by a database unique constraint and
   a service pre-check. Creation still needs an Organization row lock and stable
   conflict mapping for concurrent requests.
9. Slug collision is database-enforced globally, but the current raw Prisma
   error is not mapped to a stable domain conflict.
10. Public Store list/detail/products, Favorites, Cart and Checkout require an
    ACTIVE, published, non-archived Store. They do not consistently require the
    owning Organization to remain active and non-deleted.
11. DRAFT, PENDING_REVIEW, REJECTED, SUSPENDED and ARCHIVED stores are currently
    excluded by status from the principal public queries. Historical Orders are
    Store-snapshot based and remain readable.
12. Store logo and cover values are only trimmed and bounded today. The shared
    `isSafePublicImageUrl` policy already rejects non-HTTPS, credentials,
    localhost/private-looking hostnames and literal IPs, but Store inputs do not
    use it.
13. Merchant resolution checks active membership and Organization, but omits
    the active, non-deleted Person relation. API session lookup checks Person
    first, while raw service callers can bypass that check.
14. The existing Identity policy fixes all 12 permissions for Owner and makes
    only `STORE_MANAGE` owner-only. No owner-managed Commerce grant surface
    exists.
15. No current Commerce permission mutation exists, so self-grant is not
    presently exposed. A new mutation must explicitly reject Owner targets,
    Receptionist targets, `STORE_MANAGE`, foreign roles and any non-owner actor.
16. Business navigation is based only on `SystemRole`; it currently exposes no
    Commerce entry. Merchant Inventory APIs correctly require explicit
    permissions, but future links would be overexposed if role-only navigation
    were reused.
17. Receptionist roles can technically have arbitrary persisted array values,
    but there is no grant surface. The canonical resolver and grant policy must
    fail closed for Receptionist regardless of stored Commerce values.
18. Active-Business selection is an HTTP-only cookie. `requireBusinessIdentity`
    re-resolves it against active memberships, but Store forms still require a
    rendered Organization ID guard and transaction-time actor revalidation to
    prevent stale-tab writes after a Business switch.
19. Existing Commerce route handlers are mostly thin. The Merchant Inventory
    adjustment route performs a direct Prisma reload after the domain mutation;
    the new Store routes and Server Actions must not write Prisma directly.
20. Existing Store services scope Merchant Store reads by Organization, which
    is good, but raw identity `{organizationId, personId}` inputs and missing
    transaction-time Person checks leave a tenant/IDOR boundary to close.
21. Commerce HTTP rate limiting uses a process-local in-memory store. It is a
    best-effort abuse control only, not a distributed correctness or security
    boundary. Database idempotency and authorization remain authoritative.
22. Existing notifications cover Order events only. No Store submitted,
    approved, rejected, suspended or reactivated event exists.
23. `/business/commerce` and all Admin Commerce Store pages are missing. Product,
    Inventory, Orders and Reports Business cards must remain truthful deferred
    states for Gates 3B/3C rather than functional-looking links.
24. Current readiness checks only require one fulfillment method and the
    relevant delivery/pickup fields. They omit Organization state, safe images,
    phone, currency, money, estimates, lifecycle consistency and safe
    serialization.
25. Migration 31 is genuinely required only for Admin replay/version semantics
    and the measured Admin cursor indexes described above; Merchant operations
    reuse the existing Business ledgers and Store/Role timestamps.

## Locked authorization design

The canonical Merchant actor is React-independent. A server adapter derives its
reference from the authenticated session and selected Business; services never
accept Person, Organization, role or permissions from a form. The actor contains
Organization ID/name/slug, membership ID, Person ID, role ID, exact
`SystemRole`, exact persisted Commerce permissions and the Store relationship
when requested.

Every mutation re-queries the exact membership in its serializable transaction,
requiring:

- matching membership, Person and selected Organization IDs;
- active, non-deleted membership and Person;
- active, non-deleted Organization;
- role belonging to the same Organization;
- unchanged SystemRole and the required canonical permission.

A stale active-Business selection, revoked membership, deleted Person, moved
role or changed permission fails closed before any ledger/audit row is written.

## Final Commerce grant matrix

| System role | Effective policy | Owner may assign |
| --- | --- | --- |
| Owner | Fixed complete 12-permission baseline | Not editable |
| Manager | Explicit persisted access only | Every approved permission except `STORE_MANAGE` |
| Receptionist | Always denied Commerce | Nothing |
| Staff | Explicit persisted operational access only | `STORE_VIEW`, `PRODUCT_VIEW`, `INVENTORY_VIEW`, `INVENTORY_ADJUST`, `ORDER_VIEW`, `ORDER_MANAGE` |

Manager permissions remain operational and do not confer permission-assignment
or platform Admin authority. Staff cannot create/update/archive Products,
cancel Orders, view Reports or manage the Store. Null/custom SystemRole values
fail closed. Owner alone can manage grants, cannot target an Owner or
Receptionist role, cannot change `SystemRole`, cannot grant `STORE_MANAGE`, and
cannot touch another Organization.

The access mutation uses `Role.updatedAt` as the expected version, a UUID key,
canonical hash, role row lock, `BusinessOperationMutation`,
`BusinessAuditLog`, exact replay and atomic full-array replacement from a strict
allowlist.

## Store contracts and policies

### DTOs

- `OWNER_MANAGEMENT`: complete safe Store profile, lifecycle reasons and
  timestamps, fulfillment settings, readiness, expected version and permitted
  owner actions.
- `MERCHANT_READ_ONLY`: bounded status/public slug and operational fulfillment
  fields. No owner-only mutation version, archive/review controls or access
  administration.
- `ADMIN_REVIEW`: Organization identity, safe Store profile and lifecycle,
  readiness, public visibility, bounded product/inventory/order summary counts,
  expected version, allowed moderation actions and bounded audit summary.

No DTO exposes session/auth data, cookies, credentials, customer Order PII,
database values or unrelated tenant fields.

### Validation

Strict Zod schemas reject unknown fields and normalize Store name, lowercase
slug, bounded text, canonical phone, exact IQD strings, bounded integer
estimates and fulfillment addresses. Logo/cover use the shared safe public HTTPS
image policy. Lifecycle, owner, Organization, review, suspension and archive
fields are not accepted in profile payloads.

### Create and update

Creation is Owner-only `STORE_MANAGE`, locks the Organization, creates DRAFT
only, creates no Products, maps Organization/slug uniqueness to stable conflicts
and writes one Merchant ledger/audit result.

Editable profile states are DRAFT and REJECTED. Rejected Stores retain their
status and review reason while corrections are saved, then the explicit reopen
action moves them to DRAFT. PENDING_REVIEW and ARCHIVED are immutable.
SUSPENDED is immutable to Merchants.

ACTIVE operational changes are intentionally narrow: fulfillment toggles and
settings, support phone, estimates, fees and pickup instructions may change
without changing lifecycle. Material public identity fields (name, slug,
description, logo and cover) require re-review and are rejected while ACTIVE in
Gate 3A. No update rewrites Product or Order snapshots.

### Readiness and lifecycle

The canonical readiness evaluator reports stable check keys and missing fields
for active Organization, lifecycle consistency, name/slug/description, safe
images, normalized support phone, IQD, exact non-negative money, bounded
estimates, at least one fulfillment method and its required address fields.
Products are not a Gate 3A readiness requirement.

Submit, reopen, resubmit and archive use the same version/idempotency/lock/audit
contract as create/update. Archive is Owner-only, requires a bounded reason, and
is blocked by PENDING/CONFIRMED Orders or ACTIVE InventoryReservations. It is a
terminal soft lifecycle state and preserves all history. Merchants cannot
reactivate SUSPENDED Stores.

## Admin moderation contract

List/detail require `COMMERCE_STORES_VIEW`; approve/reject/suspend/reactivate
require `COMMERCE_STORES_REVIEW`. The service revalidates an active, non-expired
AdminAccess or environment super-admin inside the transaction, locks the Store,
checks its exact timestamp version and lifecycle, and writes one replay-capable
`AdminAuditLog` row.

Reject and suspend reasons are trimmed, bounded and sanitized. Admin cannot edit
Merchant profile, ownership, permissions, Products, Orders or Payments. Queue
cursors are opaque and bound to actor, permission, filter, search, sort and
snapshot time. Submitted queue order is `submittedAt ASC, id ASC`; general order
is `updatedAt DESC, id DESC`.

## Visibility and notification policy

The single public Store rule is: Store ACTIVE, published, not archived, and
owned by an active, non-deleted Organization. It applies to public Store list and
detail, Store Products, Product detail, Favorites, Cart validation, Checkout and
mobile Marketplace. DRAFT/PENDING_REVIEW/REJECTED/SUSPENDED/ARCHIVED are not
discoverable or eligible for new checkout. Existing Favorites are retained but
hidden while unavailable. Historical customer Orders remain readable from
snapshots.

Store lifecycle notifications reuse `Notification.eventKey` and the current
notification delivery foundation. Submission creates an Admin review event;
approve/reject/suspend/reactivate notify eligible active Organization owners.
The event key is deterministic per Store/event/lifecycle result/recipient, so an
idempotent replay creates no duplicate. Stage 4 still owns notification-center
completion and outbound delivery.

## Performance and security decisions

- Merchant Store and role queries are bounded to the selected Organization.
- Admin list uses one bounded candidate query and aggregate counts, with no
  customer PII and no N+1 loading.
- Actor/session data is never placed in shared public caches; authenticated
  responses are `no-store`.
- The public visibility predicate is centralized and includes Organization
  state; no non-ACTIVE Store is cached publicly.
- Correctness never depends on the process-local limiter.
- Stable domain errors map uniqueness, stale writes, malformed cursor,
  authorization and replay conflicts without raw Prisma/PostgreSQL details.
- Origin/CSRF protection remains the responsibility of authenticated Next
  Server Actions/session policy; exact FormData allowlists and same-site session
  cookies are still enforced at adapters.

This document is the locked implementation contract for Gate 3A. Any behavior
outside it is deferred to the later Stage 3 gates.
