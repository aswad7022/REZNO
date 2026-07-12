# REZNO Marketplace Milestone 2 — Customer MVP Decision Review

Review date: 2026-07-12

Branch reviewed: `feat/rezno-marketplace-customer-mvp`

Baseline commit: `2df2bd895bdd5891364afde59d22a2901ab469e2`

Status: owner decisions approved for the bounded Milestone 2A backend foundation

This document does not authorize or contain a Prisma schema change, migration, seed, API, application implementation, dependency change, or production data operation. The booking/service-discovery domain remains separate from commerce.

## 1. Executive summary

The recommended Customer MVP is a single-store, authenticated, cash-on-delivery/pay-at-pickup commerce flow owned by the existing `Organization` tenant. An organization may own zero or one `Store` in Milestone 2. `Store` is a separate commerce profile and does not depend on `BusinessProfile`, `Service`, `BranchService`, or `Booking`. A hybrid business owns both its existing booking records and a separate Store through the same Organization; a marketplace-only seller needs an Organization, an OrganizationMember owner, and a Store, but no bookable service.

Public commerce requires manual Store approval. Products can be drafted before approval and publish without per-product approval after the Store becomes active, subject to admin suspension. Every Product has at least one ProductVariant; simple products receive a default variant. Variant prices use Prisma `Decimal`, inventory is held in a one-row-per-variant inventory record, carts never reserve stock, and checkout reserves stock inside a serializable PostgreSQL transaction. Stock is consumed on merchant confirmation and restored or released on rejection, cancellation, or expiration.

The MVP cart is authenticated, server-side, and globally single-active per Person, with one Store per cart. Checkout accepts no authoritative price or total from the client. A buyer-scoped idempotency record, request hash, row locks, database checks, immutable order snapshots, and status history protect against duplicate orders, price tampering, and overselling.

Milestone 2 should support only `CASH_ON_DELIVERY` for Store delivery and `PAY_AT_PICKUP` for pickup. It should create one offline Payment record per Order but no PaymentAttempt or provider integration. Delivery uses Store fulfillment, a flat fee, one configured delivery city/area for MVP, and no Shipment or driver platform.

This review changes one earlier planning assumption: the existing implementation plan placed checkout/inventory in Milestone 3, while the requested “Marketplace Customer MVP” cannot be truthful without them. Owner approval is therefore required to consolidate the bounded offline checkout, reservation, and customer orders flow into Milestone 2. If that expansion is not approved, Milestone 2 must be renamed “Catalog and Cart Foundation” and must not expose checkout UI.

## 2. Repository findings

| Area | Actual repository finding | Consequence for Milestone 2 |
| --- | --- | --- |
| Identity | Better Auth `User` is the credential/session record; `Person.authUserId` is unique and `Person` is the product identity. Active/onboarded checks already exist. | Buyer ownership must use `Person.id`; authentication still comes from Better Auth. |
| Tenancy | `OrganizationMember` is unique per Person/Organization and points to an Organization-scoped `Role`. The active Organization cookie is accepted only after membership validation. | Seller queries must obtain the server-validated active membership, then constrain every row through `Store.organizationId`. |
| Roles | `Role` has `systemRole` but no permission list. OWNER/MANAGER are currently broad policy checks; `AdminAccess` already uses explicit string permissions. | Commerce needs explicit role permissions; membership or role name alone is insufficient. |
| Business profile | `Organization.profile` is optional and one-to-one. Business onboarding currently creates a profile, settings, branch, Owner role, and membership. | Store must not require BusinessProfile. Marketplace-only onboarding needs a later commerce path that does not fabricate a service branch. |
| Booking boundary | `Booking`, `Service`, `BranchService`, restaurant reservations, and their histories are mature and tenant-scoped. | Commerce must use Store/Product/Order names and modules; no reuse or conversion of booking tables. |
| Addresses | There is no customer address model. Branch has address/location fields only. | Add a Person-owned CustomerAddress and a separate immutable OrderAddress snapshot; do not reuse Branch. |
| Favorites | `CustomerFavoriteBusiness` and `CustomerFavoriteService` use concrete foreign keys and unique pairs. | Add separate Store and Product favorite tables; avoid polymorphic foreign keys. |
| Money | Existing persisted prices are `Decimal(10,2)`, but some older application paths convert Decimal to JavaScript `Number`. Currency is a free three-character string, commonly `IQD`. | Commerce uses Decimal end to end, serializes amounts as strings, and must not copy Number-based calculations. |
| Transactions | Booking/reservation mutations use Prisma interactive transactions with `Serializable` isolation, conditional `updateMany`, and status history. | Reuse this transaction discipline, adding ordered row locks and bounded serialization retries for inventory. |
| Admin | `AdminAccess.permissions` is explicit; environment super-admin is the bootstrap. `AdminAuditLog` records privileged events. | Add explicit commerce admin permissions and use AdminAuditLog for approvals, suspension, and moderation. |
| Notifications | Existing Notification supports Person and Organization audiences, but has no order relation, event type, read state, or dedupe key. Booking history is also used as notification input. | OrderStatusHistory is the canonical event ledger; extend in-app notifications with a deterministic dedupe key and optional order link. Push is deferred. |
| Mobile API | The only current mobile business-data route is public `GET /api/mobile/marketplace`. It validates manually, rate limits, caches briefly, and returns a JSON envelope. | Commerce routes use `/api/mobile/commerce/*` to avoid the service “marketplace” collision and follow the same envelope/error conventions. |
| Mobile authentication | A Better Auth Expo client backed by SecureStore exists, but the current generic mobile API fetch helper sends only `Accept` and is used for public data. | Authenticated commerce APIs require a verified Better Auth Expo credential/cookie transport before cart or order work. |
| Rate limiting | The limiter is process-local memory and trusts proxy-overwritten forwarding headers in production. Redis is present in Docker but not wired to limiting. | Current limiting is acceptable for local development only; checkout/cancel writes require identity-scoped limits and a shared production store before release. |
| Search | Service search normalizes Arabic/Kurdish/English text, then uses case-insensitive contains queries and in-process scoring. PostgreSQL has no checked-in trigram extension/index. | Reuse normalization in a separate commerce module; add bounded PostgreSQL trigram search if deployment permits the extension. |
| Media | Business/service media are validated URL strings. No upload, managed storage, ownership, or deletion service exists. | ProductMedia stores approved URL references only in MVP; upload/storage is a separate prerequisite or deferred feature. |
| Scheduling | No cron, worker, queue, or outbox runtime is configured. | Automatic pending-order expiration is a release blocker until an execution mechanism is selected. |
| Tests | No test script, checked-in test suite, or runner configuration exists. `tsx` and Node 24 are available. | Start with Node `node:test` through the existing `tsx` loader plus an isolated PostgreSQL integration database. |
| Migrations | Twenty linear migrations exist; constraints and custom SQL indexes are already used. | Add commerce in isolated forward migrations with explicit checks/indexes and no backfill into booking tables. |

The prior Marketplace documents remain the design baseline: [product specification](./product-spec.md), [architecture](./architecture.md), [implementation plan](./implementation-plan.md), [proposed data model](./data-model.md), and [Milestone 1 device QA](./milestone-1-device-qa.md).

## 3. Final recommended decisions

### A. Store ownership

- **Recommended option:** `Organization 1 — 0..1 Store` for Milestone 2. Store has a required, unique `organizationId`. Do not create StoreMember. Seller identity remains `User -> Person -> OrganizationMember -> Role`; ownership is `Store.organizationId -> Organization.id`.
- **Why it fits REZNO:** it reuses the proven active-Organization boundary, prevents another membership system, supports hybrid booking/commerce businesses, and keeps the first customer checkout single-tenant.
- **BusinessProfile relationship:** no Store foreign key to BusinessProfile. A UI may derive shared logo/contact defaults through Organization, but Store persists its own commerce name, description, policies, media, and fulfillment settings. BusinessProfile can change without silently changing an order or Store.
- **Hybrid business:** one Organization owns its booking BusinessProfile/services and its separate Store. No Service becomes a Product and no Booking becomes an Order.
- **Marketplace-only seller:** an Organization with an Owner OrganizationMember and Store; BusinessProfile, Branch, Service, and booking settings are not prerequisites. A dedicated seller onboarding path is deferred because merchant onboarding UI is out of Customer MVP.
- **Alternatives considered:** exactly one Store would force commerce onto every service business; multiple Stores per Organization would require store selection, store-scoped membership/permissions, split reporting, and more complex cart authorization now; Store under BusinessProfile would incorrectly couple commerce to bookings.
- **Risks:** the unique Organization/Store relation must later be relaxed for multiple brands/storefronts. A future migration can remove the unique constraint and add store assignment permissions without changing order snapshots.
- **Database implications:** Store.organizationId is unique and `onDelete: Restrict`; Organization receives an optional Store relation. Store carries one MVP pickup point and delivery configuration. No StoreMember model.
- **API implications:** seller operations always resolve the active Organization first; public Store lookup uses Store slug and public visibility rules.
- **Authorization implications:** both membership and an explicit commerce permission are required. `store.organizationId` must equal the active membership organizationId in the same query.
- **Milestone 2:** one Store per Organization, hybrid and commerce-only data support.
- **Deferred:** multiple Stores, StoreMember, multiple pickup branches/warehouses, and marketplace-only onboarding UI.

