# Stage 3C — Merchant Orders and Fulfillment

Status: architecture audit completed before implementation on 2026-07-17.

Scope: Gate 3C only. Broad Commerce Admin operations, payment gateways, refunds,
settlements, reports, outbound notification delivery, production scheduler
deployment, Merchant Mobile UI and Gate 3D are deferred.

## Baseline and architecture audit

The audit used exact `origin/main` commit
`406724fbc76ef1c6cea3b635903e487bf3b155a4`. The isolated worktree was clean,
the repository contained 32 immutable migrations, and real `rezno_staging`
reported 32 successfully applied migrations. The Commerce hub truthfully showed
Orders as Gate 3C deferred, and no Merchant Order route existed.

### Existing aggregate and constraints

- `Order` already owns immutable Store/customer snapshots, the three lifecycle
  statuses, offline fulfillment/payment methods, totals, reservation deadline and
  lifecycle timestamps. It has no separate numeric version; `updatedAt` is the
  correct aggregate optimistic version.
- `OrderItem` snapshots are restrictive historical records. Product/Variant
  foreign keys may become null only after a relationship delete, while snapshots
  remain immutable. Existing unsafe image snapshots are stored but all public
  DTOs already pass them through `safePublicImageUrlOrNull`.
- `OrderAddress` is a Checkout snapshot and contains delivery PII. It must never
  enter a queue DTO, notification, cursor, history metadata or Business audit.
- `Payment` is one-to-one with Order. The database constrains supported Order
  method pairs to delivery/COD and pickup/pay-at-pickup, whole IQD totals and
  nonnegative amounts, but it does not itself enforce cross-row amount, currency,
  method or status equality.
- `InventoryItem` has database checks for `onHand >= reserved >= 0` and
  nonnegative version/threshold. `InventoryReservation.quantity` and
  `StockMovement.quantity` are positive; movement results enforce the Inventory
  floor.
- Checkout locks Inventory rows, creates one ACTIVE reservation and RESERVE
  movement per Cart line, increments `reserved` and Inventory version, converts
  the Cart, creates Order/Payment/history atomically and uses
  `CheckoutIdempotency`. Checkout replay is customer-scoped and request-hashed.
- `OrderStatusHistory.idempotencyKey` is globally unique and the history change
  constraint requires at least one new status. Its JSON metadata is sufficient
  for Gate 3C request hash, expected version, Merchant membership, result version
  and exact safe replay DTO; no parallel transition ledger is needed.
- `BusinessAuditLog` is suitable for one sanitized audit per Merchant transition.
  `BusinessOperationMutation` must not be used for Order transitions.
  `AdminAuditLog` and Admin cancellation code are pre-existing but broad Admin
  Order operation remains outside Gate 3C.
- Store archive already blocks PENDING/CONFIRMED Orders and ACTIVE reservations.
  Product/Variant archive is soft and must not invalidate a valid historical
  reservation or restock path.

### Existing lifecycle behavior and proven gaps

1. Order transitions are PENDING to CONFIRMED/REJECTED/CANCELLED/EXPIRED and
   CONFIRMED to COMPLETED/CANCELLED; terminal states have no outgoing edge.
2. Pickup fulfillment is UNFULFILLED to PREPARING to READY_FOR_PICKUP to
   PICKED_UP. Delivery is UNFULFILLED to PREPARING to OUT_FOR_DELIVERY to
   DELIVERED, with OUT_FOR_DELIVERY to DELIVERY_FAILED and retry back to
   OUT_FOR_DELIVERY.
3. Payment allows only UNPAID to PAID or VOIDED.
4. Confirmation locks the Order and Inventory, consumes ACTIVE reservations,
   decrements on-hand and reserved, increments Inventory versions and writes
   CONSUME movements. It does not check an expected Order version, store policy,
   complete reservation cardinality, Payment consistency or Merchant context
   again after locks; it writes no Business audit.
5. Rejection releases ACTIVE reservations and voids an UNPAID Payment, but lacks
   expected version, complete consistency checks, overdue resolution and audit.
6. Customer cancellation is tenant-scoped and atomic, releases PENDING
   reservations or restocks a CONFIRMED+UNFULFILLED Order. Its deterministic
   non-UUID key is not a client request contract, exact replay is absent, and a
   duplicate currently fails after the first success instead of replaying it.
7. Merchant cancellation exists only as dead service code: there is no Merchant
   API, Server Action or UI. It permits unsafe direct cancellation from
   OUT_FOR_DELIVERY and does not require stock-return confirmation after
   DELIVERY_FAILED.
