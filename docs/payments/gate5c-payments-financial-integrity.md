# Gate 5C — Payments and Financial Integrity Foundation

Status: architecture audit complete; implementation pending  
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

Migration 41 will preserve `Payment` as a clearly documented derived
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

The Gate 5C integration will add explicit safe payment DTOs and a single mapping
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

Gate 5C will add `PARTIALLY_REFUNDED` and `REFUNDED` to the compatibility
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
collects card data. Webhook input is read once, size-bounded, signature-verified
before business parsing, normalized, hashed and discarded. Only a safe event
identifier, payload hash, normalized type, safe provider reference/code and
processing state persist. Return routes are fixed same-origin UX views and
cannot mutate financial state or redirect arbitrarily.

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

No payment-specific Admin permission exists. Migration/code will add:

- `PAYMENTS_VIEW`
- `PAYMENTS_REFUND` (depends on `PAYMENTS_VIEW`)
- `PAYMENTS_RECONCILE` (depends on `PAYMENTS_VIEW`)
- `SETTLEMENTS_VIEW`
- `SETTLEMENTS_MANAGE` (depends on `SETTLEMENTS_VIEW`)

Existing idempotency ledgers are target-specific: Checkout idempotency, Order
mutation histories, Admin mutations, Booking create/cancel/change mutations,
notification event keys, communication mutations, and storage/media mutations.
None can safely represent provider attempts, refunds, events, settlement or
reconciliation. `PaymentMutation` will bind actor, scope, action, target,
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

## Migration 41 decision and integrity plan

Migration 41, `payments_financial_integrity_foundation`, is required. It will be
forward-only and the sole Gate 5C migration. Migrations 1–40 remain byte-for-byte
unchanged. It will add the canonical models/enums/indexes/checks, exact-target
constraint, amount/capture/refund/commission/net bounds, currency checks,
positive versions/postings, attempt/event/mutation uniqueness, posted-ledger
balance and immutability triggers, reversal validity, and settlement inclusion
protection.

It will preserve all Order, Booking and Payment history. Existing Payment rows
remain visibly pre-ledger by nullable canonical linkage/no journal evidence. No
historical capture, provider identity, commission, refund or journal will be
backfilled. Booking receives explicit IQD/payment compatibility fields because
the existing system contract is IQD; this is a truthful target projection, not
fabricated payment evidence.

Required rehearsal is fresh 1→41 twice, populated 40→41, then real staging
40/40→41/41 without reset or `db push`.

## Performance plan

All list paths are bounded and index-backed by owner/scope, status and
`(createdAt,id)`. Target intent lookups use unique/partial indexes on Order or
Booking plus generation. Attempts use `(paymentIntentId,attemptNumber)`. Provider
events use `(provider,eventId)` and provider reference. Refund balance comes from
locked intent totals plus bounded active refunds, not an unbounded JavaScript
sum. Journals/postings use source and account/currency/time indexes. Merchant
payable and settlement candidates aggregate exact PostgreSQL numeric values.
Settlement inclusion has a unique active-finalized constraint. Reconciliation
uses a bounded cursor batch. Provider calls never occur while database locks are
held. Query plans will be recorded after schema implementation on populated
PostgreSQL data.

## Notifications, audit, and UX integration plan

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

No baseline P0/P1/P2 payment vulnerability is reachable because online payment
does not yet exist. The implementation must prove ownership/tenant/current-access
checks, amount/currency/commission authority, provider and callback allowlists,
no client success transition, exact-once capture/refund/event processing,
over-refund locking, late/out-of-order classification, webhook timing-safe
signature and replay bounds, scope-bound idempotency/cursors, immutable balanced
ledger, valid reversals, unique settlement inclusion, Decimal capacity, safe
errors/DTOs/logs, production deterministic-provider denial, and fixture/cleanup
guards. A remaining P0/P1/P2 prevents Ready for Review.

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
