# Platform Jobs Security Review

## Trust boundary

PostgreSQL is the durable coordination authority. A request/session grants no durable authority by itself: current Person and Admin state are revalidated transactionally. A job payload is a versioned server-created reference envelope, never proof of tenant, ownership, identity, permission, inventory, money, asset state, or provider outcome.

The client cannot choose job payload, Organization, handler, command, module, URL, worker identity, lease, fencing generation, error code, result, attempt count, or success. The only manual job type is the inert health probe.

## Findings

No open P0, P1, or P2 finding is accepted for Gate 6A. The following controls are implemented and covered:

| Threat | Control/evidence |
| --- | --- |
| unauthenticated/wrong permission | live routes fail 403 before body consumption; view/manage split |
| revoked Admin | grant and active Person are re-read inside each serializable operation |
| tenant forgery | no client scope input; DB scope check binds Organization ID to canonical scope string |
| cross-tenant detail | platform Admin permission is intentionally global; no business-member route exists and DTO exposes only safe Organization reference |
| arbitrary type/command/module/URL/SSRF | one closed enum and strict payload; no URL fetch, eval, shell, or module resolution |
| secrets/private business data | strict payload rejects credentials, headers, signed URLs, webhook bodies, instruments, VIN, contact/address and unknown text |
| oversized/malformed input | streamed actual-byte 8 KiB limit, exact content type, fatal UTF-8, strict JSON schemas |
| idempotency change | actor+key uniqueness plus canonical request hash; changed replay conflicts |
| concurrent claim | locked `SKIP LOCKED` claim and unique attempt constraints |
| stale worker/fencing | random lease token plus monotonic generation required on every execution mutation |
| lease theft | active jobs are outside claim candidates; recovery requires expired timestamp |
| heartbeat abuse | server-internal only, current owner/token/generation, bounded extension and horizon |
| duplicate/changed completion | safe result hash supports exact replay; valid changed replay conflicts |
| raw exception leakage | handler exceptions map to closed safe codes; server logger/HTTP use generic failure |
| retry storm | attempt, batch, delay, catch-up and requeue caps; deterministic bounded backoff |
| cancel/requeue race | serializable row locks and optimistic version; terminal original retained |
| duplicate scheduler tick | actor idempotency plus occurrence dedupe unique key |
| catch-up amplification | maximum ten emitted occurrences; next run skips remaining missed intervals |
| production test override | cursor secret and handler test setters throw in production |
| cursor forgery | HKDF-domain-separated HMAC, constant-time verify, scope/filter/page/kind binding |
| pagination loss | exact six-digit PostgreSQL timestamps, snapshot ordering, UUID tie-breaker |
| database cleanup overreach | exact fixture actor/IDs, dependency-ordered deletion, second-cleanup zero, non-fixture fingerprint |

## Fencing limitations and future handlers

Fencing prevents stale platform workers from committing the platform job result. It cannot retroactively undo an external side effect. Every future Gate 6B/6C handler must re-read authoritative state, use domain-level idempotency, bind the current fencing generation where the domain mutation supports it, and revalidate current scope/authorization immediately before applying a sensitive result. Gate 6A's inert handler has no domain authority to revoke, so the “result after domain scope revocation” case is deliberately non-applicable here rather than simulated.

## Rate limiting

Admin routes use the repository's process-local defense limiter to bound abuse within a runtime instance. This is not represented as distributed protection. Canonical distributed rate limiting remains Gate 6D work.

## Cursor key management

Cursor signing derives a 32-byte key from `BETTER_AUTH_SECRET` using HKDF info `rezno:platform-jobs:cursor-signing:v1`. The source secret is never encoded into a cursor. Rotation invalidates outstanding cursors safely. Production refuses test-key injection.

## Privacy and logging

List/detail DTOs omit payload content/hash, lease token, worker ID, request hash, and raw errors. Worker/owner values are one-way SHA-256 fingerprints. Safe result metadata is a closed 2 KiB object. No request body, exception message, provider response, database URL, credential, authorization header, payment instrument, full VIN, contact or address is intentionally logged or persisted in Gate 6A tables.

## Provider truth

No storage upload, payment, refund, payout, bank settlement, external queue, Redis worker, cron, or provider event is activated. Storage/payment providers remain `NOT_CONFIGURED`; automatic scheduler and always-on worker remain `NOT_CONNECTED`.