8. Generic fulfillment advancement exists only as dead service code. No
   Merchant route/action/UI calls it, final handoff is a separate later payment
   operation, and delivery-failure has no customer notification.
9. `recordOfflinePaymentPaid` separately completes only after PICKED_UP/DELIVERED;
   this creates an inconsistent intermediate state and does not validate the
   Payment row against the Order aggregate.
10. The expiration batch uses bounded `FOR UPDATE SKIP LOCKED` and its manual
    command has a confirmation token, but no public expire-one service exists,
    the command does not validate its database target, and overdue
    Merchant/customer mutations can throw while leaving the reservation active.
11. `replayTransition` compares some requested fields and actor Person, but does
    not store/compare a canonical request hash, expected version or Merchant
    membership. It queries tenant scope separately before resolving the ledger.
12. Replay returns the Order relation's current state, not the authoritative
    original transition result. A replayed confirmation after PREPARING therefore
    returns PREPARING, violating exact replay.
13. Transition inputs accept arbitrary string keys in services. Strict UUID
    validation exists for other Commerce operations, but not Orders.
14. Stock movement keys prevent duplicate movements for the current one-line
    paths. Confirm/release iterate reservations safely, while restock reads
    `OrderItem` rather than CONSUMED reservations and does not aggregate duplicate
    Variants; it can overflow PostgreSQL Int before the database rejects it.
15. Order locking serializes confirmation/cancellation/expiration, and Inventory
    locks serialize them with adjustments. Missing stale-version checks and
    incomplete revalidation still make the losing caller's outcome unclear.
16. Notification `eventKey` is exact-once. Customer coverage lacks delivery
    failure and pickup/completion events. Merchant new/customer-cancel events
    select raw persisted permissions, so Owner effective permissions can be
    missed. Merchant destinations incorrectly point at `/business/notifications`
    rather than the Order detail.
17. Store suspension correctly blocks new discovery/Checkout while existing
    Orders remain stored. Existing service code does not explicitly permit only
    ACTIVE/SUSPENDED Store mutation or fail closed for unexpected active Orders
    in DRAFT/PENDING_REVIEW/REJECTED/ARCHIVED.
18. Customer list/detail DTOs are scoped and omit Merchant IDs/internal metadata.
    Customer history deliberately hides Merchant reasons, but customer detail
    lacks expected version for cancellable Orders.
19. No Merchant summary, management detail, read-only detail or replay-result DTO
    exists. Directly returning the Prisma Order include would leak phone/address
    and mutation data across structural boundaries.
20. No Merchant Order listing service exists. There is no bounded search/filter,
    queue snapshot, count query or actor/tenant/filter-bound cursor.
21. No bounded history cursor exists; current customer and raw service includes
    load all history. Merchant detail needs a bounded deterministic history page.
22. No Merchant Order API exists. The imported Order operations are reachable
    only from tests/expiration/customer cancellation, leaving confirm, reject,
    Merchant cancel, fulfillment and payment service exports production-dead.
23. `/business/commerce/orders` and its detail page are missing. Sidebar, mobile
    dashboard navigation, command palette, breadcrumbs, route labels and hub have
    no functional Orders destination.
24. Mobile customer Orders are production-connected, paginated and render
    cancellation truthfully from the current DTO. Cancellation sends only a
    reason, so it lacks UUID idempotency and expected version.
25. Owner has the full Order permission baseline. Manager assignment already
    supports explicit Order permissions. Staff assignment currently omits
    ORDER_VIEW and ORDER_MANAGE; Receptionist effective access fails closed.
26. Permission updates reject unassignable roles/permissions but do not enforce
    ORDER_MANAGE/ORDER_CANCEL dependency on ORDER_VIEW.
27. Notification/audit/history metadata must remain free of phone, address,
    coordinates, instructions, auth IDs, request headers and credentials.
28. Commerce HTTP errors sanitize unknown database failures. UUID route parsing
    exists. Authenticated HTTP throttling uses an in-process memory store and is
    only defense-in-depth, not a distributed production rate limit.
29. No production Order mock or fallback was found. The only Order placeholder is
    the truthful Gate 3C hub card.
30. Next 16.2.9 guidance confirms Server Actions are independently reachable and
    require authentication/authorization/input validation in the action/DAL;
    safe DTOs, `server-only`, same-origin Server Action protection and explicit
    expected-error return values are required.

### Query-plan and migration evidence

