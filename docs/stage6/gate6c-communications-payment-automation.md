# Gate 6C — Communications and Payment Automation

Status: **ACTIVE**. Gate 6A and Gate 6B are accepted and merged. Gate 6D,
Stage 7, Stage 8, and AI work remain unstarted.

## Verified baseline

- Repository: `aswad7022/REZNO`.
- Exact base: `f58ac881746b72042e483629a0952f790302603b`, the merge commit
  of PR #126.
- Repository and authenticated staging baseline: 47 healthy migrations.
- PR #100 remains an untouched Open Draft at
  `e46454df993ecccb06180060dda4353ec88e2641`.
- Production outbound communication, payment, storage, external queue,
  automatic scheduler, and always-on worker providers remain respectively
  `NOT_CONFIGURED` or `NOT_CONNECTED`.

## Objective

Gate 6C connects the accepted communication and payment lifecycles to the
accepted PostgreSQL durable-job foundation. It automates only bounded
discovery and exact-item operations. It does not replace campaign, delivery,
payment-intent, attempt, refund, provider-event, ledger, or settlement truth.

## Authority and revocation

Every job payload contains strict internal references only. A handler reloads
the authoritative domain row and its expected version, validates its current
state, and revalidates both the current platform-operation authority and the
domain permission:

| Family | Required current permissions |
| --- | --- |
| Communication discovery and dispatch | `PLATFORM_JOBS_MANAGE`, `COMMUNICATIONS_DISPATCH` |
| Provider-event processing and reconciliation | `PLATFORM_JOBS_MANAGE`, `PAYMENTS_RECONCILE` |
| Payment-attempt retry | `PLATFORM_JOBS_MANAGE`, `PAYMENTS_RECONCILE` |
| Refund retry | `PLATFORM_JOBS_MANAGE`, `PAYMENTS_REFUND`, `PAYMENTS_RECONCILE` |
| Draft settlement generation | `PLATFORM_JOBS_MANAGE`, `SETTLEMENTS_MANAGE` |

Authorization is revalidated before claim, before handler start, immediately
before provider work, immediately after provider work, and before publishing a
domain result. Revocation, suspension, grant expiry, allowlist removal, tenant
change, stale job lease, or changed domain generation fails closed. A job,
schedule, browser request, or provider callback is never durable authority.

## Closed job registry

Gate 6C adds exactly ten job types:

| Job type | Reference-only payload | Purpose |
| --- | --- | --- |
| `COMMUNICATION_CAMPAIGN_DISCOVERY` | bounded batch | discover due scheduled campaigns |
| `COMMUNICATION_DELIVERY_DISCOVERY` | bounded batch | recover/discover due outbound deliveries |
| `COMMUNICATION_CAMPAIGN_DISPATCH` | campaign ID and expected version | snapshot/start one exact campaign |
| `COMMUNICATION_DELIVERY_DISPATCH` | delivery ID and expected version | dispatch one exact due delivery |
| `PAYMENT_PROVIDER_EVENT_PROCESS` | provider-event ID and expected version | process one already authenticated event |
| `PAYMENT_RETRY_DISCOVERY` | bounded batch | discover exact due attempt/refund retry work |
| `PAYMENT_ATTEMPT_RETRY` | attempt ID and expected version | retry one exact payment attempt |
| `PAYMENT_REFUND_RETRY` | refund ID and expected version | retry one exact refund |
| `PAYMENT_RECONCILIATION` | bounded batch | compare provider and canonical payment truth |
| `SETTLEMENT_STATEMENT_GENERATE` | bounded period reference | create eligible draft statements |

The closed schemas reject unknown fields and prohibit copy, recipient contact,
endpoint, URL, provider selection, provider reference, webhook body, signature,
payload hash, amount, currency, commission, balance, bank details, credentials,
authorization headers, arbitrary metadata, module, command, or executable
input. Exact handlers derive all such values from current canonical rows.

## Closed schedule registry

Gate 6C adds five platform-scoped schedule keys:

- `COMMUNICATION_CAMPAIGN_DISCOVERY`;
- `COMMUNICATION_DELIVERY_DISCOVERY`;
- `PAYMENT_RETRY_DISCOVERY`;
- `PAYMENT_RECONCILIATION`;
- `SETTLEMENT_STATEMENT_GENERATE`.

