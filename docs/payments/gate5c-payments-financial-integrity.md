# Gate 5C — Payments and Financial Integrity Foundation

Status: independent-review fixes locally validated; Draft, staging, and exact-new-head closure pending

Baseline: `cb32cf401bc0f060940ec71dffba76f8d5089733`

Branch: `feat/payments-financial-foundation`

Scope: Gate 5C only

## Baseline and operating boundary

The GitHub baseline was verified before this worktree was created. `origin/main` is
`cb32cf401bc0f060940ec71dffba76f8d5089733`, the merge commit for PR #122. PR
#122 is merged from exact head `207e408028b01b188f6fee526f51792a853d7540` and
its GitHub Actions and two Vercel checks passed. The repository has exactly 40
migrations and real `rezno_staging` reported 40 applied, zero failed and zero
rolled back. Gate 5A and Gate 5B storage/media tables are present. No migration
41, competing Gate 5C branch, payment PR, production payment provider, payment
worker, Gate 5D work, or Stage 6 work existed at baseline.

The isolated worktree is
`/Users/user/Documents/REZNO/REZNO/rezno-payments-foundation`. It began clean at
0/0 divergence from `origin/main`. The protected checkout was not inspected or
modified. PR #100 remains Open and Draft at protected head
`e46454df993ecccb06180060dda4353ec88e2641`.

## Existing payment architecture audit

### Schema and authority

| Concern | Baseline finding |
| --- | --- |
| `Payment` | One row per `Order` through unique `orderId`; amount `Decimal(18,3)`, currency `IQD`, method, `UNPAID/PAID/VOIDED`, paid/voided timestamps and recorder. It has no provider, attempt, authorization, capture, refund, commission, or ledger identity. |
| Authority | `Order` totals and the paired `Payment` must agree. The simple `Payment` is an offline compatibility summary, not a provider or accounting authority. |
| Attempts | Impossible: the unique one-to-one row has no attempt relation. |
| Methods | Only `CASH_ON_DELIVERY` and `PAY_AT_PICKUP`. |
| Reachable states | Checkout creates `UNPAID`; offline handoff creates `PAID`; reject, cancel, or reservation expiry creates `VOIDED`. |
| Order totals | `subtotal`, `discountTotal`, `deliveryFee`, `taxTotal`, and `grandTotal` are `Decimal(18,3)` and currency is a three-character column constrained by migration to `IQD`. |
| Booking | Has no payment record, method, payment state, or currency. `priceSnapshot` is `Decimal(10,2)` copied from the authoritative active `BranchService`. Restaurant reservations use the same canonical `Booking`. |
| Online enablement | `OrganizationSettings.allowOnlinePayments` exists and defaults false, but no payment flow currently consumes it. |
| Inventory expiry | An Order remains `PENDING` with a bounded reservation. Current expiry/cancellation releases inventory and voids only an unpaid offline summary. |
| Refunds | No refund model, provider refund, refunded state, or refund accounting. Cancellation text is not a refund record. |
| Settlement | No payment settlement, merchant payable, payout, remittance, commission, revenue recognition, or reconciliation model. Existing docs explicitly defer them to Stage 5. |

Migration 41 preserves `Payment` as a clearly documented derived
compatibility summary. Existing rows are pre-ledger because they have no
canonical intent or journal link. No provider, capture, or financial journal will
be fabricated for history. New online money movement is authoritative only in
`PaymentIntent` plus the append-only ledger. `Payment` remains the compatibility
projection for existing Order contracts and offline flows; it is never a second
provider authority.

### Production payment writers

1. `features/commerce/services/checkout-service.ts` derives totals, currency and
   offline method, then creates Order, inventory reservation, and the paired
   `Payment` atomically. The Customer supplies neither payment amount nor
   currency.
2. `features/commerce/services/order-service.ts` is the only post-checkout
   production writer. Final pickup/delivery changes both Order and Payment from
   `UNPAID` to `PAID`. Rejection, Customer cancellation, Merchant cancellation,
   Admin cancellation and overdue expiry change both from `UNPAID` to `VOIDED`.
3. Staging fixtures and integration tests directly seed/update/delete Payment
   rows. Those are non-production test infrastructure and do not grant a runtime
   mark-paid capability.

There is no Customer, Business, Admin, mobile, webhook, callback, return, cron,
or provider endpoint that can mark an online payment paid. The existing manual
mark-paid behavior is the Merchant order handoff operation for an offline
payment; there is no standalone Admin mark-paid operation.

Every current `Order.paymentStatus` mutation is in checkout creation or the
central order service paths just listed. Current cancellation refuses `PAID`
orders and never attempts a refund. Gate 5C must retain that safety until an
explicit online refund succeeds; cancellation must not erase a capture.