Real staging contained four Orders during audit. Existing plans for the required
pending queue, active queue and expiration batch used explicit Sort nodes over
sequential scans. History used the old `(orderId, createdAt)` index but still
required an explicit Sort because the deterministic `id` tie-breaker was absent.
The existing `(storeId, status, createdAt)` and
`(status, reservationExpiresAt)` indexes cannot satisfy Gate 3C's locked orders.

Migration 33 is therefore genuinely required and will be forward-only. It will
add only the evidence-backed indexes for `(storeId, status,
reservationExpiresAt, id)`, `(storeId, status, updatedAt, id)`,
`(status, reservationExpiresAt, id)` and `(orderId, createdAt, id)`. Migrations
1–32 remain untouched. Both fresh deployment and 32-to-33 rehearsal are required.

## Locked Gate 3C policy

### Roles and permission dependencies

| Role | View | Manage | Cancel | Access administration |
| --- | --- | --- | --- | --- |
| Owner | Fixed | Fixed | Fixed | Yes |
| Manager | Explicit | Explicit, requires View | Explicit, requires View | No |
| Staff | Explicit | Explicit, requires View | Never | No |
| Receptionist | Never | Never | Never | No |

Invalid persisted grants remain ineffective. An Owner permission update must
reject manage/cancel without view, any Staff cancel grant, any Receptionist
Commerce grant, Owner target mutation and cross-Organization Role targets.

### Store-state policy

ACTIVE permits full scoped operations. SUSPENDED blocks new Checkout but permits
safe completion/cancellation of existing PENDING/CONFIRMED Orders. Historical
terminal Orders remain readable for all Store states. A nonterminal Order under
DRAFT, PENDING_REVIEW, REJECTED or ARCHIVED is a data-integrity blocker and is not
silently repaired. Revoked Person, membership or Organization always fails closed.

### Aggregate, idempotency and inventory policy

Every mutation resolves an exact UUID-key replay first, scopes and locks the
Order, checks `Order.updatedAt`, revalidates the actor in-transaction, validates
Store/Order/Fulfillment/Payment consistency, locks Inventory in stable order,
updates the complete aggregate, records one history row, exact movements,
exact-once notifications and (for Merchant operations) one sanitized audit.

History metadata stores the canonical request hash, expected version, Merchant
membership when applicable, result version and exact safe transition result.
Exact replay returns that stored result even after later transitions and creates
no side effects.

Confirmation consumes each ACTIVE reservation once. PENDING rejection,
cancellation and expiration release reserved stock without changing on-hand.
Cancellation after consumption restocks each consumed reservation/Variant once
with checked Int arithmetic. OUT_FOR_DELIVERY cannot cancel directly;
DELIVERY_FAILED cancellation requires explicit physical stock return.

Final pickup/delivery handoff atomically sets PICKED_UP/DELIVERED, Payment PAID,
Order payment PAID and Order COMPLETED after verifying Payment amount, currency,
method and status. Gate 3C records offline receipt only; gateway, refund and
settlement behavior is Stage 5 scope.

The expiration service supports one exact Order and bounded SKIP LOCKED batches.
The manual command is guarded. Stage 6 owns recurring scheduler deployment,
monitoring and retry operations.

### DTO and PII policy

Merchant queue summary contains minimal customer display name and no phone,
address, coordinates, instructions or reasons. Management detail contains only
operationally required delivery/pickup snapshots. Read-only detail structurally
omits expected version, mutation controls and cancellation controls. Customer
detail preserves its public contract and includes expected version only while
cancellation is permitted. Replay returns a safe authoritative transition DTO.

## Implemented production surfaces

- `GET /api/commerce/merchant/orders` exposes the bounded, role-scoped queue.
- `GET /api/commerce/merchant/orders/[orderId]` exposes structurally distinct
  management and read-only detail DTOs.
- `POST /api/commerce/merchant/orders/[orderId]/transitions` connects decisions,
  fulfillment, cancellation and final handoff to the canonical aggregate service.
- `/business/commerce/orders` provides queue, search, lifecycle/payment filters,
  deterministic cursor pagination and counts independent of page size.
- `/business/commerce/orders/[orderId]` provides immutable item snapshots,
  method-specific operational PII, bounded history and only authorized actions.
- Customer cancellation now requires the UUID `Idempotency-Key` header and exact
  `expectedVersion`. The Expo client creates the key, sends the version and keeps
  the existing authoritative Orders detail flow.