Each key maps one-to-one to its allow-listed job type. A schedule can be
created only through guarded operator/fixture code and starts disabled.
Migration 48 creates no schedules or jobs. Automatic production invocation
remains `NOT_CONNECTED`; authorized bounded manual scheduler ticks and worker
batches remain the only connected execution path.

## Communications automation

Campaign discovery reads at most 50 due `SCHEDULED` campaigns using indexed,
deterministic ordering and enqueues exact campaign/version jobs. Campaign
dispatch invokes the accepted bounded audience snapshot and preserves the
5,000-recipient ceiling, the single canonical in-app Notification, immutable
recipient identity, consent, verified endpoint, Organization/membership/role,
and cancellation rechecks.

Delivery discovery first makes expired domain claims recoverable through the
accepted dispatcher policy, then reads at most 50 due delivery rows and
enqueues exact delivery/version jobs. Exact delivery dispatch retains:

- one delivery per campaign, Person, and channel;
- one attempt per delivery and attempt number;
- maximum five attempts;
- backoff of one minute, five minutes, thirty minutes, two hours, and twelve
  hours;
- stable provider idempotency key `communication-delivery:<deliveryId>`;
- `ACCEPTED` meaning provider acceptance only, never human delivery;
- no per-recipient Notification fanout for in-app campaigns;
- just-in-time endpoint resolution with no raw endpoint in job, audit, result,
  DTO, or log.

Production providers remain `NOT_CONFIGURED`. The deterministic sink remains
restricted to its accepted non-production/staging guards.

## Authenticated provider-event ingestion

The HTTP route retains the accepted streamed 64 KiB actual-byte limit. Provider
configuration and rate limits are checked before reading the body. Signature
verification occurs before parsing. The raw body is discarded after
verification and is never stored or copied into a job.

One transaction inserts or resolves the exact authenticated
`PaymentProviderEvent` and its exact `PAYMENT_PROVIDER_EVENT_PROCESS` job.
`PROVIDER_EVENT` is the only actorless source and is valid only when:

- both actor IDs, schedule ID, and parent job ID are null;
- one exact provider-event foreign key is present;
- the job type is `PAYMENT_PROVIDER_EVENT_PROCESS`.

Exact duplicate delivery returns the existing event/job pair. A historical
verified event missing its job may safely acquire the one missing canonical
job. Changed duplicate content conflicts. Invalid signature, malformed or
unsupported event, unconfigured provider, or oversized input creates zero
event and job rows.

The worker applies the event asynchronously from normalized, bounded fields
persisted only after authentication. It rechecks the current event generation,
payment intent, amount/currency, full-capture rule, duplicate-capture rule,
provider reference, ledger identity, job lease/fence, and current joint
authority before publication. Browser return data is never authority.

## Payment retries

Retry discovery scans at most 50 retryable due payment attempts and refunds in
deterministic order and enqueues exact ID/version jobs. It never performs a
provider call.

Exact attempt retry preserves the accepted full-capture-only contract, maximum
attempt bound, and stable provider request reference already owned by the
attempt. It cannot create a second capture or change amount, currency,
provider, intent, or idempotency identity.

Exact refund retry uses one persisted provider request reference for every
attempt. Refund reservation subtracts `REQUESTED` and `PROCESSING` refunds from
the captured-minus-completed-refunds balance while holding the payment intent
lock, preventing concurrent over-refund. Transient failures become bounded due
retry work; permanent and `NOT_CONFIGURED` failures are terminal. A stale
provider result cannot publish.

## Reconciliation

Reconciliation remains read/compare/audit only. It processes at most 50
eligible intents and preserves the accepted classifications:

- `MATCHED`;
- `PROVIDER_AHEAD`;
- `DATABASE_AHEAD`;
- `LEDGER_MISMATCH`;
- `TARGET_STATE_MISMATCH`;
- `MISSING_PROVIDER_RECORD`;
- `NOT_CONFIGURED`.

It never mutates payment, refund, order, booking, ledger, or settlement truth.
Safe bounded results and audit metadata omit credentials, webhook content,
instruments, contacts, and raw provider responses.

## Settlement statements