### Production payment readers

The paired Payment and Order summary are read by Customer, Merchant and Admin
order query services, commerce DTO serializers, order transition DTOs, Customer
Web order pages, Business order pages, Admin commerce pages, and Customer Mobile
commerce types/screens. List filters accept only the three baseline summary
states. Booking detail serializers and Web/Mobile booking screens currently have
no payment fields. No client receives provider data or ledger data.

The Gate 5C integration adds explicit safe payment DTOs and a single mapping
service. Existing order DTOs continue receiving a compatibility status, while
canonical intent detail remains separately typed and authorized.

### State mappings at baseline

| Event | Payment summary | Order summary | Booking summary |
| --- | --- | --- | --- |
| Checkout/create | `UNPAID` | `UNPAID` | None |
| Offline pickup/delivery completed | `PAID` | `PAID` | None |
| Reject/cancel/expire while unpaid | `VOIDED` | `VOIDED` | None |
| Authorization | Unsupported | Unsupported | Unsupported |
| Partial/full capture | Unsupported | Unsupported | Unsupported |
| Partial/full refund | Unsupported | Unsupported | Unsupported |

Gate 5C adds `PARTIALLY_REFUNDED` and `REFUNDED` to the compatibility
`PaymentStatus`, and `ONLINE_PROVIDER` to `PaymentMethod`. Intent states map as:

| Canonical intent | Target compatibility state |
| --- | --- |
| `CREATED`, `REQUIRES_ACTION`, `PROCESSING`, `AUTHORIZED`, `PARTIALLY_CAPTURED`, `FAILED` | `UNPAID` |
| `CAPTURED` | `PAID` only when captured equals authoritative amount |
| `PARTIALLY_REFUNDED` | `PARTIALLY_REFUNDED` |
| `REFUNDED` | `REFUNDED` |
| `CANCELLED`, `EXPIRED` | `VOIDED` only when no capture exists |

Late or out-of-order capture against a cancelled/expired target is recorded as a
reconciliation exception; it never silently restores the business target.
Payment failure alone does not cancel an Order or Booking. Inventory expiry
remains under the current commerce policy.

## Money and currency audit

`features/commerce/domain/money.ts` already uses `Prisma.Decimal`, rejects
non-finite values and more than three decimal places, enforces
`Decimal(18,3)` capacity, and rejects fractional IQD. All persisted commerce
totals are calculated through exact Decimal addition, subtraction and
multiplication. DTOs use `toFixed(3)` strings. Booking price persistence uses
`Decimal(10,2)` and is copied server-side; Gate 5C converts it exactly into the
canonical `Decimal(18,3)` representation without a binary floating-point step.

Runtime source scans found JavaScript `number` for inventory quantities, page
limits, dates, and UI display conversion. UI formatters convert decimal strings
to `number` only for presentation; these conversions are not payment arithmetic
or persisted financial decisions. No production payment calculation calls
`toNumber`, `parseFloat`, or `Math.round/floor/ceil`. Existing business catalog
forms may submit a price when an authorized Business edits a product/service;
the persisted validated snapshot, not a checkout payment request, is the payment
authority.

The closed Gate 5C currency registry initially contains only:

| Code | Persistence scale | Display exponent | Minimum | Maximum | Rounding |
| --- | ---: | ---: | ---: | ---: | --- |
| IQD | 3 | 0 | `1.000` | `999999999999999.000` | exact whole-IQD; reject fractions |

Payment APIs never accept amount, currency, commission, refundable amount,
settlement amount, or provider selection from the client. Stable money JSON is
always a canonical decimal string. Commission arithmetic uses exact Decimal and
an explicit rounding policy; the only approved policy in Gate 5C is zero basis
points, so no rounding loss occurs.

## Provider, route, and credential audit

Repository, dependency and environment-name scans found no Stripe, iyzico,
PayTR, Param, Shopier, PayPal, Adyen, Checkout.com, Square, Braintree, ZainCash,
AsiaHawala, Qi Card, FastPay, FIB or N-Genius SDK/configuration. No Apple Pay,
Google Pay, hosted checkout, 3DS, payment link, provider transaction identifier,
provider token, payment API key, webhook secret, payment webhook route, payment
return route, or provider callback route exists. OAuth tokens in the identity
schema are unrelated to payments.

Production provider status is therefore **not configured**. The provider-neutral
adapter fails closed with `PAYMENT_PROVIDER_NOT_CONFIGURED`. A deterministic
provider is allowed only for unit/PostgreSQL tests and an exact guarded staging
operator smoke. A production guard prevents selecting it in production.
Provider calls happen outside database transactions and store only safe
references/codes.

