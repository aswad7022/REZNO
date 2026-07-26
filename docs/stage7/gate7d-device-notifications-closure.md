# Gate 7D — Device Notifications and Stage 7 Closure

Status: **AUTHOR IMPLEMENTATION — EXTERNAL VALIDATION REQUIRED**.

Base: Gate 7C merge commit
`61bfa6088dc299ba3fa68e400e16d70e419e122f`.

Gate 7D closes the remaining repository gap for native device tokens and
provider receipt truth. It does not activate Stage 6, configure a real
provider, change staging/production databases, submit a store build, or claim
physical-device evidence.

## Implemented contract

- Expo asks for notification permission only from the account UI. Existing
  granted/provisional permission is restored without another prompt; denial is
  explicit and offers device settings.
- A random installation UUID and 256-bit installation secret are held in
  `SecureStore` with this-device-only accessibility. The raw push token is
  never stored by Mobile.
- The authenticated registration route binds installation proof, current
  Person, platform, provider, permission, and token. Registration, rotation,
  account transfer on the same proven installation, and revocation are
  transactionally serialized and UUID-idempotent.
- Every operation advances a SecureStore-backed installation generation.
  PostgreSQL records the generation with the installation-secret hash, so a
  delayed registration cannot reactivate an installation after a newer
  revoke—even when the first registration had not created its row yet.
- Tokens are AES-256-GCM encrypted with installation/provider associated data.
  Only a SHA-256 fingerprint participates in endpoint selection. API results,
  audit-style mutation results, and logs never contain a raw token.
- Revocation and provider invalidation replace the encrypted token and its
  fingerprint with unlinkable deletion tombstones. Historical target/receipt
  truth remains, but reusable token material does not.
- A token has at most one active installation. Multiple installations may be
  active for one Person and a logical PUSH delivery fans out once per active
  installation.
- Each device target has a three-attempt ceiling and a claim generation.
  Accepted targets are not resent. An ambiguous transport result becomes
  `UNKNOWN` instead of being blindly retried.
- APNs uses the exact Apple HTTP/2 origins and token JWT authentication. FCM
  uses the exact Google OAuth and FCM v1 origins. Both are fail-closed unless
  the complete, environment-matched configuration exists.
- Provider receipts require an exact enabled provider, a five-minute timestamp
  window, and HMAC-SHA256 authentication. Provider event IDs are atomic replay
  keys. Stored receipt data is bounded and sanitized; raw responses are not
  retained.
- Definitive invalid-token results disable that installation. Delivered truth
  cannot be downgraded by an older or weaker receipt.
- Notification-open routing accepts only typed Customer destinations and UUID
  targets. It never opens a URL supplied by notification data.
- Logout attempts bounded authenticated revocation before the session is
  removed. If revocation cannot be confirmed, logout fails closed and the
  still-authenticated owner is re-registered; the app never reports a logout
  while knowingly retaining the old account binding.

## Database

Gate 7C already consumed append-only Migration 50. Gate 7D therefore adds the
next append-only migration, Migration 51:

`20260726203000_device_push_notifications`

It adds `PushInstallation`, `PushInstallationMutation`,
`PushDeliveryTarget`, and `PushProviderReceipt` plus constrained enums,
foreign keys, active-token uniqueness, replay uniqueness, and query indexes.
Migrations 48–50 are unchanged.

## Provider truth

Repository adapters are implemented, but no APNs key, FCM service account,
receipt bridge, or production/staging push encryption key is committed or
configured by this gate. Provider execution remains `NOT_CONFIGURED` until a
separately approved environment supplies every required value.

## Closure boundary

The code PR can be independently reviewed while Draft. Gate 7D and Stage 7
must remain open until the physical iPhone/Android, signed build, notification
delivery/open, token rotation, receipt, media, weak-network, process-death,
and hosted-payment return evidence in
`gate7d-device-evidence.md` is completed using real authorized systems.
