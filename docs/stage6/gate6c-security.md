# Gate 6C Security Review

Status: **ACTIVE**. No open P0, P1, or P2 is acceptable before independent
review.

## Trust and authority

PostgreSQL domain rows are authoritative. A payload, campaign creator,
historical Admin, browser, provider callback, or schedule is never authority.
The worker actor must retain current `PLATFORM_JOBS_MANAGE` plus the exact
closed domain permissions before claim, at handler start, around provider work,
and before publication. Suspension, revocation, grant expiry, or stale
lease/fence fails closed.

`PROVIDER_EVENT` records provenance only. Its job is actorless and valid only
for `PAYMENT_PROVIDER_EVENT_PROCESS` with one exact event foreign key. It does
not create a service principal.

## Control matrix

| Threat | Control |
| --- | --- |
| arbitrary work/type | closed ten-type registry and strict versioned schemas |
| contact/copy leakage | jobs store internal IDs/versions only; DTOs omit payload |
| cross-recipient dispatch | current Person, audience, membership, consent, endpoint and fingerprint revalidation |
| duplicate provider send | exact claim, stable idempotency, unique attempt number |
| revocation during send | post-provider authority/lease guard before publication |
| human-delivery overclaim | `ACCEPTED` is provider acceptance only |
| invalid webhook | signature verification before parsing/persistence |
| raw webhook leakage | raw body/signature discarded; normalized fields only |
| duplicate/changed event | provider+event uniqueness and exact payload hash |
| duplicate capture | locked totals, full-capture policy, unique journal source |
| over-refund/race | locked reserved balance and stable refund identity |
| retry amplification | bounded scan, five retries, backoff, terminal failures |
| exact handler timeout | closed Gate 6C 15-second bound below the 30-second lease; discovery remains at five seconds and abort guards block publication |
| posted-ledger mutation | PostgreSQL immutable journal/posting triggers |
| reconciliation correction | classification-only; no state mutation |
| settlement duplication | one DRAFT per Organization/currency/period |
| automatic finalization/payout | DRAFT-only handler and no payout path |
| stale worker | operation/job leases, random token, monotonic fencing |
| secret/error leakage | closed safe errors/results and artifact scans |
| staging cleanup overreach | exact IDs, ordered deletion, sentinels, second zero |
| production test adapter | deterministic provider setters reject production |

## Payload and response exclusions

Jobs and responses must not contain message content, email, phone, push token,
endpoint fingerprint, raw provider response, webhook body/signature,
authorization header, PAN/CVV, bank account/IBAN, payment token, amount,
client currency, commission, refund amount, settlement total, payout
destination, arbitrary URL, SQL, command, module, or credential.

Safe reconciliation counts and exact-item closed states are allowed. Provider
references remain domain-private and are not copied into job metadata.

## Database integrity

Migration 48 supplies explicit NULL truth tables for source/schedule/parent/
actor/event combinations, verified-event money completeness, retry states,
claim states, retry bounds, and stable refund request references. It adds the
provider-event restrictive foreign key, due-scan indexes, and canonical DRAFT
uniqueness. It creates no rows and leaves Migrations 1–47 unchanged.

Direct PostgreSQL tests exercise nullable-field bypasses, source mismatch,
concurrent dedupe, single-winner claim, stale generation, duplicate capture,
over-refund, journal duplication, and DRAFT duplication.

## Residual boundaries

Process-local route limiting is defense in depth, not distributed protection.
Metrics, alerts, incident automation, service principal, automatic scheduler,
always-on worker, receipts, and runtime activation remain Gate 6D. Email,
SMS, push, payment, and bank providers remain `NOT_CONFIGURED`; scheduler and
worker remain `NOT_CONNECTED`.

## Staging credential response

The 2026-07-23 staging run treated one operator-output connection-string
exposure as an actual credential incident. The exact `rezno-staging` role was
rotated immediately, the prior credential was proved invalid with PostgreSQL
`28P01`, and only the confirmed staging Vercel Production and Preview
consumers were updated and redeployed. The replacement credential passed
direct non-pooler TLS 1.3, certificate, hostname, role, database, and Prisma
physical-client attestation. Repository, history, build, export, and temporary
artifact scans must show zero value matches before the Draft PR is published.