## PCI and sensitive-data audit

No payment form or persistence field accepts PAN/card number, CVV/CVC, card
expiry, cardholder name, track data, bank account, IBAN, payment token, provider
session token, authorization header, raw payment response, or raw webhook body.
No current log records payment secrets or card data. Existing phone/address and
Booking notes are ordinary target PII and will not be copied into provider,
event, ledger, settlement, cursor, audit, or notification payloads.

Gate 5C remains a hosted/action-reference integration boundary: REZNO never
collects card data. Webhook input is read from the request stream into one
fixed 64 KiB buffer with an authoritative cumulative actual-byte bound,
signature-verified before business parsing, normalized, hashed and discarded.
Only a safe event identifier, payload hash, normalized type, safe provider
reference/code and processing state persist. Return routes are fixed same-origin
UX views and cannot mutate financial state or redirect arbitrarily.

Risks to keep out of scope are client card fields, raw webhook persistence,
logging action URLs/tokens, interpolating provider errors, arbitrary provider or
callback inputs, and enabling the deterministic adapter in production.

## Authorization and idempotency audit

Current Business authorization derives the active Organization from the current
membership and uses role-derived commerce capabilities. Owners and Managers can
manage orders; Receptionists and Staff have no proven financial authority and
will remain denied. Customer services bind to the authenticated Person and own
Order/Booking. Admin access uses current `AdminAccess`, current permission
revalidation, dependency-aware permissions, environment Super Admin policy,
UUID idempotency and redacted `AdminAuditLog`.

No payment-specific Admin permission existed. Migration/code adds:

- `PAYMENTS_VIEW`
- `PAYMENTS_REFUND` (depends on `PAYMENTS_VIEW`)
- `PAYMENTS_RECONCILE` (depends on `PAYMENTS_VIEW`)
- `SETTLEMENTS_VIEW`
- `SETTLEMENTS_MANAGE` (depends on `SETTLEMENTS_VIEW`)

Existing idempotency ledgers are target-specific: Checkout idempotency, Order
mutation histories, Admin mutations, Booking create/cancel/change mutations,
notification event keys, communication mutations, and storage/media mutations.
None can safely represent provider attempts, refunds, events, settlement or
reconciliation. `PaymentMutation` binds actor, scope, action, target,
authoritative amount/currency, expected version and request hash. Exact replay
returns its safe result; changed replay fails with `IDEMPOTENCY_CONFLICT`.

## Canonical Gate 5C architecture

### Aggregate and attempts

`PaymentIntent` is tied to exactly one `Order` or `Booking`, with real Customer
Person and Organization foreign keys, optional Store, closed provider/method,
authoritative amount/currency, captured/refunded totals, zero-commission
snapshot, provider reference, lifecycle timestamps, generation and optimistic
version. A partial unique index permits one nonterminal/current intent per target
generation while preserving failed/cancelled history.

`PaymentAttempt` provides bounded monotonically numbered attempts, unique
server idempotency and provider request references, safe provider results, action
expiry, and recoverable short claims. Provider submission is claimed in a short
transaction, executed outside the transaction, then conditionally applied.

`PaymentProviderEvent` provides per-provider unique event IDs, safe payload hash,
verification/processing state, normalized event time/type/reference and no raw
body. Duplicate and out-of-order events reconcile deterministically. A signed
provider event or trusted synchronous server result can confirm capture; a
browser return never can.

Gate 5C permits exactly one full capture. The verified capture amount must equal
the server-authoritative intent amount and a nonzero prior capture is rejected.
The persisted partial-capture enum remains for schema compatibility; no Gate 5C
service transition produces it and no later provider policy is assumed here.

### Refunds

`PaymentRefund` derives currency and refundable balance from the locked intent.
It records exact amount, bounded reason/note, actor, version and safe provider
reference. `REQUESTED/PROCESSING/SUCCEEDED/FAILED/CANCELLED` transitions are
idempotent and bounded. Provider calls remain outside the transaction.
Concurrent reservations of refund capacity cannot exceed captured minus already
succeeded or in-flight refund amounts. Only confirmed success updates intent,
target projection and a single reversing journal.

### Double-entry ledger

`FinancialAccount` is currency-specific and uses
`PROVIDER_CLEARING`, `MERCHANT_PAYABLE`, `PLATFORM_REVENUE`,
`CUSTOMER_REFUND_CLEARING`, `SETTLEMENT_CLEARING`, or `PAYMENT_EXCEPTION`.
Organization-owned accounts use a real Organization foreign key.