### B. Store creation and activation

- **Recommended option:** `DRAFT -> PENDING_REVIEW -> ACTIVE`, with exceptional `REJECTED`, `SUSPENDED`, and `ARCHIVED` states. Manual admin approval is mandatory for MVP.
- **Why it fits REZNO:** there is already explicit AdminAccess and audit logging, while no automated trust/KYC/risk system exists.
- **Creation rules:** an active Organization Owner/Manager with `store.manage` can create one draft. Products and variants may be created while Store is draft or pending, but remain private. Only `ACTIVE` plus non-null `publishedAt` is publicly searchable.
- **Suspension:** immediately removes the Store and its products from public reads, rejects cart mutations and checkout, and marks existing carts unavailable without deleting them. Historical orders remain readable. Existing nonterminal orders remain operable by authorized seller/admin unless an admin explicitly applies an order-operations freeze for fraud/safety.
- **Alternatives considered:** automatic activation is too risky; approval of every product is too operationally expensive; deleting suspended Stores destroys history.
- **Risks:** approval queues can block onboarding; suspension policy must distinguish “no new sales” from “freeze all fulfillment.”
- **Database implications:** StoreStatus enum, submitted/reviewed/published/suspended/archived timestamps, reviewer User IDs where applicable, and bounded reason fields.
- **API implications:** draft/save and submit are seller operations; approve/reject/suspend/reactivate are admin operations. All public queries use the complete visibility predicate.
- **Authorization implications:** submit requires `store.manage`; moderation requires `COMMERCE_STORES_REVIEW`; suspension/reactivation is audited.
- **Milestone 2:** model, service policy, minimum admin moderation path, and visibility behavior.
- **Deferred:** automated KYC, risk scoring, appeals, bulk moderation, and seller-facing lifecycle dashboard.

Allowed transitions:

| From | To | Actor | Required condition/reason |
| --- | --- | --- | --- |
| none | DRAFT | Organization Owner/Manager | active organization; `store.manage`; no existing Store |
| DRAFT | PENDING_REVIEW | Owner/Manager | required profile, fulfillment, contact, and currency fields complete |
| PENDING_REVIEW | DRAFT | submitting Organization | explicit withdrawal before review |
| PENDING_REVIEW | ACTIVE | Admin | `COMMERCE_STORES_REVIEW`; review note optional; audit required |
| PENDING_REVIEW | REJECTED | Admin | rejection reason required; audit required |
| REJECTED | DRAFT | Owner/Manager | remediation started; prior reason retained in audit |
| ACTIVE | SUSPENDED | Admin | suspension reason required; audit required |
| SUSPENDED | ACTIVE | Admin | reactivation note and audit required |
| DRAFT/REJECTED | ARCHIVED | Owner/Admin | reason; no public or order effect |
| ACTIVE/SUSPENDED | ARCHIVED | Admin or Owner with admin approval | no nonterminal orders; reason required |

No direct DRAFT/REJECTED to ACTIVE transition is allowed.

### C. Merchant roles and permissions

- **Recommended option:** add a typed `CommercePermission[]` field to existing Role. Do not extend `SystemRole` and do not create commerce membership tables. Existing system roles receive explicit default grants, not implicit access based only on role name.
- **Why it fits REZNO:** Role is already Organization-scoped and membership validation is proven. A typed array mirrors AdminAccess permissions while preventing arbitrary seller permission strings.
- **Alternatives considered:** SystemRole-only checks are too coarse; StoreMember duplicates tenancy; a role-permission join table adds management complexity without an MVP UI.
- **Risks:** permission arrays need careful backfill and every write must check them. Default-empty is fail-closed but can lock out existing owners if onboarding/backfill is missed.
- **Database implications:** CommercePermission enum array on Role, default empty. Backfill existing system OWNER roles with in-scope permissions; newly created Owner roles receive them in onboarding. Existing MANAGER/RECEPTIONIST/STAFF remain fail-closed until an Owner grants a reviewed set.
- **API implications:** central `requireCommercePermission(permission)` returns active membership and Store, and every query repeats Organization ownership constraints.
- **Authorization implications:** see section 10. Cross-Store access is prevented by the unique Store organization ownership path, active membership, and compound query filters. Inventory adjustment, rejection/cancellation, approval/suspension, and payment marking require immutable history/audit.
- **Milestone 2:** permissions required by Customer MVP and minimum order operations.
- **Deferred:** reports, refunds, payouts, custom-role management UI, and store-level member assignments.

MVP permission set:

`store.view`, `store.manage`, `product.view`, `product.create`, `product.update`, `product.archive`, `inventory.view`, `inventory.adjust`, `order.view`, `order.manage`, and `order.cancel`.

`order.refund` and `reports.view` are reserved but not granted or implemented in Milestone 2.

Recommended grant template (only OWNER is backfilled/defaulted automatically; the other columns describe the maximum reviewed MVP template an Owner may explicitly grant):

| Permission | OWNER | MANAGER template | RECEPTIONIST template | STAFF template |
| --- | --- | --- | --- | --- |
| `store.view` | Yes | Yes | Yes | Yes |
| `store.manage` | Yes | Yes | No | No |
| `product.view` | Yes | Yes | Yes | Yes |
| `product.create` | Yes | Yes | No | No |
| `product.update` | Yes | Yes | No | No |
| `product.archive` | Yes | Yes | No | No |
| `inventory.view` | Yes | Yes | Yes | No |
| `inventory.adjust` | Yes | Yes | No | No |
| `order.view` | Yes | Yes | Yes | No |
| `order.manage` | Yes | Yes | Yes | No |
| `order.cancel` | Yes | Yes | No | No |
| `order.refund` / `reports.view` | Not implemented | Not implemented | Not implemented | Not implemented |

Recommended admin permission set is `COMMERCE_STORES_VIEW`, `COMMERCE_STORES_REVIEW`, `COMMERCE_CATALOG_VIEW`, `COMMERCE_CATALOG_MODERATE`, `COMMERCE_INVENTORY_VIEW`, `COMMERCE_INVENTORY_MANAGE`, `COMMERCE_ORDERS_VIEW`, and `COMMERCE_ORDERS_MANAGE`. Database admins receive none automatically; existing environment/database super-admin behavior continues to expand to the reviewed full list.

### D. Product and variant model

