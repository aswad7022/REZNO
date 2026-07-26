# Gate 7C Security Review

Status: **AUTHOR REVIEW COMPLETE — INDEPENDENT REVIEW PENDING**.

## Threat and control matrix

| Threat | Gate 7C control |
| --- | --- |
| Unapproved provider origin receives a session | Server and Mobile require exact source-controlled HTTPS origins. Both production lists are empty. The external browser receives no REZNO cookie or authorization header. |
| Open redirect or crafted return link | The server creates fixed `rezno://payments/return` URLs. Mobile requires the exact scheme, host, path, no credentials/port/fragment, and exactly one allowed value for each of three parameters. |
| State tampering or cross-user/order reuse | HMAC state is purpose-keyed and binds Person, intent, attempt, handoff, nonce, version, and expiry. Database bindings are rechecked under the intent lock. |
| Return replay | The exact PaymentMutation transitions atomically from `PROCESSING` to `COMPLETED`; subsequent consumption receives a stable conflict. Mobile records return receipt before sending it. |
| Startup initial URL overwrites recovered truth | Mobile handles an initial URL only while its manifest is still awaiting a return. A late duplicate for the same terminal intent is ignored and cannot replace the authoritative result. |
| Link outcome creates false financial success | The link outcome is only a UI hint. `CONFIRMED` and `DECLINED` derive exclusively from a freshly authenticated server PaymentIntent. |
| Lost response after state consumption | A replay conflict permits only a read-only PaymentIntent fetch. It cannot repeat a financial/provider mutation. |
| Infinite retry or polling | Three automatic checks, five total checks, bounded 500/1500 ms waits, a five-minute manifest TTL, and explicit user retry. |
| React remount or duplicate link starts duplicate work | The coordinator lives outside React and owns one tokenized runner plus one return promise. Duplicate work is rejected before transport. |
| Account switch leaves a stale runner or crosses sessions | The runner captures one opaque API requester at claim, so later calls keep the original session. The new owner becomes authoritative, aborts the old controller, waits for runner completion, and only then loads its recovery. Release is generation-bound and cannot clear a newer runner. |
| Logout clears authentication while payment work continues | Logout first deactivates and awaits the active runner. Prepare, browser, and verification phases are abortable; a failed logout bootstraps the same owner again. |
| Loading account B destroys account A recovery | Recovery records use a SHA-256-derived SecureStore key per exact bounded Better Auth owner id. Invalid data cleanup is confined to that owner's key. |
| Hosted handoff is confused with reconciliation | A dedicated `CREATE_HOSTED_HANDOFF` mutation action fences idempotency and return consumption from unrelated reconciliation work. |
| A handoff outlives its intent | Creation rejects expired intents and selects the earliest of intent expiry, provider-action expiry, and the five-minute handoff limit. |
| Sensitive state leaks through logs/storage | No checkout URL, signed state, cookie, token, provider response, or payment claim is logged. SecureStore contains only the bounded owner/intent manifest and no session material. |
| Oversized/chunked JSON exhausts memory | JSON bodies are streamed into a fixed 16 KiB buffer, including requests without Content-Length. |
| Browser close is mistaken for provider cancellation | Browser dismissal retains the recovery manifest and reports only that the browser closed. Financial status remains server-authoritative. |

## Provider boundary

`APPROVED_HOSTED_CHECKOUT_ORIGINS` and
`APPROVED_MOBILE_HOSTED_CHECKOUT_ORIGINS` are empty. Enabling a provider
requires a separately reviewed adapter, exact checkout base path, matching
server/Mobile origin entries, provider credentials outside the repository,
and provider-return evidence. Runtime environment variables cannot bypass
the source-controlled policy.

## Data and migration boundary

Gate 7C reuses PaymentMutation and PaymentIntent records. It adds no column,
table, privilege, Prisma model, staging fixture, or production state.
Append-only Migration 50 adds the dedicated `CREATE_HOSTED_HANDOFF` enum value.
Migrations 48 and 49 remain immutable.

Verified SHA-256:

- Migration 48: `04fa9fe4a87c7360ec3eb585951ff49c20e90675c74755d1127d716fbf009192`
- Migration 49: `6cd6ec39cc950600002f0b36529ea08460c539b8ced0176f37fbed2980a74f0c`
- Migration 50: `a16a9c7f2b61c12d35c154e8a4f2f655a568a508118caf46ee88ebe81fbc564d`

## Deferred boundary

Stage 6 remains:

`DEFERRED_BY_OWNER — CODE MERGED, RUNTIME NOT ACTIVATED`

Physical browser/deep-link/process-death evidence, provider receipt truth,
device tokens, APNs/FCM, and integrated release closure belong to Gate 7D.

## Author review result

The final author diff contains no accepted P0, P1, or P2. The focused
security/recovery matrix, all repository Unit/PostgreSQL/HTTP suites, static
validation, production build, native/Web exports, dependency audits, and
scoped secret/privacy scan passed. Root production and Mobile dependency
audits each report zero known vulnerabilities.

The Prisma schema and append-only Migration 50 add only the dedicated handoff
action. The disposable test database applies 50/50 migrations. Stage 6
runtime, staging, production, provider
configuration, physical devices, and PR #100 were not accessed or mutated.
