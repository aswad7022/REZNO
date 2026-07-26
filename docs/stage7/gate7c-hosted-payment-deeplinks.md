# Gate 7C — Hosted Payment and Deep-Link Recovery

Status: **AUTHOR VERIFIED — INDEPENDENT REVIEW PENDING — PROVIDER NOT CONFIGURED — PHYSICAL DEVICE NOT RUN**.

Base: `1cf1b9e15de17e49bef3f469b8d99ea498212821`, the merge commit of PR #130.

Gate 7C closes the repository lifecycle for a hosted payment handoff and its
Mobile return. It does not configure a provider, claim a real payment result,
activate Stage 6, modify a database, add device tokens, begin Gate 7D, submit
an application, or touch production.

## Server handoff

The authenticated customer creates a handoff for an existing
`REQUIRES_ACTION` PaymentIntent through a bodyless, queryless endpoint with a
UUID idempotency key. The server:

1. resolves the current Person and customer scope;
2. locks and verifies the exact PaymentIntent and latest PaymentAttempt;
3. requires an unexpired provider action;
4. resolves an exact source-controlled checkout-origin policy before writing;
5. stores a short-lived handoff in the existing PaymentMutation table;
6. signs an opaque return state with a purpose-derived HMAC key bound to the
   Person, intent, attempt, handoff, nonce, and expiry;
7. returns fixed success, failure, and cancel links under only
   `rezno://payments/return`.

The current server allowlists for `NOT_CONFIGURED` and `DETERMINISTIC_TEST`
are empty. Production therefore returns the stable provider-not-configured
error and creates no handoff record. The deterministic provider policy exists
only behind guarded test injection.

## Return and financial truth

The return endpoint accepts only a bounded JSON object containing the signed
state. It rejects unknown fields, query parameters, oversized streams,
tampering, cross-Person/cross-intent use, expiry, and replay.

Consumption atomically changes only the exact handoff mutation from
`PROCESSING` to `COMPLETED`. It does not capture, authorize, fail, cancel, or
otherwise change financial state. The returned PaymentIntent is the current
server state; Mobile never treats the deep-link `outcome` hint as financial
proof.

## Mobile lifecycle

Mobile uses `expo-web-browser` with an ephemeral authentication session. A
module-owned coordinator, independent of React mounting and locale changes,
owns one operation at a time:

- exact checkout origins are source-controlled and empty until approval;
- the return shape has exactly one `intentId`, `outcome`, and signed `state`;
- warm links share the current runner and one return-consumption promise;
- cold links load an owner-bound SecureStore manifest;
- a return is durably marked received before server consumption;
- a lost consumption response falls back only to read-only PaymentIntent
  status after the server reports the state already consumed;
- verification is bounded to three automatic and five total attempts;
- checkout closure preserves recovery and never claims financial cancellation;
- manifest expiry is five minutes and cleanup is idempotent;
- account change aborts and quiesces the old runner before the new owner may
  recover or start work.

The runner owns its AbortController, completion promise, owner ID, intent ID,
generation token, and one opaque in-memory REZNO API requester captured at
claim. Handoff, return consumption, and status verification therefore cannot
switch to a later account cookie mid-operation. A stale `finally`, duplicate
link, duplicate tap, or old account cannot release or mutate the current
runner.

## User-visible states

`ar`, `en`, and `ckb` cover preparing, browser opening, waiting return,
verification, confirmed, declined, browser closed, invalid/replayed link,
expiry, retryable server ambiguity, pending confirmation, and unavailable
provider. Retry never creates a second handoff while a durable operation
exists.

## External boundary

- No provider checkout origin or credential is approved.
- No real hosted page or financial success is exercised.
- No migration or Prisma schema change is required.
- No staging/production database or environment is accessed.
- No EAS build, update, store submission, or physical-device result is
  claimed.
- Physical warm/cold link, browser, process-death, and poor-network validation
  remains explicit Gate 7D evidence.