`FinancialJournal` is idempotent by source, currency and key, and is
`DRAFT/POSTED/REVERSED`. `FinancialPosting` has one positive Decimal debit or
credit. Database constraints plus deferred balance/currency triggers reject an
unbalanced posted journal. Posted journals and their postings are immutable;
correction uses a linked reversal journal.

Capture accounting is:

- debit provider clearing for captured gross;
- credit merchant payable for merchant net;
- credit platform revenue for commission when nonzero.

The Gate 5C commission policy is snapshotted as policy
`zero-v1`, 0 basis points, `0.000` commission and merchant net equal to capture.
No commercial percentage was found or invented.

Refund accounting under that immutable zero-commission allocation is:

- debit merchant payable for the refund amount;
- credit customer refund/provider clearing for the refund amount.

No refund journal is posted before provider-confirmed success.

### Settlement and reconciliation

`SettlementBatch` and `SettlementLine` are statements, never bank payout proof.
Draft preview and Admin-only finalization aggregate bounded ledger candidates in
PostgreSQL. Finalized totals and included journals are immutable. A journal
cannot enter two active finalized statements. `FINALIZED` means calculation
snapshot only; no payout provider or schedule exists.

Manual reconciliation inspects bounded intents without holding locks during
provider calls, then classifies `MATCHED`, `PROVIDER_AHEAD`, `DATABASE_AHEAD`,
`LEDGER_MISMATCH`, `TARGET_STATE_MISMATCH`, `MISSING_PROVIDER_RECORD`, or
`NOT_CONFIGURED`. It never silently rewrites posted history. Corrective work is
an explicit idempotent mutation/reversal. There is no Gate 5C scheduler.

### Cursor and DTO boundary

Payment, refund, journal and settlement pages use descending `(createdAt,id)`, a
fixed snapshot, six-digit PostgreSQL microseconds, page-size/filter/scope binding,
current authorization before decode, HMAC-SHA-256 and separate HKDF domains:

- `rezno:payments:intent-cursor-signing:v1`
- `rezno:payments:refund-cursor-signing:v1`
- `rezno:payments:ledger-cursor-signing:v1`
- `rezno:payments:settlement-cursor-signing:v1`

Safe DTOs expose only opaque IDs, target type, lifecycle state, canonical money
strings, currency, safe provider display/action classification, expiry,
timestamps and authorized refund/commission/settlement summaries. They never
expose secrets, raw events/errors, payment instruments, provider tokens,
authorization headers, Customer-facing internal accounts, or foreign Person or
Organization IDs.

Capabilities tell the truth about provider configuration, allowed methods,
currency and amount bounds, Organization enablement, action/refund support. In
production baseline, online control is disabled and API creation fails with
`PAYMENT_PROVIDER_NOT_CONFIGURED`; offline methods continue to work.

## Migrations 41–42 and database integrity evidence

Migration 41, `payments_financial_integrity_foundation`, is required and
forward-only. Migrations 1–40 remain byte-for-byte unchanged. It adds the
canonical models/enums/indexes/checks, exact-target
constraint, amount/capture/refund/commission/net bounds, currency checks,
positive versions/postings, attempt/event/mutation uniqueness, posted-ledger
balance and immutability triggers, reversal validity, and settlement inclusion
protection.

Migration 42, `payment_financial_integrity_closure`, is the bounded independent-
review correction required because migration 41 had already reached staging.
It prevents insertion or movement of postings after a Journal is posted, forces
Settlement batches to start as DRAFT, rejects DRAFT→VOID, and permits
FINALIZED→VOID only without rewriting immutable statement fields. Finalization
also requires at least one ledger line and revalidates its final Organization,
currency, Journal state, source, and period scope. Editing the already-applied
migration 41 in place would invalidate migration history.

It preserves all Order, Booking and Payment history. Existing Payment rows
remain visibly pre-ledger by nullable canonical linkage/no journal evidence. No
historical capture, provider identity, commission, refund or journal will be
backfilled. Booking receives explicit IQD/payment compatibility fields because
the existing system contract is IQD; this is a truthful target projection, not
fabricated payment evidence.

Fresh PostgreSQL migrations 1→41 passed twice. The populated rehearsal applied
only migration 41 to a true 40-migration database while preserving fingerprint
`404b71e184a96d15c8b3e7dc047c3a35`; it finished at 41 migrations, preserved the
single historical Payment as an unlinked pre-ledger summary, created no fake
intent or Journal, and left Booking payment truth at `UNPAID`. No reset or
`db push` was used. Real staging 40/40→41/41 remains the PR-head closure step.

## Performance evidence