Settlement generation reads bounded posted journal truth for one closed,
server-derived period and creates `DRAFT` batches only. It retains the accepted
maximum of 500 journal lines per batch and server-calculated totals. A unique
organization/currency/period draft identity prevents concurrent duplicates.
Automation never finalizes, voids, pays, transfers, or claims a bank payout.

## Migration 48

Migration 48 is the only Gate 6C migration. It:

- adds the closed job, source, and schedule enum values;
- adds the canonical provider-event/job linkage;
- adds exact domain generations, retry eligibility/timing, and stable refund
  request identity needed by exact-item automation;
- adds only justified due-scan and uniqueness indexes;
- replaces affected nullable checks with explicit TRUE/FALSE truth tables;
- fails closed with sanitized preflight counts if existing rows violate the new
  invariants;
- creates no job, schedule, event, attempt, refund, settlement, actor, tenant,
  or provider row.

Migrations 1–47 remain byte-for-byte immutable. Fresh 1→48 rehearsals A and B,
populated 47→48 rehearsal, second-deploy no-op, and checksum evidence are
required before staging.

## HTTP, DTO, and operations boundary

Gate 6C exposes only no-store Admin status and bounded allow-listed trigger
routes following the existing Next.js route-handler conventions. Bodies use
streamed actual-byte limits, fatal UTF-8, strict JSON, UUID idempotency, and
reject unknown/duplicate fields and query strings. Responses contain safe IDs,
versions, counts, classifications, and runtime/provider truth only. They omit
payload contents/hashes, amounts, currency, contacts, endpoints, provider
references, raw events, signatures, request hashes, lease/fence tokens, and
credentials.

Process-local rate limiting remains defense in depth. Distributed rate limits,
automatic runtime connection, metrics/alerts/incidents, and Stage 6 closure
remain Gate 6D.

## Security acceptance

Gate 6C cannot close with an open P0, P1, or P2. Review and tests must cover
current/revoked authority, forged type/scope/payload, stale generation and
fence, duplicate discovery/event/provider calls, crash recovery, retry
amplification, communication consent and recipient revocation, raw contact and
copy leakage, webhook authentication/order/bounds, duplicate capture,
concurrent over-refund, ledger immutability, reconciliation non-mutation,
duplicate settlement drafts, no auto-finalization/payout, provider
`NOT_CONFIGURED` truth, staging-only hook production rejection, and bounded
work throughout.

## Staging and closure boundary

Authenticated staging must start healthy at 47/47, attest the accepted direct
TLS identity without printing credentials, apply only Migration 48, reach
48/48, and prove the second deploy is a no-op. The deterministic exact-ID
fixture must run twice with one fingerprint; Gate 6C plus Stage 4C/4D, Gate
5C/5D, and Gate 6A/6B successor smokes must pass; exact cleanup must run twice
and preserve the non-fixture fingerprint.

The composed fixture reuses Stage 4C and Gate 5C identities and domain rows,
then adds only exact `6c…` campaign, delivery, event, refund, schedule, job,
attempt, and mutation rows. Financial success evidence is rollback-only:
posted journals and postings are intentionally immutable, so a cleanup-safe
real-staging fixture must never create a successful artificial capture or
refund and later attempt to erase it. Persistent staging execution therefore
proves authenticated event replay/ignore behavior, transient retry behavior,
reference stability, reconciliation non-mutation, and no-payout truth.
Successful capture/refund posting and DRAFT settlement calculation are proven
inside serializable rollback-only evidence plus the complete PostgreSQL suite.
This is a preservation control, not a weaker financial assertion.

Application rollback disconnects invocation and deploys the previous code while
retaining additive schema and durable evidence. No migration or enum value is
automatically reversed, and no operator edits financial or communication truth.

Gate 6C remains ACTIVE until complete local validation, rehearsals, security
review, staging evidence, exact-head CI/Vercel, independent review, and merge.
Its pull request remains Draft. Gate 6D must not start here.

Authenticated staging completed the required 47/47→48/48 migration, identical
two-seed fixture fingerprint, 47-check Gate 6C smoke, all six successor
smokes, exact cleanup with a zero second run, unchanged foreign sentinels, and
restoration of the original non-fixture database fingerprint. This evidence
does not close the gate: exact-head local validation, CI/Vercel, Draft PR
review, and independent acceptance remain required.