- **Recommended option:** every Product must have at least one ProductVariant. A simple product receives one default variant with `optionKey="default"`, title `Default`, and empty option JSON. Price and inventory exist only on ProductVariant/InventoryItem.
- **Why it fits REZNO:** one purchasable abstraction avoids nullable product-level price/stock and lets simple products evolve into variants without rewriting orders.
- **Options:** store a bounded JSON object on each variant plus a canonical, server-generated `optionKey`. Support at most three option names and a bounded number of variants. No arbitrary option-definition/combination engine in MVP.
- **Categories:** add a flat, commerce-only MarketplaceCategory. One category per Product. Hierarchy is deferred.
- **Statuses:** Product `DRAFT`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`; Variant `ACTIVE`, `INACTIVE`, `ARCHIVED`. `publishedAt` separates readiness from publication. Admin may suspend a product; sellers cannot set SUSPENDED.
- **Approval:** no per-product approval under an approved Store. Authorized merchants publish valid products; admins can suspend/unpublish with a reason.
- **Alternatives considered:** product-level prices create two sources of truth; a full option schema and category tree overbuild the MVP; per-product approval creates avoidable operational load.
- **Risks:** JSON options require canonicalization and validation; application code must enforce at least one active variant before publication.
- **Database implications:** Product has Store/category ownership, publication/moderation fields, and soft archive. ProductVariant carries Store ID as part of a compound Product ownership relation so `(storeId, sku)` and tenant queries are enforceable. `compareAtPrice` is nullable and must be greater than price.
- **API implications:** reads return product plus active variants/media; writes reject duplicate canonical option keys/SKUs and invalid currency/price.
- **Authorization implications:** product writes require the corresponding permission and Store ownership; public reads use Store/Product/Variant visibility predicates.
- **Milestone 2:** flat category, products, variants, media URL references, publication, and moderation.
- **Deferred:** category hierarchy, bundles, digital products, subscriptions, customizations, bulk import, and variant matrix generator.

Archived products are never public or addable, but their nullable relational IDs and immutable OrderItem snapshots preserve old orders.

### E. Inventory and overselling prevention

- **Recommended option:** carts do not reserve. Checkout creates an Order and ACTIVE InventoryReservations atomically. Merchant confirmation consumes the reservations; rejection, pending cancellation, or expiration releases them. A StockMovement ledger records every reserve, release, sale, restock, and adjustment.
- **Why it fits REZNO:** it avoids abandoned carts blocking stock, supports COD/pay-at-pickup, and extends the repository's serializable transaction pattern.
- **Concurrency:** lock InventoryItem rows in sorted variant-ID order with `SELECT ... FOR UPDATE` inside a Prisma `Serializable` transaction. Check `onHand - reserved >= requested`; update and write movements before commit. Retry serialization/deadlock errors a small bounded number of times.
- **Database safeguards:** CHECK constraints enforce `onHand >= 0`, `reserved >= 0`, and `reserved <= onHand`; quantities are integers. Reservation and movement idempotency keys are unique.
- **COD:** the order is created immediately as PENDING with an owner-approved 15-minute stock hold. A scheduler must expire unconfirmed orders; no scheduler exists today, so this is a release gate.
- **Alternatives considered:** cart reservation causes hoarding; decrementing only after payment/confirmation oversells; simple decrement without reservations cannot safely support pending COD; reservations without a ledger weaken audit/reconciliation.
- **Risks:** missing expiration execution leaks reserved stock; incorrect retry logic can duplicate movements; long holds reduce availability.
- **Database/API/authorization implications:** InventoryItem, InventoryReservation, StockMovement, transactional services, idempotent transition APIs, `inventory.adjust` for manual changes, and actor/reason recording.
- **Milestone 2:** reservations, ledger, expiry service, and concurrency tests.
- **Deferred:** warehouse/location inventory, backorders, purchase orders, returns, and inventory forecasting.

The exact algorithms are in section 8.

### F. Cart model

- **Recommended option:** one authenticated, server-side active Cart per Person globally, containing variants from exactly one Store. No anonymous or device-only cart.
- **Why it fits REZNO:** Person identity and Better Auth already exist, and the product decision forbids multi-Store checkout. One global cart gives a predictable mobile experience.
- **Store switching:** adding a variant from another Store returns `CART_STORE_CONFLICT`. The client must explicitly confirm replacement; a transactional replace operation expires/clears the old cart and creates/reuses the new Store cart. Never silently delete items.
- **Price staleness:** CartItem stores `unitPriceAtAdd` only to identify change; it is not authoritative. Cart reads return current price/availability and change flags. Checkout rejects with `PRICE_CHANGED` until the buyer reviews the refreshed cart.
- **Unavailable variants:** cart reads retain the row but mark it unavailable; checkout refuses it. Duplicate variant adds atomically merge quantity, bounded to 1–99.
- **Lifetime:** expire an active cart after 30 days without mutation. Retain expired/checked-out cart metadata for 90 days for support, then purge under the privacy policy.
- **Alternatives considered:** one cart per Store hides multiple abandoned carts and complicates Activity; device-only carts cannot enforce identity/store isolation; anonymous carts expand auth/merge/privacy scope.
- **Risks:** PostgreSQL partial uniqueness is not expressible directly in Prisma schema syntax and needs reviewed migration SQL.
- **Database implications:** Cart includes buyerPersonId, storeId, status, currency, version, expiresAt; CartItem is unique by cart/variant. Add a partial unique index for one ACTIVE cart per Person.
- **API implications:** authenticated read/add/update/remove/replace operations, optimistic `cartVersion`, bounded quantities, no client totals.
- **Authorization implications:** every query includes `buyerPersonId = current Person.id`; Store/variant ownership and visibility are revalidated.
- **Milestone 2:** persisted cart and explicit Store replacement.
- **Deferred:** guest cart, multi-Store cart, cart sharing, wish-to-cart automation, and cross-device merge conflicts beyond server authority.

### G. Checkout and idempotency

- **Recommended option:** a single trusted checkout endpoint with a buyer-scoped idempotency record and one serializable transaction.
- **Client input:** cart ID/version, fulfillment method, saved address ID for delivery, optional bounded delivery instructions, and an `Idempotency-Key` UUID generated once per checkout intent. The client does not send price, fee, discount, tax, currency, inventory availability, Store name, or totals as authoritative values.
- **Server authority:** session/Person, cart ownership, Store status, product publication, variant state, prices, Store currency, fulfillment availability, minimum order, delivery fee, address ownership, inventory, snapshots, order number, and all totals.
- **Key semantics:** unique `(buyerPersonId, key)` with a canonical request hash. Same key/hash returns the original result; same key/different hash is `409 IDEMPOTENCY_KEY_REUSED`; another user has a distinct scope and cannot retrieve the result.
- **Changes during checkout:** price change returns `409 PRICE_CHANGED` with a refreshed cart; insufficient stock returns `409 INVENTORY_CHANGED`; suspended/closed Store returns `409 STORE_UNAVAILABLE`. No partial Order persists.
- **Alternatives considered:** Order-only unique keys cannot safely describe in-progress/conflicting requests; client-generated order numbers leak trust; accepting changed prices silently is poor consent.
- **Risks:** request canonicalization must be stable; concurrent retries and serialization failures need explicit tests.
- **Database/API/authorization implications:** CheckoutIdempotency, immutable snapshots, unique public Order number, authenticated endpoint, rate limiting, and transaction retry policy.
- **Milestone 2:** offline checkout, idempotency, order creation, and duplicate-response replay.
- **Deferred:** payment provider intents, multi-Store checkout groups, promotions, taxes, and fraud scoring.

The trusted flow is in section 9.

### H. Payment method for MVP

- **Recommended option:** `CASH_ON_DELIVERY` for delivery and `PAY_AT_PICKUP` for pickup only. Create one Payment row per Order with `UNPAID`, `PAID`, or `VOIDED` status. Do not create PaymentAttempt until a real provider is selected.
- **Why it fits REZNO:** it creates a truthful payable Order without simulating electronic authorization or storing financial credentials.
- **Status separation:** Order represents commercial acceptance, FulfillmentStatus represents physical progress, and PaymentStatus represents money receipt. COD/pay-at-pickup Orders are created immediately but remain UNPAID until authorized merchant completion.
- **Failed/abandoned attempts:** none exist because there is no provider attempt. Rejected/cancelled/expired offline Orders set Payment to VOIDED.
- **Alternatives considered:** manual transfer creates unverifiable proof workflows; provider-neutral PaymentAttempt without a provider suggests functionality that does not exist; multiple methods increase policy/UI complexity.
- **Risks:** merchant marking payment received is a privileged, auditable action and is not bank reconciliation.
- **Database implications:** Payment is one-to-one with Order and stores method, status, amount, currency, paidAt, and actor. No provider secrets or card/bank data.
- **API implications:** checkout selects only a method valid for the fulfillment choice; merchant completion marks payment and fulfillment atomically.
- **Authorization implications:** customer cannot set payment state. `order.manage` and Store ownership are required; admin override requires explicit permission and audit.
- **Milestone 2:** offline Payment record/status.
- **Deferred:** online providers, PaymentAttempt, authorization/capture, webhooks, tokenization, transfer receipts, refunds, and chargebacks.

### I. Fulfillment and delivery

- **Recommended option:** Store delivery and customer pickup, represented on Order fields plus a separate FulfillmentStatus. Do not create Shipment or a driver model.
- **Store configuration:** `deliveryEnabled`, `pickupEnabled`, flat `deliveryFee`, `minimumOrderAmount`, preparation estimate, delivery estimate, pickup instructions, pickup address/contact, and one normalized delivery city/area for MVP. At least one method is required before Store submission.
- **Delivery checkout:** the saved address must match the Store's configured delivery city/area. OrderAddress snapshots recipient and delivery data. Pickup snapshots Store pickup instructions/address; customer delivery address is not exposed unnecessarily.
- **Estimates:** store-configured ranges are estimates, not promises; snapshot them on Order.
- **Alternatives considered:** Shipment suggests a carrier/tracking integration that does not exist; unrestricted delivery geography risks accepting unfulfillable orders; multiple zone tables overbuild the first Store model.
- **Risks:** one delivery area may be commercially limiting; text/city matching needs normalized values and owner policy.
- **Database implications:** Store fulfillment fields and Order fulfillment/estimate snapshots. No Fulfillment or Shipment table in MVP.
- **API implications:** Store/product responses expose methods/fees/minimum/estimates; checkout validates method and address.
- **Authorization implications:** only Store order operators can advance fulfillment; buyers can only read their Orders.
- **Milestone 2:** one pickup point and one flat-fee delivery area per Store.
- **Deferred:** zones, distance pricing, multiple branches, courier assignment, labels, tracking, partial fulfillment, and driver application.

### J. Order model and state machine

- **Recommended option:** separate three dimensions:
  - OrderStatus: `PENDING`, `CONFIRMED`, `COMPLETED`, `REJECTED`, `CANCELLED`, `EXPIRED`.
  - FulfillmentStatus: `UNFULFILLED`, `PREPARING`, `READY_FOR_PICKUP`, `OUT_FOR_DELIVERY`, `DELIVERED`, `PICKED_UP`, `DELIVERY_FAILED`, `CANCELLED`.
  - PaymentStatus: `UNPAID`, `PAID`, `VOIDED`.
- **Why it fits REZNO:** it avoids an ambiguous single enum mixing commercial acceptance, logistics, and payment.
- **Deferred states:** `RETURN_REQUESTED`, `RETURNED`, and `REFUNDED` are excluded until returns/refunds exist. `Shipment` statuses are excluded.
- **History:** every accepted transition writes immutable OrderStatusHistory in the same transaction, including actor type/ID, changed dimensions, reason, and metadata. Repeated transition requests are idempotent.
- **Alternatives considered:** the previously proposed all-in-one lifecycle cannot represent COD payment or pickup/delivery cleanly; event sourcing is unnecessary for MVP.
- **Risks:** APIs must validate cross-dimension invariants, not only enum transitions.
- **Database/API/authorization implications:** see sections 7 and 10.
- **Milestone 2:** pending through completed/cancelled/rejected/expired and the two fulfillment paths.
- **Deferred:** return, refund, partial item cancellation, partial fulfillment, and disputes.

### K. Order snapshots and historical integrity

- **Recommended option:** keep relational IDs for navigation/audit but copy every customer-visible and financial fact required to understand the sale.
- **Order snapshots:** Store name, slug, phone/contact, logo URL where shown, customer/recipient name, normalized phone, fulfillment method, pickup instructions/address or OrderAddress, preparation/delivery estimates, currency, subtotal, discount total, tax total, delivery fee, and grand total.
- **OrderItem snapshots:** Product name/slug, Variant title, canonical option values, SKU, unit price, quantity, discount total, line total, currency, and primary image URL.
- **Relations:** required Order-to-Person/Store relations use restrict/soft-deletion policies. Product/Variant relations on OrderItem are nullable and may use SetNull only for exceptional hard deletion; catalog records are normally archived, not deleted.
- **Immutability:** snapshots and totals never update when Store, Product, Variant, price, media, address, or Person profile changes.
- **Alternatives considered:** resolving current catalog data corrupts history; snapshot-only records lose useful internal traceability.
- **Risks:** snapshot omissions cannot be recovered after catalog change, so contract tests must cover every field.
- **Database/API/authorization implications:** immutable columns, no update DTO for snapshots, private PII projection, and order-detail authorization.
- **Milestone 2:** complete order/item/address/store/customer snapshots.
- **Deferred:** invoice/legal document snapshots until fiscal requirements are approved.

### L. Money, taxes, discounts, and currency

- **Recommended option:** Prisma `Decimal(18,3)` for commerce amounts, serialized as decimal strings and calculated with Decimal operations only. Do not use JavaScript floating point or copy the existing Number conversions.
- **Currency:** one immutable Store currency for all active variants and Orders. Recommended launch allowlist is `IQD` only; owner approval is required. Store currency cannot change after its first Order without a new migration/business process.
- **Rounding:** validate scale against a server-side currency exponent table and round half-up only at explicit calculation boundaries. For IQD, persist up to three decimal places even if the launch UI elects to display whole dinars.
- **Validation:** price > 0; compare-at price null or > price; delivery fee/minimum >= 0; bounded maximums; currency uppercase ISO 4217 from the allowlist.
- **Totals:** subtotal is the sum of line unit price × quantity; discountTotal = 0; taxTotal = 0; grandTotal = subtotal + deliveryFee. Compare-at price is merchandising information, not a cart discount.
- **Alternatives considered:** integer minor units are robust but conflict with the reviewed Decimal direction and require exponent conversion throughout the existing stack; Decimal(10,2) does not represent all ISO currency exponents.
- **Risks:** currency display rules and Iraq fiscal requirements need product/legal approval.
- **Database/API/authorization implications:** Decimal fields, Store currency invariant, string JSON contract, no client totals.
- **Milestone 2:** prices, compare-at price, fee, subtotal, zero-valued future-compatible discount/tax fields, total.
- **Deferred:** taxes, coupons, promotions, store credits, commissions, payouts, refunds, and currency conversion.

### M. Addresses and customer identity

- **Recommended option:** create Person-owned CustomerAddress; require an active, onboarded Person for cart and checkout; no guest checkout. Create an immutable OrderAddress for delivery.
- **Fields:** label, recipient name, E.164 phone, country code, governorate/region, city, address lines, landmark, delivery instructions, optional postal code, and optional validated coordinates. One default address per Person is enforced transactionally/with a partial unique index.
- **Scope:** customer CRUD always includes current Person ID. Seller reads only snapshots for its own delivery Orders and only fields required to fulfill. Admin reads require explicit order permission.
- **Account closure:** saved addresses can be deleted/anonymized; Orders and required snapshots remain under a documented retention/legal policy. Person is soft-disabled; hard deletion is restricted while Orders require retention.
- **Alternatives considered:** Branch is seller-owned and cannot represent customer data; guest checkout expands identity, merge, abuse, and privacy scope.
- **Risks:** retention period and lawful basis are owner/legal decisions; logs and analytics must not capture address/phone bodies.
- **Database/API/authorization implications:** CustomerAddress and OrderAddress, PII-safe selects/logging, ownership checks, and explicit deletion policy.
- **Milestone 2:** authenticated saved addresses and checkout snapshot.
- **Deferred:** guest addresses, address verification provider, address book sharing, and precise geofenced delivery.

### N. Marketplace search

- **Recommended option:** PostgreSQL only. Persist normalized search text for Store/Product using the existing Arabic normalization rules in a commerce-specific module, query with bounded `ILIKE`, and add `pg_trgm` GIN indexes if the production database permits `CREATE EXTENSION pg_trgm`.
- **Why it fits REZNO:** it reuses PostgreSQL and current normalization, avoids an external service, and supports Arabic substring matching better than the default English-oriented full-text configuration.
- **Indexes/pagination:** trigram GIN on normalized Store/Product search text; B-tree composites for visibility/category/createdAt/ID and Store ownership. Cursor pagination uses a deterministic `(sortValue, id)` cursor, never unbounded offset.
- **Sorting/filters:** relevance/newest/price, flat category, Store, price range, fulfillment method, and optional in-stock-only. Default limit 20, maximum 50.
- **Visibility:** Store ACTIVE/published/not archived, Product ACTIVE/published/not archived, active variant, and valid price. Suspended Stores/Products are excluded immediately. Out-of-stock Products may remain visible with `inStock=false` but cannot be added; feeds may offer `inStockOnly`.
- **Alternatives considered:** external search is premature; plain full-text lacks good Arabic behavior without custom configuration; unindexed contains queries will not scale.
- **Risks:** pg_trgm privilege/availability and relevance quality require staging verification. Fallback is bounded prefix/contains queries with strict limits and monitoring.
- **Database/API/authorization implications:** normalized columns maintained by write services, indexes, public visibility helper, bounded query validation, IP rate limits.
- **Milestone 2:** safe Store/Product search and category filters.
- **Deferred:** external engine, typo dictionaries, transliteration, semantic search, personalization, sponsored ranking, and AI recommendations.

### O. Favorites

- **Recommended option:** separate `CustomerFavoriteStore` and `CustomerFavoriteProduct` tables. Preserve existing CustomerFavoriteBusiness/Service unchanged.
- **Why it fits REZNO:** concrete foreign keys, unique constraints, and cascade behavior follow existing patterns and remain safe in Prisma/PostgreSQL.
- **Alternatives considered:** polymorphic target tables cannot enforce target foreign keys; one typed table creates nullable multi-target columns and weaker integrity.
- **Risks:** UI terminology must keep service businesses and commerce Stores distinct.
- **Database implications:** unique `(customerId, storeId)` and `(customerId, productId)`, customer-createdAt indexes, cascade on customer, and catalog archive visibility handling.
- **API implications:** idempotent PUT/DELETE and cursor list endpoints. Archived/suspended targets are omitted or returned as unavailable, never made public through favorites.
- **Authorization implications:** authenticated current Person only.
- **Milestone 2:** Store and Product favorites.
- **Deferred:** collections, sharing, alerts, and cross-domain unified favorite storage.

### P. Admin approval and moderation

- **Recommended option:** mandatory Store approval; no routine Product approval. Products may publish under an ACTIVE Store, while admins can suspend a Product or Store with a required reason.
- **Fields:** Store submission/review/rejection/suspension timestamps, reviewer IDs and bounded reasons; Product suspension timestamp/reason/admin ID. AdminAuditLog records submit review outcomes, suspension/reactivation, and forced order actions.
- **Minimum capability:** `COMMERCE_STORES_REVIEW`, `COMMERCE_CATALOG_MODERATE`, `COMMERCE_ORDERS_VIEW`, and `COMMERCE_ORDERS_MANAGE`. Super-admin inherits through the existing permission list; database admins require explicit grants.
- **Alternatives considered:** approving every Product is high overhead; automatic Store approval is unsafe without identity/risk systems.
- **Risks:** Customer MVP cannot expose Stores until a minimum admin moderation path exists, even though broader admin tooling is deferred.
- **Database/API/authorization implications:** lifecycle fields, admin permission constants/services, AdminAuditLog, and public visibility predicates.
- **Milestone 2:** minimal Store review and Store/Product suspension operations needed for safe publication.
- **Deferred:** moderation queues, bulk actions, appeals, automated policy scanning, and full merchant/admin dashboards.

### Q. Notifications

- **Recommended option:** use existing in-app Notification plus OrderStatusHistory as the canonical commerce event record. Add an optional unique `dedupeKey`, commerce event kind, and Order relation/reference. No push in MVP.
- **Customer events:** Order created, confirmed, rejected, cancelled/expired, preparing, ready for pickup, out for delivery, delivered, and picked up.
- **Merchant events:** new Order and customer cancellation. Low-stock notifications are deferred with merchant inventory tooling.
- **Idempotency:** create notifications in the same transaction as the status event using a deterministic key such as `order:{orderId}:{historyId}:{audience}`. A duplicate transition or retry cannot create a second notification.
- **Alternatives considered:** a new event bus/outbox is not justified for in-app-only delivery; creating notifications without dedupe repeats on retries.
- **Risks:** current Notification has no read state or distributed delivery. It must not become the source of truth for Order status.
- **Database/API/authorization implications:** small Notification extension and recipient/Store scoping. Customer notifications select current Person; merchant notifications select active Organization.
- **Milestone 2:** transactional in-app events required to understand the customer Order.
- **Deferred:** APNs/FCM, email/SMS, preferences, retries, delivery receipts, low-stock alerts, and full outbox infrastructure.

## 4. Decision matrix

| Decision | Final recommendation | Milestone 2 | Deferred | Primary risk/control |
| --- | --- | --- | --- | --- |
| Store ownership | Organization owns zero/one Store | Yes | Multiple Stores/StoreMember | unique organizationId; future constraint removal |
| Store activation | Manual admin review | Yes | KYC automation/appeals | fail-closed public predicate + audit |
| Seller auth | Existing OrganizationMember + typed Role permissions | Yes | role-management UI | active Organization + permission + ownership query |
| Catalog | Product always has Variant; flat category | Yes | hierarchy/option engine | publish invariant + bounded JSON |
| Inventory | reservation + movement ledger | Yes | warehouses/backorders | row locks, checks, idempotency |
| Cart | one server Cart/Person, one Store | Yes | guest/multi-Store | partial unique index + buyer scoping |
| Checkout | serializable, buyer-scoped idempotency | Yes, if owner approves scope consolidation | provider checkout | server totals + request hash |
| Payment | COD/pay at pickup | Yes | online/manual transfer/refunds | truthful offline status only |
| Fulfillment | Store delivery/pickup, no Shipment | Yes | carrier/driver/tracking | configured area/method validation |
| Order state | separate order/fulfillment/payment status | Yes | returns/refunds/partial flows | transition policy + history |
| Snapshots | immutable Order/Item/Address snapshots | Yes | invoice document | contract tests + no update path |
| Money | Decimal(18,3), Store currency | Yes | tax/coupons/FX | decimal-only calculation |
| Customer | authenticated Person + saved address | Yes | guest checkout | Person scope + PII projections |
| Search | PostgreSQL normalized text + trigram | Yes | external/AI search | bounded queries + indexes |
| Favorites | separate Store/Product favorites | Yes | collections | concrete FKs and unique pairs |
| Moderation | Store approve, Product suspend | Yes | full moderation dashboard | explicit admin permissions/audit |
| Notifications | existing in-app + dedupe | Yes | push/email/SMS | history is source of truth |
| Expiration | 15-minute pending hold + scheduler | Yes; release gate | configurable SLA | idempotent expiry job |

## 5. Proposed Prisma design

This is a design description, not Prisma code. All IDs follow the repository's UUID and `Timestamptz(6)` conventions. Monetary fields use `Decimal(18,3)`.

| Model/change | Purpose and important fields | Relations, constraints, indexes | Archive/deletion and ownership |
| --- | --- | --- | --- |
| `Role` change | `commercePermissions CommercePermission[] @default([])` | Existing Organization relation; backfill system OWNER only | Existing role deletion rules unchanged; fail closed |
| `Store` | Commerce profile; organizationId, name, slug, description, contact/media URLs, StoreStatus, defaultCurrency, fulfillment flags/fees/minimum/estimates/address/area, lifecycle timestamps/reasons/reviewer IDs | unique organizationId; unique slug; indexes `(status,publishedAt)`, `(organizationId,status)` | archive, never delete after Order; Organization ownership; `onDelete: Restrict` |
| `MarketplaceCategory` | Flat commerce category; name, normalizedName, slug, status, sortOrder | unique slug; indexes `(status,sortOrder)` and normalized search | archive when referenced; admin-managed |
| `Product` | Store-owned merchandising; storeId, categoryId, name/slug/description, normalizedSearchText, ProductStatus, publishedAt, moderation fields | unique `(storeId,slug)` and `(id,storeId)`; indexes visibility/category/newest/search | soft archive; Store owner; no cascade from Store after Orders |
| `ProductVariant` | Purchasable unit; productId, storeId, title, optionValues JSON, canonical optionKey, sku, price, compareAtPrice, VariantStatus | compound Product relation `(productId,storeId)`; unique `(storeId,sku)`, `(productId,optionKey)`; indexes `(productId,status)`, `(storeId,status)` | archive; normally never hard delete after OrderItem |
| `ProductMedia` | Ordered URL references; productId, optional variantId, url, altText, sortOrder, media type | unique `(productId,sortOrder)`; index variantId | cascade only before historical use; snapshots retain image URL |
| `InventoryItem` | One stock row per Variant; variantId, onHand, reserved, version | unique variantId; CHECK nonnegative and reserved <= onHand; Store reachable through Variant | restrict deletion; Store-owned through Variant |
| `InventoryReservation` | Finite Order hold; inventoryItemId, orderId/orderItemId, quantity, status, expiresAt, consumed/released timestamps, idempotencyKey | unique orderItemId; unique idempotencyKey; indexes `(status,expiresAt)`, orderId | immutable terminal rows retained with Order |
| `StockMovement` | Audit/reconciliation ledger; inventoryItemId, orderId, kind, onHandDelta, reservedDelta, resulting values/version, reason, actor Person/Admin, idempotencyKey, createdAt | unique idempotencyKey; indexes inventory/time and order/time | append-only; no cascade from catalog/order |
| `CustomerAddress` | Person-owned reusable address; recipient/contact/address/landmark/instructions/coordinates, isDefault, timestamps | index `(customerId,updatedAt)`; partial unique default per Person | customer can soft-delete; hard purge under retention policy |
| `Cart` | One active buyer cart; buyerPersonId, storeId, status, currency, version, expiresAt, timestamps | partial unique buyer where ACTIVE; indexes `(buyerPersonId,status)`, `(status,expiresAt)` | expire/retain 90 days; buyer-owned |
| `CartItem` | Variant/quantity and observed price; cartId, variantId, quantity, unitPriceAtAdd | unique `(cartId,variantId)`; index variantId | cascade with Cart; never order evidence |
| `CheckoutIdempotency` | Retry/replay boundary; buyerPersonId, key, requestHash, status, orderId, response metadata, expiresAt | unique `(buyerPersonId,key)`; index `(status,createdAt)` | retain at least through support/order retention window; buyer-scoped |
| `Order` | Commercial record; number, buyerPersonId, storeId, three statuses, fulfillment/payment method, currency/totals, Store/customer/fulfillment snapshots, acceptance expiry, cancellation/rejection data, timestamps | unique number; indexes buyer/time, Store/status/time, status/expiry; `onDelete: Restrict` for buyer/Store | never cascade-delete; immutable facts; scoped to buyer or Store owner |
| `OrderItem` | Immutable sold-line snapshot plus nullable Product/Variant refs | index orderId; indexes nullable product/variant IDs; positive quantity checks | cascade only with legally deleted Order; catalog refs SetNull/restrict |
| `OrderAddress` | Immutable delivery snapshot, one per delivery Order | unique orderId | retained with Order; no relation to mutable CustomerAddress required |
| `OrderStatusHistory` | Immutable changes across order, fulfillment, payment; actor type/IDs, from/to fields, reason, metadata, idempotencyKey | unique idempotencyKey; index `(orderId,createdAt)` | append-only and retained with Order |
| `Payment` | Truthful offline obligation; orderId, method, status, amount, currency, paidAt, actor IDs | unique orderId; indexes `(status,createdAt)` | retained with Order; no provider fields in MVP |
| `CustomerFavoriteStore` | Commerce Store favorite | unique `(customerId,storeId)`; customer/time and store indexes | cascade with customer/Store only when safe; hidden target stays private |
| `CustomerFavoriteProduct` | Commerce Product favorite | unique `(customerId,productId)`; customer/time and product indexes | cascade with customer/Product only when safe; archived target unavailable |
| `Notification` change | Link/dedupe commerce in-app events; optional orderId, eventKind, dedupeKey | unique nullable dedupeKey; indexes orderId and recipient/time | existing ownership rules; not Order source of truth |

Enums justified for MVP:

- `CommercePermission`
- `StoreStatus`
- `MarketplaceCategoryStatus`
- `ProductStatus`
- `ProductVariantStatus`
- `InventoryReservationStatus`
- `StockMovementKind`
- `CartStatus`
- `CheckoutIdempotencyStatus`
- `OrderStatus`
- `OrderFulfillmentMethod`
- `FulfillmentStatus`
- `PaymentMethod`
- `PaymentStatus`
- `OrderActorType`

Models explicitly not justified now: StoreMember, ProductOption/ProductOptionValue, PaymentAttempt, Shipment, driver/courier, tax, coupon, commission, payout, return, refund, review, recommendation, and analytics models.

## 6. Proposed API design

All new mobile routes use `/api/mobile/commerce/*`, Zod schemas, `{data: ...}` success envelopes, typed `{error:{code,message,details?}}` errors, bounded inputs, `no-store` for private data, and decimal strings. Authenticated requests must use the Better Auth Expo transport rather than the existing public-only fetch helper.

| Method and route | Auth/authorization | Validation and response purpose | Pagination/idempotency/rate limit |
| --- | --- | --- | --- |
| `GET /api/mobile/commerce/home` | Public | ACTIVE Stores, active categories, new Products; no fixtures | cursor sections; IP 120/min; short public cache |
| `GET /api/mobile/commerce/search` | Public | q <=100, category/store, price bounds, fulfillment, stock, sort; public visibility only | cursor; limit 1–50; IP 120/min |
| `GET /api/mobile/commerce/categories` | Public | active flat category list | optional cursor; IP 120/min; cache |
| `GET /api/mobile/commerce/stores/{storeSlug}` | Public | Store details, methods/fees, public product summary | product cursor; IP 120/min; cache |
| `GET /api/mobile/commerce/stores/{storeSlug}/products/{productSlug}` | Public | Product, active variants, media, availability | no idempotency; IP 120/min; short cache |
| `GET /api/mobile/commerce/cart` | Active onboarded Person | current buyer Cart with current prices/change/availability flags | no pagination; user 120/min; no-store |
| `POST /api/mobile/commerce/cart/items` | Active onboarded Person | variant UUID, quantity 1–99, optional explicit replaceStore confirmation; merge duplicate | client mutation key recommended; user 30/min |
| `PATCH /api/mobile/commerce/cart/items/{itemId}` | Cart owner | quantity 1–99 and cartVersion; return refreshed Cart | optimistic version; user 30/min |
| `DELETE /api/mobile/commerce/cart/items/{itemId}` | Cart owner | item UUID and cartVersion | idempotent delete; user 30/min |
| `DELETE /api/mobile/commerce/cart` | Cart owner | explicit clear; return empty state | idempotent; user 10/min |
| `GET /api/mobile/commerce/addresses` | Active onboarded Person | own saved addresses only | cursor optional; user 120/min |
| `POST /api/mobile/commerce/addresses` | Active onboarded Person | bounded recipient/E.164/address fields | mutation key recommended; user 10/min |
| `PATCH /api/mobile/commerce/addresses/{id}` | Address owner | same schema + version/updatedAt conflict check | user 10/min |
| `DELETE /api/mobile/commerce/addresses/{id}` | Address owner | soft delete; cannot affect OrderAddress | idempotent; user 10/min |
| `POST /api/mobile/commerce/checkout` | Active onboarded Person and Cart owner | cartId/version, fulfillment method, owned address ID/instructions; returns Order | required `Idempotency-Key`; user 5/min + shared production limiter |
| `GET /api/mobile/commerce/orders` | Active onboarded Person | own Orders only; filters bounded | cursor `(createdAt,id)`; limit <=50; user 120/min |
| `GET /api/mobile/commerce/orders/{orderNumber}` | Order buyer | private Order/items/history/snapshots | no pagination; user 120/min |
| `POST /api/mobile/commerce/orders/{orderNumber}/cancel` | Order buyer; PENDING only | bounded reason; atomic release | required idempotency key; user 10/min |
| `GET /api/mobile/commerce/favorites/stores` | Active onboarded Person | visible/unavailable own Store favorites | cursor; user 120/min |
| `PUT /api/mobile/commerce/favorites/stores/{storeId}` | Active onboarded Person | target UUID and visibility existence | idempotent; user 60/min |
| `DELETE /api/mobile/commerce/favorites/stores/{storeId}` | Active onboarded Person | own favorite only | idempotent; user 60/min |
| `GET /api/mobile/commerce/favorites/products` | Active onboarded Person | visible/unavailable own Product favorites | cursor; user 120/min |
| `PUT /api/mobile/commerce/favorites/products/{productId}` | Active onboarded Person | target UUID and visibility existence | idempotent; user 60/min |
| `DELETE /api/mobile/commerce/favorites/products/{productId}` | Active onboarded Person | own favorite only | idempotent; user 60/min |

Minimum non-customer operations required to keep Customer MVP orders operable, even though merchant management UI is deferred:

| Operation | Recommended surface | Authorization |
| --- | --- | --- |
| Store draft/submit | server service/action or tightly scoped route | active Organization + `store.manage` |
| Store approve/reject/suspend/reactivate | admin server action/route | explicit admin permission + audit |
| Product publication/suspension | seller service/admin moderation action | active Organization permission or admin moderation |
| Merchant Order list/detail | internal web/server route | active Organization + `order.view` + Store ownership |
| Confirm/reject/advance/cancel Order | idempotent server action/route | active Organization + appropriate order permission + history |
| Expire pending Orders | authenticated scheduled maintenance entrypoint | deployment secret/system actor; idempotent domain service |

The production limiter must move from process memory to a shared store before write traffic is enabled. Trusted proxy configuration must overwrite forwarded IP headers.

## 7. State machine

### OrderStatus transitions

| From | To | Actor | Preconditions | Inventory/payment effect | Reason |
| --- | --- | --- | --- | --- | --- |
| none | PENDING | Buyer through checkout | valid active Store/cart/address/stock | reserve stock; Payment UNPAID | not required |
| PENDING | CONFIRMED | Merchant `order.manage` | before expiresAt; Store order operations allowed | consume reservation; Fulfillment PREPARING | optional note |
| PENDING | REJECTED | Merchant `order.manage` | unconfirmed | release reservation; Payment VOIDED | required |
| PENDING | CANCELLED | owning buyer or merchant/admin | buyer only while PENDING | release reservation; Payment VOIDED | optional buyer, required merchant/admin |
| PENDING | EXPIRED | system | expiresAt elapsed | release reservation; Payment VOIDED | system code |
| CONFIRMED | CANCELLED | merchant `order.cancel` or admin | not DELIVERED/PICKED_UP; policy permits | restock sold quantity; Fulfillment CANCELLED; Payment VOIDED if unpaid | required |
| CONFIRMED | COMPLETED | merchant/system transaction | DELIVERED or PICKED_UP and Payment PAID | no further stock change | system code |

`COMPLETED`, `REJECTED`, `CANCELLED`, and `EXPIRED` are terminal in MVP.

### FulfillmentStatus transitions

| Method | Transition | Actor/condition |
| --- | --- | --- |
| both | UNFULFILLED -> PREPARING | merchant confirms Order |
| PICKUP | PREPARING -> READY_FOR_PICKUP | merchant `order.manage` |
| PICKUP | READY_FOR_PICKUP -> PICKED_UP | merchant verifies handoff; mark Payment PAID and Order COMPLETED atomically |
| DELIVERY | PREPARING -> OUT_FOR_DELIVERY | merchant `order.manage` |
| DELIVERY | OUT_FOR_DELIVERY -> DELIVERED | merchant verifies handoff; mark Payment PAID and Order COMPLETED atomically |
| DELIVERY | OUT_FOR_DELIVERY -> DELIVERY_FAILED | merchant; reason required |
| DELIVERY | DELIVERY_FAILED -> OUT_FOR_DELIVERY | merchant retry; note required |
| both | nonterminal -> CANCELLED | only with valid Order cancellation |

### PaymentStatus transitions

| From | To | Actor/condition |
| --- | --- | --- |
| none | UNPAID | checkout creates offline Payment |
| UNPAID | PAID | merchant completes pickup/delivery; amount/currency must match Order |
| UNPAID | VOIDED | Order rejected/cancelled/expired |

There is no PAID -> REFUNDED transition in Milestone 2.

## 8. Inventory algorithm

All operations lock relevant rows in deterministic variant-ID order, run in a serializable transaction, use unique operation keys, and retry only recognized serialization/deadlock failures up to a small bounded count.

### Create Order and reserve stock

1. Lock/create the buyer-scoped CheckoutIdempotency row.
2. Lock the active Cart and CartItems; revalidate buyer and cart version.
3. Resolve and lock Store/ProductVariant/InventoryItem rows in sorted order.
4. Reject if Store/Product/Variant is unavailable, currency/price changed, or fulfillment is invalid.
5. Verify each `available = onHand - reserved` is at least requested quantity.
6. Create Order, OrderItems, OrderAddress when needed, Payment UNPAID, and initial OrderStatusHistory.
7. For every item, increment `reserved`, increment InventoryItem.version, create ACTIVE InventoryReservation with Order acceptance expiresAt, and append RESERVE StockMovement with a deterministic key.
8. Mark Cart CHECKED_OUT and complete CheckoutIdempotency with the Order ID/response.
9. Create deduplicated buyer/merchant in-app notifications.
10. Commit. Any failure rolls back every row.

### Confirm Order

1. Lock Order, active reservations, and InventoryItems.
2. Require PENDING, not expired, matching Store ownership, and an idempotent transition key.
3. For each reservation, decrement both `onHand` and `reserved` by quantity, mark reservation CONSUMED, and write SALE movement (`onHandDelta=-q`, `reservedDelta=-q`).
4. Set Order CONFIRMED, Fulfillment PREPARING; append history/notifications.
5. Commit atomically.

### Reject Order

Lock the PENDING Order/reservations/inventory, require merchant reason, decrement reserved only, mark reservations RELEASED, append RELEASE movements, set Order REJECTED/Fulfillment CANCELLED/Payment VOIDED, write history/notifications, and commit.

### Cancel Order

- **Pending:** same release algorithm as reject. Buyer may cancel only its own PENDING Order. Merchant/admin cancellation requires a reason.
- **Confirmed before fulfillment completion:** increment onHand by each sold quantity, append RESTOCK movements, set Order/Fulfillment CANCELLED and Payment VOIDED if unpaid. This is merchant/admin only in MVP.
- **Completed:** cancellation is forbidden; refunds/returns are deferred.

### Expire Order

The scheduled service selects PENDING Orders with `expiresAt <= now` in bounded batches using row locking/skip-locked semantics, then runs the pending release algorithm with deterministic expiry keys. Re-running the batch is harmless. Opportunistic expiry during cart/order requests is a fallback, not a substitute for a scheduler.

### Complete Order

No inventory mutation occurs because stock was consumed at confirmation. The delivery/pickup completion transaction sets Payment PAID, fulfillment terminal, Order COMPLETED, and writes history/notifications once.

### Manual inventory adjustment

An authorized actor locks InventoryItem, applies a signed onHand delta only if `onHand + delta >= reserved`, increments version, and writes ADJUSTMENT movement with required reason and actor. Direct InventoryItem writes outside this service are prohibited.

## 9. Checkout algorithm

1. Require a valid Better Auth session, active/non-deleted/onboarded Person, and identity-scoped rate limit.
2. Validate the `Idempotency-Key` UUID header and bounded Zod body: cartId, cartVersion, fulfillment method, optional owned addressId, optional instructions.
3. Canonicalize the semantic request and hash it. Start a serializable transaction.
4. Insert CheckoutIdempotency `(buyerPersonId,key,requestHash,IN_PROGRESS)`. On unique conflict, load it for the same buyer: return stored result for the same hash/COMPLETED; return 409 for a different hash; safely retry/return in-progress for a concurrent request.
5. Lock and load the buyer's ACTIVE Cart. Verify cart version, nonempty rows, and one Store.
6. Load the Store through an ACTIVE/published/not-archived predicate. Recheck Organization active state if Store operations depend on it.
7. Load all Products, Variants, InventoryItems, and media needed for snapshots. Require Product/Variant public state and Store ownership.
8. Load current variant prices and Store currency as Decimal. If any differs from CartItem.unitPriceAtAdd, return a conflict and refreshed Cart without creating an Order.
9. Validate fulfillment: enabled method, delivery area/address ownership, minimum order, contact, and Store instructions.
10. Calculate subtotal, zero discount/tax, delivery fee, and total using Decimal. Reject overflow/scale/currency mismatch.
11. Generate a cryptographically random, non-sequential public Order number and immutable Store/customer/address/item snapshots.
12. Lock inventory rows in sorted order, validate available quantities, and execute the reservation algorithm in section 8.
13. Persist Order, items, Payment, history, reservations, movements, checked-out Cart, notifications, and completed idempotency response in the same transaction.
14. Commit and return the stored Order response. On recognized serialization conflict, retry the entire transaction with the same key. On unknown failure, log identifiers only—never address/phone—and return a generic error.

The server never trusts client prices, totals, currency, stock, Store status, address ownership, snapshot text, payment status, or Order number.

## 10. Authorization matrix

### Organization role defaults

| Capability | OWNER default | MANAGER default | RECEPTIONIST default | STAFF default | Admin |
| --- | --- | --- | --- | --- | --- |
| Store view | Yes | No until granted | No | No | `COMMERCE_STORES_VIEW` |
| Store create/update/submit | Yes | No until granted | No | No | review permission is separate |
| Product view/create/update/archive | Yes | No until granted | No | No | `COMMERCE_CATALOG_MODERATE` for moderation |
| Inventory view/adjust | Yes | No until granted | No | No | explicit inventory admin permission if added |
| Order view/manage/cancel | Yes | No until granted | No | No | explicit commerce order permissions |
| Refund/report | No; feature absent | No | No | No | feature absent |

After role-management capability is approved, an Owner may grant the reviewed Manager set and a limited order-operator set to custom/current roles. Until then, OWNER-only seller operations are the safest bootstrap.

### Resource authorization

| Actor | Allowed resource scope | Required enforcement |
| --- | --- | --- |
| Public | ACTIVE/published Store/Product/Variant only | shared public visibility predicate; no private fields |
| Buyer | own Cart, Address, Order, commerce favorites | current Person ID included in every query/mutation |
| Seller member | Store whose organizationId equals active membership organizationId | active Organization cookie validated server-side + permission + ownership in same query |
| Admin | only explicit commerce permission; super-admin bootstrap | requireAdminPermission + audit for mutation |
| System expiry | bounded expired PENDING Orders | deployment-authenticated entrypoint + deterministic idempotency/history |

Stronger audit/history is mandatory for Store moderation, Product suspension, inventory adjustment, Order confirm/reject/cancel/complete, payment marking, and admin override. Never authorize from a Store/Product/Order ID supplied by the client without also constraining the owning Person/Organization.

## 11. Migration plan

1. **Preflight:** approve this review, currency/expiry/delivery policies, scheduler platform, production shared rate limiter, and authenticated mobile transport. Take a verified backup and test restore on staging.
2. **Permissions and catalog foundation:** add commerce enums, Role commercePermissions with fail-closed default, Store, MarketplaceCategory, Product, ProductVariant, ProductMedia, lifecycle fields, constraints, and visibility indexes. Backfill only system OWNER roles with the approved MVP set; update new-owner creation in the same release.
3. **Search capability:** add normalized search columns and, only after privilege verification, `pg_trgm` plus GIN indexes. Provide bounded fallback if extension creation is unavailable.
4. **Inventory:** add InventoryItem, InventoryReservation, StockMovement, nonnegative/check constraints, idempotency/indexes. No stock writes are exposed yet.
5. **Customer state:** add CustomerAddress, Cart, CartItem, partial unique ACTIVE/default indexes. Deploy private APIs behind a disabled feature flag.
6. **Orders:** add Order, OrderItem, OrderAddress, OrderStatusHistory, Payment, CheckoutIdempotency, constraints/indexes, and Notification commerce fields. Keep checkout disabled.
7. **Favorites:** add CustomerFavoriteStore/Product with concrete foreign keys.
8. **Services/tests:** implement central authorization/visibility/money/transition/inventory services and pass unit/integration/concurrency tests before route exposure.
9. **Read rollout:** guarded development/staging seed, public catalog APIs, mobile real-data read UI. Verify service marketplace/booking regressions.
10. **Private rollout:** authenticated transport, address/cart APIs/UI, then checkout/order APIs/UI only after scheduler and shared rate limiter are live.
11. **Operational minimum:** Store review, Owner Order transition path, expiration scheduler, audit/notification behavior, runbooks, and monitoring.
12. **Release:** staged traffic, reconcile inventory/reservations/orders, validate privacy projections, then enable feature flag.

Migration safety rules:

- Use multiple forward migrations; do not bundle all commerce tables into an opaque migration.
- Add new isolated tables/nullable references first; do not alter Booking/Service semantics or reuse their IDs.
- Add database CHECK/partial indexes with reviewed SQL where Prisma cannot express them.
- No existing booking data backfill is expected. Role permission backfill is the only existing-row mutation and must be enumerated/dry-run.
- Store currency/defaults must be explicit; no fake Store/Product rows as migration data.
- Development/staging seed must be deterministic, idempotent, environment-gated, and refuse production. It must use real domain services or satisfy every invariant.
- Rollback before exposure is feature-flag disable plus migration rollback on a disposable environment. After Orders exist, do not drop tables; deploy a forward fix and restore from backup only under an incident runbook.
- Public API additions are backward-compatible. Existing `/api/mobile/marketplace`, web `/marketplace`, Service, Booking, restaurant, and favorite endpoints remain unchanged.

## 12. Test plan

The smallest practical stack is Node 24's built-in `node:test` executed through the already-installed `tsx` loader for TypeScript. No new runner dependency is required initially. Add scripts/config only in an explicitly approved implementation task. Integration tests use a dedicated disposable PostgreSQL test database/schema, never the developer or production database.

### Pure unit tests

- Decimal subtotal/fee/total calculations, scale/rounding, compare-at validation, and overflow bounds.
- canonical option keys, SKU normalization, Arabic search normalization, cursor encoding/decoding.
- Store/Product public visibility predicates.
- order/fulfillment/payment transition tables and required-reason rules.
- request canonicalization/hash and idempotency-key semantics.
- snapshot mapping contract: all required fields copied and immutable.

### PostgreSQL integration tests

- active Organization/Role permission success and fail-closed defaults.
- cross-Organization Store/Product/Inventory/Order access denied.
- cross-customer Cart/Address/Order/favorite access denied.
- one ACTIVE Cart per Person and one Store per Cart under concurrent writes.
- add same variant merges quantity; limits enforced; explicit Store replacement only.
- stale price and unavailable/archived/suspended variants block checkout.
- same checkout key/hash returns one Order; same key/different hash conflicts.
- 10–50 concurrent checkouts against limited stock produce no negative inventory and no oversell.
- serialization/deadlock retry produces one reservation/movement per operation.
- confirm consumes reservation; reject/cancel/expire releases; confirmed cancellation restocks once.
- invalid transitions and duplicate transitions do not mutate or duplicate history/notifications.
- Store suspension removes public/search visibility, blocks cart/checkout, preserves historical Order access.
- archived Product/Variant keeps old OrderItem snapshots and totals unchanged.
- search excludes suspended/unpublished records and respects cursor/order/index query plan.
- Payment remains truthful UNPAID until authorized completion; no provider state exists.

### Route/contract tests

- Zod rejection and stable typed errors for every endpoint.
- decimal strings, no PII in public responses/logs, cache headers for public and `no-store` private.
- Better Auth Expo session accepted; missing/inactive/not-onboarded identity rejected.
- rate-limit responses and Retry-After; shared-store behavior in staging.

### Regression and QA

- root lint, scoped lint, typecheck, Prisma validate/status, Webpack production build, Expo export, diff checks.
- existing service discovery, service favorites, Booking creation/reschedule/cancellation, restaurant reservations, active Organization switching, and admin access smoke tests.
- iPhone 17 Pro/17e RTL, narrow screen, reduced motion, offline/slow network, repeated checkout taps, cart Store replacement, VoiceOver on supported runtime, and truthful error/empty states.

No checkout release is acceptable without the concurrent stock, idempotency, authorization, and snapshot integration tests.

## 13. Risk register

| Severity | Risk | Mitigation |
| --- | --- | --- |
| Critical | Overselling under concurrent checkout | sorted row locks, Serializable transaction, database checks, bounded retries, reservation ledger, concurrency tests |
| Critical | Duplicate Orders/movements from taps or retries | buyer-scoped idempotency + request hash + unique movement/history keys + replay tests |
| Critical | Client price/fee/total tampering | ignore client amounts; Decimal server recalculation and snapshot in one transaction |
| Critical | Cross-tenant seller access | validated active Organization, explicit permission, Store ownership predicate in every query, adversarial integration tests |
| Critical | Cross-customer Cart/Address/Order exposure | current Person ID in every private query, private projections, route tests |
| High | No scheduler causes reservations never to expire | choose/deploy scheduler before checkout release; idempotent bounded expiry service; reconciliation alert |
| High | Process-local rate limiter is ineffective across production instances | shared Redis-backed limiter and trusted proxy configuration before write release |
| High | Mobile authenticated API transport is not proven | implement/test Better Auth Expo credential transport before private endpoints; no anonymous fallback |
| High | Offline payment represented as paid too early | Payment UNPAID until verified handoff; no provider or fake attempts; privileged audit |
| High | Store suspension either leaks public data or strands Orders | centralized public predicate; block new sales; preserve scoped history/operations; admin freeze policy |
| High | Address/phone privacy exposure | explicit projections, no PII logs, Store/order ownership checks, retention policy and security tests |
| High | Migration/constraint mistakes corrupt stock or lock sellers out | staged migrations, backup/restore test, dry-run role backfill, checks, feature flag, reconciliation |
| High | Weak test foundation misses concurrency/auth defects | Node test harness + isolated PostgreSQL required before route exposure; release gate |
| High | Money precision lost by JavaScript Number | Decimal-only commerce module, string API contract, lint/review rule, unit tests |
| Medium | Booking/Order and Marketplace naming collide | `/commerce` modules/routes; separate schema; preserve service marketplace endpoint |
| Medium | ILIKE search becomes slow | normalized text, trigram GIN, bounded cursor queries, explain-plan tests/monitoring |
| Medium | Product option JSON becomes inconsistent | canonical option key, bounded schema, unique constraint, server-only writes |
| Medium | One Store/delivery area limits sellers | documented MVP limit and forward migration path |
| Medium | In-app notification duplicates | deterministic dedupeKey and OrderStatusHistory source of truth |
| Low | Media URL changes/breaks | snapshot primary URL; approved-host validation; managed storage deferred |

## 14. Milestone 2 in-scope

- Approved one-Store-per-Organization ownership and typed commerce permissions.
- Store lifecycle, public visibility, minimum manual admin approval/suspension path.
- Flat Marketplace categories.
- Product, default/option variants, media URL references, publication/moderation.
- Single-location InventoryItem, reservations, StockMovement ledger, expiry/reconciliation service.
- Authenticated CustomerAddress.
- One active server Cart per Person and one Store per Cart.
- PostgreSQL Store/Product search with Arabic normalization, indexes, filters, cursors.
- Public marketplace home, search, Store, Product, and category APIs.
- Private cart/address/favorite APIs.
- Owner-approved offline checkout with COD/pay at pickup, idempotency, immutable snapshots, and one Order per checkout.
- Customer Order list/detail and PENDING cancellation.
- Minimum merchant/admin Order transitions required to make customer Orders operable, without a full management UI.
- Order/fulfillment/payment histories and transactional in-app notifications.
- Store/Product favorites using separate concrete tables.
- Truthful mobile customer UI backed only by real APIs.
- Deterministic development/staging-only seed behind strict environment guards; never production.
- Unit, integration, concurrency, authorization, route, regression, and device QA gates.

## 15. Milestone 2 out-of-scope

- Reusing or changing Service, BranchService, Booking, restaurant reservation, or their favorites as commerce.
- Multiple Stores per Organization, StoreMember, Store staff assignments, multiple warehouses/pickup branches, and multi-Store checkout.
- Guest/anonymous cart or checkout.
- Merchant product-management UI and full merchant order-management UI.
- Full admin/seller dashboards, bulk moderation, automated KYC/risk, and appeals.
- Online payment provider, manual transfer, PaymentAttempt, webhooks, refunds, chargebacks, and stored payment credentials.
- Taxes, coupons, promotions, gift cards, commissions, seller payouts, and currency conversion.
- Returns, exchanges, partial cancellation/fulfillment/refund, and disputes.
- Shipment/carrier integration, external delivery, driver app, live tracking, delivery zones/distance pricing.
- Sponsored Products, advanced analytics/reports, recommendations, AI personalization, and commerce reviews.
- Category hierarchy, bundles, subscriptions, digital goods, arbitrary option-definition engine, bulk catalog import.
- Push/email/SMS notifications and low-stock notifications.
- Production media upload/storage pipeline unless separately approved.

## 16. Open product decisions requiring owner approval

1. **Milestone boundary:** approve moving bounded offline checkout/inventory/customer Orders from the old Milestone 3 plan into Customer MVP Milestone 2; otherwise remove checkout from the milestone and rename it.
2. **Store multiplicity:** approve zero/one Store per Organization for MVP and the documented future migration path.
3. **Launch currency:** approve IQD-only launch, Decimal(18,3), and user-facing display/rounding behavior.
4. **Acceptance window:** resolved for Milestone 2A as a 15-minute pending Order/stock hold.
5. **Scheduler platform:** identify the production mechanism that will invoke expiration/reconciliation; checkout cannot release without it.
6. **Delivery policy:** approve one flat-fee delivery city/area plus one pickup point per Store, including how city/area values are normalized.
7. **Cancellation policy:** approve buyer cancellation only while PENDING and merchant/admin cancellation after confirmation only before handoff.
8. **Merchant operational minimum:** approve an Owner-only transition surface/API in Customer MVP even though the full merchant order UI is deferred.
9. **Admin moderation minimum:** approve the minimal Store review/Product suspension surface required before public data can exist.
10. **Tax/fiscal policy:** confirm taxTotal remains zero and whether local invoice/receipt obligations require additional snapshots before launch.
11. **Privacy/retention:** approve Order, idempotency, address, and notification retention/anonymization periods and legal access policy.
12. **Search extension:** confirm production PostgreSQL permits `pg_trgm`; otherwise approve the bounded fallback.
13. **Development data:** approve a strictly guarded, deterministic development/staging commerce seed and its non-production dataset.
14. **Production controls:** approve Redis/shared rate limiting and trusted proxy header configuration as pre-release requirements.
15. **Media:** choose approved URL hosts or a managed media provider; arbitrary remote URLs should not be a permanent production policy.

## 17. Exact implementation sequence

1. Obtain written owner decisions for every item in section 16 and update the existing implementation plan to reflect the approved Milestone boundary.
2. Write acceptance criteria and invariants as failing unit/integration tests, including concurrency/idempotency/authorization cases.
3. Design-review exact Prisma syntax and migration SQL, including partial unique indexes, checks, foreign-key deletion policies, pg_trgm availability, and role backfill dry-run.
4. Add permissions and Store/catalog foundation behind a disabled feature flag; validate no booking/service schema behavior changes.
5. Add inventory/reservation/movement schema and the single audited inventory service; pass concurrent reservation/release tests before any route.
6. Add CustomerAddress and Cart schema/services; prove Better Auth Expo authenticated API transport and cross-customer isolation.
7. Add Order/snapshot/history/Payment/idempotency schema and pure money/state-machine services.
8. Implement checkout and transition services without UI; pass duplicate-key, price change, suspension, concurrent stock, release/restock, and snapshot tests.
9. Implement the expiration/reconciliation runner and shared rate limiter; verify multi-process/staging behavior.
10. Implement public commerce APIs/search and minimum Store moderation; load only owner-approved guarded development/staging data.
11. Implement customer cart/address/favorites APIs, then checkout/order APIs, maintaining typed envelopes and no-store private responses.
12. Implement the mobile Customer MVP using real APIs only, with honest loading/error/empty/out-of-stock/price-changed states.
13. Add the minimum Owner/admin Order operational surface so created Orders can be confirmed/rejected/fulfilled/cancelled truthfully.
14. Run full automated, Prisma, build/export, booking regression, security/privacy, and real-device accessibility QA.
15. Reconcile InventoryItem, active reservations, movements, Orders, totals, and notifications on staging; document rollback/runbooks.
16. Request owner release approval. Do not enable checkout until all Critical/High controls and open decisions are closed.