All list paths are bounded and index-backed by owner/scope, status and
`(createdAt,id)`. Target intent lookups use unique/partial indexes on Order or
Booking plus generation. Attempts use `(paymentIntentId,attemptNumber)`. Provider
events use `(provider,eventId)` and provider reference. Refund balance comes from
locked intent totals plus bounded active refunds, not an unbounded JavaScript
sum. Journals/postings use source and account/currency/time indexes. Merchant
payable and settlement candidates aggregate exact PostgreSQL numeric values.
Settlement inclusion has a unique active-finalized constraint. Reconciliation
uses a bounded cursor batch. Provider calls never occur while database locks are
held. Query plans were recorded after schema implementation on populated
PostgreSQL data.

`EXPLAIN` on populated PostgreSQL confirmed index-backed plans for Customer
`(customerPersonId,createdAt,id)`, Organization
`(organizationId,createdAt,id)`, Admin `(createdAt,id)`, unique Order/Booking
generation, the active-target partial indexes, attempt history, provider
reference/event lookup, refund-by-intent, Journal-by-intent, Posting-by-Journal,
account balance, settlement status/time, reconciliation Organization/time and
actor/idempotency lookup. The Admin path uses a bounded bitmap scan and sort;
all other exercised point/page paths use the corresponding index directly.

## Implemented lifecycle and integration result

The canonical implementation consists of `PaymentIntent`, `PaymentAttempt`,
`PaymentProviderEvent`, `PaymentRefund`, `FinancialAccount`,
`FinancialJournal`, `FinancialPosting`, `PaymentMutation`, `SettlementBatch`
and `SettlementLine`. The old `Payment` remains only the derived Order/offline
compatibility projection. Payment intent and refund provider submissions hold
short owner-bound claims across external calls, recover expired claims, bind
results to the claimant and turn unexpected provider errors into safe retryable
results. Exact replays are checked before mutable target state, so a completed
request remains exactly replayable.

Webhook ingestion applies the provider-route/request-derived process-local rate
limit first, rejects an unavailable exact provider before consuming the body,
then reads and verifies the bounded raw body before parsing business data. It
uses timestamp tolerance and timing-safe authentication, persists only a hash
and normalized safe fields, and rejects an event-ID replay whose payload hash or
provider reference changed. Late/out-of-order events use the explicit mapping
and reconciliation exception path. Return routes are read-only same-origin
status views.

Posted Journal and Posting mutation/deletion is rejected in PostgreSQL. Reversal
triggers require a linked posted original, identical target/currency and the
exact opposite account/side amounts. Settlement finalization locks candidate
Journals, validates line totals and accepts only posted CAPTURE/REFUND Journals
from the same Organization/currency; concurrent finalization has exactly one
winner. `FINALIZED` continues to mean an immutable statement, not a bank payout.

Marketplace checkout and Booking integrations derive target, amount and IQD
currency from persisted server state. Offline checkout remains unchanged.
Capture/refund updates the canonical aggregate, compatibility target state,
ledger, audit and Gate 4 Notification event in one transaction. Customer Web
and Mobile, Business Web and Admin Web expose only their authorized safe DTOs.
Production capabilities truthfully return provider not configured; the
deterministic provider is guarded to non-production tests and the exact staging
operator flow.

## Notifications, audit, and UX integration

Capture/failure/refund events use the canonical notification producer with exact
event keys and safe amount/currency metadata. Settlement finalization targets
authorized Business recipients; reconciliation exceptions target authorized
Admins. Replays cannot duplicate notifications. Admin and Business financial
mutations produce redacted current-scope audit entries.

Customer Web/Mobile and existing Order/Booking detail receive truthful summary
and safe action state. Business receives bounded target/capture/refund/statement
views. Admin receives permission-scoped payment, refund, reconciliation and
settlement views. The provider return page refreshes server truth only. This is
functional Gate 5C integration, not a new financial dashboard or physical-device
proof.

## Security findings and acceptance boundary

The final independent review found three blockers on the former PR head: a
posted-Journal posting insertion/move gap, non-exact partial capture, and
settlement state/immutability gaps. The bounded remediation closes those paths
with exact service checks, migration 42, and direct PostgreSQL regression tests.
No known P0/P1/P2 remains after local validation; staging, exact-new-head CI,
Vercel, and independent review remain required before Ready or merge. Ownership,
Person, Organization, active-Business and current-Admin checks were exercised;
amount, currency, commission, provider and redirect inputs are not client
selectable. Concurrent attempt/refund tests prove one provider call per active
claim and expired-claim recovery. Exact capture/refund/event replay is a no-op,
changed replay conflicts, and concurrent refunds cannot exceed captured value.
Webhook signature/timestamp/replay checks, provider-event payload collisions,
late/out-of-order events, stale versions and cross-scope cursor/idempotency were
covered.

