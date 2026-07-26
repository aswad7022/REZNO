# Gate 7D Security Review

Status: **PASS_CODE_REVIEW — EXTERNAL SECURITY VALIDATION DEFERRED BY OWNER**.

## Assets and trust boundaries

| Asset | Authority | Repository control |
| --- | --- | --- |
| Mobile session | Better Auth server | Captured session request; exact Gate 7A API origin |
| Installation identity | Physical app installation | Random UUID plus 256-bit SecureStore secret |
| Native token | APNs/FCM | Server-side AES-256-GCM ciphertext; no Mobile persistence |
| Recipient binding | PostgreSQL | Person-scoped transaction and installation proof |
| Delivery result | Provider adapter/receipt bridge | Fenced target plus authenticated receipt |
| Notification route | Mobile policy | Typed destination and UUID validation only |

## Controls

- Strict 8 KiB customer bodies and 64 KiB receipt batches; unknown fields,
  mixed platform/provider pairs, malformed tokens, weak installation secrets,
  invalid UUIDs, unsafe provider codes, and oversized batches are rejected.
- Rate-limit store failure is checked before exhaustion and fails closed with
  503. Authentication and active onboarded Person resolution precede mutation.
- Registration mutations are serialized by sorted advisory locks and
  `SERIALIZABLE` transactions. Reusing an idempotency key with a different
  request hash fails.
- A monotonically increasing, SecureStore-backed operation generation is
  persisted with the installation proof. A newer revoke fences delayed
  register requests across retries, logout, and account switching, including
  revoke-before-first-register ordering.
- The installation secret hash proves ownership. Account switching may move
  only the same proven installation. A raw token already active for a
  different unproven Person cannot be claimed.
- AES-GCM associated data binds ciphertext to installation and provider.
  Missing/invalid key material fails closed; no plaintext fallback exists.
- Revoked and provider-invalidated rows retain only random deletion
  tombstones in the token ciphertext/fingerprint fields. Raw reusable token
  material is cryptographically erased from the application database while
  constrained delivery history remains auditable.
- The database permits one active row for a token fingerprint and constrains
  platform/provider pairs, terminal timestamps, hashes, attempts, and receipt
  syntax.
- Fanout resolves only current active and granted/provisional installations.
  It also revalidates the current Person as active, onboarded, and not deleted
  at provider execution time.
  It passes an opaque Person/digest reference through communications; raw
  tokens never enter `OutboundDelivery`.
- Target status, claim generation, and the send-time installation token
  generation fence every provider result. Direct invalid-token results and
  authenticated late receipts can erase only the generation they actually
  targeted; rotation makes stale feedback harmless. Accepted/delivered targets
  are terminal. Unknown results are not blindly resent, and retryable targets
  stop after three attempts.
- APNs/FCM configuration requires an explicit staging/production push
  environment that matches provider environment. Staging cannot select the
  APNs production host.
- Receipt authentication is verified before provider configuration truth is
  disclosed. Timestamps expire after five minutes and HMAC comparison is
  constant-time.
- Event replay is serialized independently from target state. A reused event
  ID with changed data is rejected. Older events and non-delivered events
  cannot downgrade delivered state.
- Raw tokens, provider keys, HMAC material, cookies, payload bodies, image
  content, and customer identifiers are not logged by Gate 7D code.
- Mobile API requests retain Gate 7A exact-origin enforcement. Notification
  data cannot supply a scheme, host, path, or arbitrary navigation action.
  `CUSTOMER_MESSAGES` intentionally routes to the messages hub without an
  invented target identifier; all entity-specific destinations still require
  exact UUID targets.
- Logout is conditional on confirmed bounded revocation. An offline revoke
  does not allow the UI to remove the authenticated session and leave the
  old account's device binding live.

## Fail-closed operational truth

All provider and receipt variables are blank in `.env.example`. No secret is
tracked, and no GitHub/Vercel/EAS environment is changed here. Missing token
encryption configuration rejects registration. Missing provider configuration
returns `NOT_CONFIGURED`; it never creates a synthetic acceptance or receipt.

## Remaining external security validation

- inspect Apple/Google credential scopes and environment separation without
  copying credentials into evidence;
- prove signed binaries use the expected identifiers and entitlements;
- prove APNs/FCM invalid-token and receipt behavior on real provider systems;
- prove logout/account switching and notification-open isolation on physical
  iPhone and Android;
- repeat media, weak-network/process-death, and hosted-return scenarios from
  Gates 7B/7C.

Until those checks pass, security closure is
`DEFERRED_BY_OWNER — CODE MERGED, EXTERNAL VALIDATION NOT COMPLETED`, not
Stage 7 `CLOSED` or `PASS`. The independent repository review found zero
P0/P1/P2 issues; that result does not prove any physical-device or provider
row above.