- Commerce hub, sidebar/mobile dashboard navigation, command palette, breadcrumbs
  and Arabic/English/Kurdish route labels now expose Orders only with effective
  `ORDER_VIEW`. Reports and broad Admin closure remain deferred.
- The guarded manual expiration command now validates PostgreSQL and the exact
  `rezno_staging` database before running the bounded service. It does not deploy
  or imply a scheduler.

## History, audit and notifications

`OrderStatusHistory` remains the single transition ledger. Safe metadata stores
the request hash, expected/result versions, actor scope, Merchant membership and
the serialized original transition result. A matching replay returns that result;
actor, tenant, Order or payload changes conflict without creating history,
movements, audits or notifications.

Every first Merchant transition writes one sanitized `BusinessAuditLog`. Customer
and SYSTEM transitions do not impersonate a Merchant. Notifications use
destination-specific event keys, send customer lifecycle events to the customer
notification surface, and send new/cancelled/expired operational events only to
active members with effective `ORDER_VIEW`. Merchant metadata targets the concrete
Order detail route. Phone, address, coordinates, instructions, auth material and
request headers never enter notification or audit metadata.

## Migration and query evidence

Forward-only migration 33 replaces the insufficient expiration/history indexes
and adds the four evidence-backed deterministic queue/history indexes documented
above. Migrations 1–32 were not edited. Validation completed both a fresh 33/33
deployment and an exact 32-to-33 rehearsal. Query plans were inspected before the
migration; the old plans required explicit sorts for pending, active, expiration
and history traversal because their tie-breaker/order columns were incomplete.
Post-migration ordered-plan probes confirmed index-only scans through
`Order_storeId_status_reservationExpiresAt_id_idx`,
`Order_storeId_status_updatedAt_id_idx`,
`Order_status_reservationExpiresAt_id_idx` and the backward
`OrderStatusHistory_orderId_createdAt_id_idx`, without a Sort node.

## Security review

The production and live HTTP suites explicitly exercise Order/Store/customer IDOR,
active-Business confusion, Receptionist denial, Staff cancellation denial,
read-only structural omission, foreign cursor/filter rejection, stale writes,
cross-actor/cross-tenant replay, duplicate consume/release/restock, expiration and
cancellation races, Int overflow, paid cancellation, mass-assignment rejection,
same-origin Server Actions and raw database error suppression. Mutation authority
is derived only from the authenticated Person, selected Organization and exact
active membership. No P1 or P2 finding remains in the local pre-publish review.

The existing authenticated HTTP rate limiter remains process-local defense in
depth. A distributed production limiter remains an operational platform concern;
this gate does not misrepresent the in-memory limiter as cross-instance control.

## Deterministic fixture and local closure evidence

The manual fixture namespace is
`rezno-qa-commerce-orders-fulfillment-stage3c`. It contains three Stores, ten
People, the complete role matrix, fourteen lifecycle Orders/reservations and the
locked archived/unsafe/near-floor/near-Int-max sentinels. It is transactional,
staging-token guarded, exact-database guarded, deterministic and resets only its
own records and transition side effects.

On the local disposable database named exactly `rezno_staging`, migrations were
33/33 and two consecutive fixture runs produced the identical fingerprint:
`849c3819bd1f1ef2b09d70e4f95e406ed117c2805d9228d4822c042564e90372`.

Pre-publish validation completed:

- 242/242 unit tests.
- 217/217 PostgreSQL integration tests.
- 60/60 production HTTP/RSC/Server Action tests against an optimized local Next
  production server, with no skipped live test.
- focused Gate 3C: 14/14 unit, 9/9 PostgreSQL and 4/4 live HTTP tests.
- root lint, non-incremental TypeScript, Prisma format/validate/generate and
  `git diff --check`.
- Next 16.2.9 optimized production build.
- mobile TypeScript, Expo dependency validation, Expo Doctor 20/20, Android
  export and iOS export. Expo SDK-compatible patch releases were applied to the
  isolated worktree lockfile after `expo install --check` identified them.

Exact-head Vercel, real `rezno_staging` deployment, two remote fixture runs and
the authenticated remote smoke are recorded only after the Draft PR preview is
available; this local evidence is not presented as that remote closure.

## Remaining Stage 3 scope

Gate 3D owns broad Commerce Admin operations and Stage 3 closure. Gate 3C does
not implement Admin overrides, moderation, reporting, gateways, refunds,
settlements, scheduler deployment, outbound delivery, managed media or Merchant
Mobile UI.

Physical-device QA is not part of this gate and is not claimed.