PostgreSQL rejects imbalance, posted-row mutation/deletion, fake or incomplete
reversals, settlement double inclusion and concurrent settlement races. Decimal
capacity, positive amounts, target identity, currency and refund bounds are
database constrained. Production rejects the deterministic provider. Fixture
and cleanup require the exact database, marker and confirmation token and use
only deterministic IDs.

Root and Customer Mobile production dependency audits report zero known
vulnerabilities after patching Next to 16.2.10 and constraining vulnerable
transitive PostCSS, Hono and UUID versions. Final Web/Mobile bundle scans found
no database URL, provider/webhook secret marker, authorization token, raw
provider field or locally used secret value. All Luhn-matching numeric bundle
sequences were 16 zero bytes in Hermes binary data; all apparent `pan` field
matches were browser/CSS pan vocabulary. No PAN/CVV/expiry/cardholder/IBAN field
or payment-instrument collection path exists.

## Complete local validation evidence

- Clean root `npm ci`: passed; audit: zero vulnerabilities.
- ESLint: passed with zero warnings; non-incremental TypeScript: passed.
- Prisma format, validate and generate: passed.
- Bounded webhook reader and guard unit: 17/17; complete Payment unit: 26/26;
  complete unit: 398/398.
- Payment PostgreSQL: 11/11; complete PostgreSQL: 348/348.
- Payment production HTTP/RSC/API: 8/8; complete HTTP: 102/102 (6 route-handler
  contracts plus 96 live contracts).
- Complete non-duplicated regression total: 848/848.
- Next 16.2.10 production build: passed with 96 static-page generation entries
  and all payment routes present.
- Mobile TypeScript and Expo Doctor: passed (20/20 checks); iOS Hermes export
  passed with 912 modules/30 assets, and Android Hermes export passed with 910
  modules/30 assets. Physical-device QA was not performed.
- Fresh migration 1→41: passed twice; populated 40→41: passed again with the
  representative historical fingerprint
  `ae3d86d79b541b2aa38d369d20e95cdb` unchanged, the legacy Payment unlinked,
  Booking still `UNPAID`, and zero fabricated canonical payment rows.
- Independent-review closure rehearsal: fresh 1→42 passed; a separate exact
  1→41 database applied only migration 42, reached 42/42 with zero failed or
  rolled-back rows, and a second deploy was a no-op. Historical migrations
  1–41 were not edited.
- Local staging rehearsal reached 41/41. Two fixture runs produced identical
  fingerprint `b313552ea282376da895de0f9ff0cd264fc47c79a9e00ad144dbb63f8299f6cf`.
  Focused smoke proved production provider `NOT_CONFIGURED`, deterministic
  capture/action/authorization/transient/permanent outcomes, balanced capture
  and refund Journals, zero commission, over-refund prevention, immutable
  finalized statement, double-inclusion rejection, pagination/cursor scope and
  manual reconciliation. Exact cleanup removed only fixture IDs; the second
  cleanup reported zero.

## Real-staging evidence

Draft PR #123 supplied an immutable `rezno-staging` Preview for application-code
head `b3fcc25d97a9bbb9a4fbbed6ae95886649fa7db3`. Authenticated Neon discovery
selected exactly project `rezno-staging`, database `rezno_staging`, owner role,
the direct non-pooler endpoint and required SSL. The initial read-only preflight
was healthy 40/40 with zero failed or rolled-back migration. `prisma migrate
deploy` applied only `20260720140000_payments_financial_integrity_foundation`
and reached healthy 41/41 without reset or `db push`. The final-head deployment
recheck was a no-op at 41/41.

The first remote evidence transaction exposed only Prisma's five-second default
interactive-transaction timeout; the transaction rolled back. The bounded
operator timeout was corrected to 30 seconds, locally revalidated and pushed.
Exact-ID cleanup removed the fixture rows created before that rollback-only
evidence step, and its immediate second cleanup returned zero before the
accepted run.

Accepted fixture runs one and two both produced
`b313552ea282376da895de0f9ff0cd264fc47c79a9e00ad144dbb63f8299f6cf`.
The evidence transaction proved seven balanced Journals, posted Journal and
Posting immutability, finalized-statement immutability, over-refund rejection,
settlement double-inclusion rejection, and statement—not-bank-payout—semantics.
Focused smoke passed provider `NOT_CONFIGURED`, own/foreign Customer and
Organization authorization, all scoped pagination families, cross-scope/page
size cursor rejection, deterministic CAPTURED/REQUIRES_ACTION/AUTHORIZED/
TRANSIENT_FAILURE/PERMANENT_FAILURE outcomes, signed/invalid/duplicate provider
behavior, zero-commission capture/refund accounting, and manual reconciliation
`NOT_CONFIGURED`.

