# Gate 6C Payment Automation Operations

Status: **ACTIVE**. Payment automation is bounded orchestration over accepted
Gate 5C financial truth. It is not a payout system.

## Webhook acceptance

The payment webhook retains the 64 KiB actual-byte stream limit. The configured
provider verifies the signature before business parsing. Only closed,
normalized fields and a SHA-256 payload identity survive; raw body, signature,
authorization, and payment instruments are discarded.

HTTP `202` means the verified event and its exact durable processing job were
committed atomically. It does not mean the payment was captured. An exact
duplicate returns the existing event/job identity. Changed content under the
same provider event ID conflicts. Invalid, malformed, oversized, or unsupported
input creates no event or job.

## Event processing and retries

`PAYMENT_PROVIDER_EVENT_PROCESS` is the only actorless job and must link one
exact event. A current manual worker still needs `PLATFORM_JOBS_MANAGE` and
`PAYMENTS_RECONCILE`. The handler re-reads event, intent, target, amount,
currency, generation, and ledger truth. Duplicate and out-of-order events
resolve deterministically. Full capture is the only capture policy; browser
return state is never authority.

`PAYMENT_RETRY_DISCOVERY` reads at most 50 due retryable attempts/refunds and
creates exact versioned children. It performs no provider work. Attempt retry
derives amount, currency, provider, expiry, and action from locked truth and
reuses the persisted provider request reference. It stops at five and cannot
capture an already captured intent.

Refund retry additionally requires `PAYMENTS_REFUND`. Capacity is
`captured - refunded - other reservations`. Reservations include `REQUESTED`,
`PROCESSING`, and `FAILED` rows with `retryable=true`, a retry time, a stable
provider request reference, and fewer than five retries. Success,
cancellation, permanent failure, and retry exhaustion release capacity.

Before every provider retry the service locks the PaymentIntent and then the
exact PaymentRefund, re-reads exact Decimal totals, excludes the current
refund once, and claims it only when the amount fits. A rejected retry makes
zero provider calls, changes no provider identity, posts no journal, and
finishes its PaymentMutation safely.

Exact attempt and refund jobs use `platform-job:<jobId>` as stable ownership
and the existing row `version` as a monotonic claim generation. Claim and
reclaim increment the generation. Apply and recovery updates require exact
`{id, state, owner, generation}`; stale execution A cannot publish, fail, or
clean newer execution B. Live claims yield a bounded retryable result, and a
manual refund replay returns stable in-progress truth rather than surfacing an
exception that could become HTTP 500. Provider uncertainty replays the stable
request reference. A verified capture event supersedes an in-flight attempt
by cancelling and finishing it without a second capture journal.

## Reconciliation and settlement statements

Reconciliation is bounded read/compare work. It returns closed counts for
`MATCHED`, `PROVIDER_AHEAD`, `DATABASE_AHEAD`, `LEDGER_MISMATCH`,
`TARGET_STATE_MISMATCH`, `MISSING_PROVIDER_RECORD`, and `NOT_CONFIGURED`. It
does not change payment, refund, Order, Booking, posted journal, or settlement
truth.

Settlement generation derives the previous closed UTC day, IQD, and eligible
Organizations from posted ledger truth. It creates at most 50 canonical DRAFT
batches with at most 500 lines each. The database permits only one DRAFT per
Organization/currency/period. Automation cannot finalize, void, pay, transfer,
select a bank account, or claim remittance.

## Staging and recovery

The exact fixture uses deterministic providers only. Successful synthetic
posting is verified in serializable rollback-only evidence and the PostgreSQL
suite because posted journals/postings are intentionally immutable and cannot
be removed by exact cleanup. Persistent staging smoke uses duplicate/ignored
events and transient retries, proving durable orchestration without fabricating
permanent financial history.

On incident, disconnect invocation, inspect provider and canonical ledger
truth, and requeue only after establishing external-side-effect state. Never
edit a posted journal, posting, captured/refunded total, event hash, or
settlement line. Providers, automatic runtime, and bank payout remain
unconnected in Gate 6C.
