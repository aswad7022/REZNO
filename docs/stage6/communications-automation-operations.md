# Gate 6C Communications Automation Operations

Status: **ACTIVE**. These operations are manual and bounded until Gate 6D
accepts an automatic runtime.

## Connected operator surface

The safe status endpoint is `GET /api/admin/platform-jobs/gate6c`. The bounded
manual trigger is `POST /api/admin/platform-jobs/gate6c/trigger`.

The trigger accepts only a UUID idempotency key, a batch size of 1–50, and one
of:

- `COMMUNICATION_CAMPAIGN_DISCOVERY`
- `COMMUNICATION_DELIVERY_DISCOVERY`
- `PAYMENT_RETRY_DISCOVERY`
- `PAYMENT_RECONCILIATION`
- `SETTLEMENT_STATEMENT_GENERATE`

Exact campaign or delivery jobs cannot be created from this route. Operators
use the accepted Gate 6A worker, scheduler, schedule-state, cancel, and requeue
operations. Every response is `no-store` and omits message copy, contacts,
endpoints, provider references, payloads, hashes, leases, and fencing values.

## Campaign discovery

Campaign discovery reads a maximum of 50 `SCHEDULED` campaigns whose
`scheduledAt` is due, ordered by timestamp and UUID under `SKIP LOCKED`. It
creates one canonical exact campaign/version job. Repeated discovery reuses
the canonical child identity. Cancelled, stale, already-dispatching, or
terminal campaigns create no new dispatch work.

The exact campaign handler delegates to the accepted Stage 4C lifecycle. That
service owns recipient snapshot semantics, the 5,000-recipient ceiling, the
one canonical in-app Notification, and delivery construction. The job contains
no audience copy or endpoint data.

## Delivery discovery and dispatch

Delivery discovery first releases expired Stage 4C claims through the accepted
retry policy, then scans at most 50 due `PENDING` or `RETRY_SCHEDULED` rows
belonging to `DISPATCHING` campaigns. It creates exact delivery/version jobs
and performs no provider call.

Exact dispatch:

1. revalidates current platform and communication authority;
2. claims only the exact current delivery generation;
3. re-reads campaign, Person, audience membership, consent, verified endpoint,
   and endpoint fingerprint;
4. performs provider work outside a long database lock using stable delivery
   identity;
5. revalidates authority and lease after provider work;
6. publishes one sanitized immutable attempt result and canonical state.

Revocation after a provider call leaves the attempt unfinished and publishes
neither provider result nor campaign success. `ACCEPTED` means provider
acceptance only. It is never human delivery proof.

## Retry, incident, and rollback

The attempt limit is five. Delays are one minute, five minutes, thirty minutes,
two hours, and twelve hours. Permanent failure and `NOT_CONFIGURED` are
terminal. Cancellation prevents later claim. A stale job returns a closed
stale/superseded result.

During an incident, keep automatic runtime disconnected, disable the affected
persisted schedule if manually enabled, inspect safe job/delivery state, and
establish any external provider acceptance before bounded requeue. Never edit
rows directly.

Production email, SMS, and push providers remain `NOT_CONFIGURED`. The
deterministic sink is staging/test only and refuses production injection.
Application rollback disconnects invocation and deploys the prior build; it
does not erase campaign, delivery, attempt, or job evidence. Automatic
scheduling, continuous workers, receipts, and delivery telemetry remain Gate
6D work.