Final cleanup removed exactly the fixture-owned rows, including 11 intents, 13
attempts, three provider events, two refunds, seven Journals, 14 Postings, two
settlements, 10 compatibility Payments and one smoke Admin audit. The second
cleanup returned zero in every category. Pre/post canonical table fingerprints
were unchanged:

- Stage 3: `ff7ea3307cb77e9c8d420bbeb828b30c1fddeff6d55c5dccf22428b8f6846d77`
- Stage 4: `4ea0799cd5be5853ccc410a1ad6899ad1db787f36e8e136490358fad0a743864`
- Gate 5A: `b5ed7bbd919e2e37f23e50f5bb9285785236406540c98f2b5dcc851916b44a39`
- Gate 5B: `263e468677d3b142b35fa56ecb8fa4958380f9d6cc901c8acda26a88da97be28`

Staging finished healthy at 41/41 with production provider
`PAYMENT_PROVIDER_NOT_CONFIGURED`; no real payment/refund or human account was
used. The accepted application evidence did not commit or retain credential
material. A subsequent security review identified that an earlier operator
diagnostic had emitted the then-current staging database URL, so that credential
was treated as compromised and closed by the rotation evidence below.

## Credential rotation security closure

Rotation started from exact PR head
`aa71ad5ac94a296f96b147febd91fe4ecc99a17f`. Authenticated metadata inventory
identified only project `rezno-staging`, database `rezno_staging`, the affected
staging owner role, and the sensitive Vercel database entry serving Preview
and the production target of the staging-only Vercel project. `DIRECT_URL` was
not configured, and the separate Vercel project `rezno` had no database
environment consumer. The endpoint remained direct rather than pooled. No
production database project, role, or credential was changed.

The existing staging owner-role password was reset through Neon’s authenticated
role-password API, preserving its Prisma runtime and migration privileges. A
fresh connection using the old credential was rejected with PostgreSQL
authentication failure. The replacement authenticated as the intended role to
exact database `rezno_staging`; Neon’s control plane and Vercel received the
replacement only through in-memory/stdin channels. The single sensitive Vercel
entry was atomically replaced for both authorized targets.

Using only the replacement credential, `prisma migrate deploy` was a no-op and
the database remained 41/41 with zero failed and zero rolled-back migrations.
Opening fixture cleanup was zero. Two fixture runs reproduced the identical
fingerprint
`b313552ea282376da895de0f9ff0cd264fc47c79a9e00ad144dbb63f8299f6cf`.
The complete focused smoke again passed provider and reconciliation
`NOT_CONFIGURED`, all five deterministic outcomes, server-derived money,
intent replay, webhook duplicate/out-of-order behavior, scoped signed cursors,
capture/refund accounting, balanced and immutable posted Journals, zero-v1
commission, merchant payable, refund limits, settlement immutability and
Customer/Business/Admin isolation.

Exact cleanup then removed 11 intents, 13 attempts, three provider events, two
refunds, seven Journals, 14 Postings, two settlement batches, 10 compatibility
Payments, three mutations, four accounts and only the deterministic fixture
actors and targets. The second cleanup returned zero for every category. The
Stage 3, Stage 4, Gate 5A and Gate 5B fingerprints recorded above remained
unchanged.

Vercel rebuilt the exact `aa71ad5` PR Preview and the latest main-based staging
deployment after the environment replacement; both reached Ready. Their
authenticated public-catalog health probes returned HTTP 200 with no database
authentication errors. The unauthenticated Preview URL redirects to Vercel
deployment protection as expected. Build logs, runtime logs, repository and Git
history, PR text and the exact-head Actions logs were scanned without emitting
their contents; no old/replacement credential or database connection string was
present.

One Vercel link diagnostic unexpectedly created an ephemeral `.env.local` with
an OIDC token under an isolated `/tmp` directory. The command was stopped; the
token value was never read or printed; the exact file, link metadata and empty
temporary directory were removed immediately, and their absence was verified.
Subsequent authenticated health checks used process-only project identifiers
and created zero files.

No real payment or refund was performed, the production payment provider
remains `PAYMENT_PROVIDER_NOT_CONFIGURED`, physical-device QA was not performed,
and neither Gate 5D nor Stage 6 was started. That accepted rotation evidence is
preserved across the bounded-webhook remediation; exact-new-head GitHub Actions,
Vercel checks and review-thread closure remain required PR checks.

## Bounded webhook ingestion security remediation

The webhook reader does not use `Request.arrayBuffer()`. It acquires the Web
request stream reader, checks the cumulative actual byte count before copying
each chunk into one preallocated 64 KiB buffer, cancels immediately on overflow,
releases the reader lock in every outcome and creates the exact returned
`Uint8Array` only after a legal nonempty stream completes. It retains no chunk
array, does not decode or parse before authentication and converts stream errors
to a generic validation contract without logging body content.

`Content-Length` is advisory only. A malformed, negative, unsafe,
duplicate/combined or over-limit declaration is rejected before reading; an
absent or smaller declaration never bypasses the actual streamed-byte bound.
Signature and timestamp headers are collected only after the body completes and
duplicate or malformed values share the generic webhook-verification error.

The production wrapper order is exact route/provider identity, rate limit,
provider-availability assertion, bounded raw-body read, header validation,
signature/timestamp verification, normalized parsing and idempotent processing.
The canonical service repeats provider availability and verification as defense
in depth. Production remains `PAYMENT_PROVIDER_NOT_CONFIGURED`, so the exact
route returns that safe contract without consuming the request body.

The webhook-specific threshold is 60 requests per 60 seconds for each exact
provider route and safe hashed request/network identifier. Requests without a
usable trusted address or header fingerprint share one bounded `unidentified`
bucket instead of creating unbounded random identities. `Retry-After` is bounded
to 1–60 seconds. This limiter is process-local defense in depth; distributed
rate limiting remains explicitly deferred to Stage 6 and no provider throughput
claim is implied.

Focused deterministic tests cover legal and exact-limit bodies, one/many-chunk
overflow, missing/false/malformed/duplicate `Content-Length`, immediate reader
cancellation, unread trailing chunks, stream failures, exact raw-byte signature
verification, unavailable-provider pre-body rejection, request-derived rate
keys, stable unidentified fallback and rate-limited body non-consumption.

The bounded-webhook real-staging recheck used the current stored Neon credential
through authenticated read-only discovery and an in-memory process handoff. No
credential was printed, persisted, changed or rotated. The direct SSL endpoint,
exact `rezno_staging` database and intended owner role authenticated; opening and
final migration states were healthy 41/41 with zero failed or rolled-back rows,
and `prisma migrate deploy` was a no-op.

An initial operator invocation seeded the exact fixture but omitted the Node
`react-server` condition required by a server-only smoke import. Smoke stopped
before its checks; exact-ID recovery cleanup removed only that fixture and the
immediate second cleanup returned zero. The accepted rerun then produced the
same fixture fingerprint twice:
`b313552ea282376da895de0f9ff0cd264fc47c79a9e00ad144dbb63f8299f6cf`.
Focused smoke passed the 65,536-byte actual limit, false-smaller
`Content-Length` rejection, immediate overflow cancellation, exact raw-byte
order, provider `NOT_CONFIGURED`, all five deterministic outcomes, cursor
isolation, balanced/immutable financial evidence and reconciliation truth.

Final exact cleanup removed 11 intents, 13 attempts, three provider events, two
refunds, seven Journals, 14 Postings, two settlements, 10 compatibility
Payments, three mutations, four accounts and only fixture-owned actors and
targets; its second run returned zero in every category. A canonical SHA-256
over every non-migration public table matched before and after at
`58833ea6299d568e45e19d77b5f6f8e8827c326125e3197b7152ec5f1b81fdc6`,
which also preserves the accepted Stage 3, Stage 4, Gate 5A and Gate 5B
fingerprint matrix. No real payment/refund or physical-device QA was performed.

## Explicit later-stage handoffs

- **Gate 5D:** independent Stage 5 closure, full media/storage/payment cross-gate
  QA, accepted-provider operational decision if available, production runbooks,
  and closure evidence. Gate 5D has not started.
- **Stage 6:** asynchronous provider-event processing, retries, scheduled
  reconciliation/settlement orchestration, durable job queues and operational
  workers. Gate 5C implements synchronous/bounded manual foundations only.
- **Stage 7 physical device:** real iOS/Android hosted-action handoff, deep-link
  return, process-death recovery and physical-device network/browser QA. Gate 5C
  may run Hermes exports but must report physical-device QA as not performed.

## Audit verdict

The repository requires migration 41 and a new canonical intent/attempt/event,
refund, ledger, settlement and reconciliation foundation. The current Payment
model is retained only as an offline/Order compatibility projection. IQD and
server-persisted target totals are authoritative; no provider or nonzero
commission is configured. The architecture can proceed without an irreversible
commercial assumption because production fails closed and zero commission is an
explicit snapshot policy.
