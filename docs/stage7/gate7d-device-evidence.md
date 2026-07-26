# Gate 7D Physical Device and Provider Evidence

Status: **DEFERRED_BY_OWNER — REQUIRED EXTERNAL VALIDATION NOT RUN**.

No physical-device, Apple/Google credential, APNs/FCM delivery, store,
payment-sandbox, or production result has been inferred from repository tests,
simulators, Expo exports, or generated builds.

The reviewed Android Preview build
`332bbe3f-15ba-4e1b-aa7c-6ebb6a80623f` completed but was not installed or
tested on a physical Android phone. iOS Preview creation stopped because an
Apple credential suitable for internal distribution was unavailable. No
physical-device or real APNs/FCM/receipt claim follows from either result.

## Required evidence matrix

| Scenario | Physical iPhone | Physical Android |
| --- | --- | --- |
| Signed Preview/Development install and cold launch | `NOT_RUN` | `NOT_RUN` |
| ar/en/ckb and RTL/LTR | `NOT_RUN` | `NOT_RUN` |
| Camera/library permission denial, cancellation, settings | `NOT_RUN` | `NOT_RUN` |
| HEIC/HEIF or platform equivalent; EXIF/GPS removal | `NOT_RUN` | `NOT_RUN` |
| Slow/offline upload, retry, process death, exact destination | `NOT_RUN` | `NOT_RUN` |
| Hosted checkout warm/cold/replayed return | `BLOCKED — no payment sandbox origin approved` | `BLOCKED` |
| Notification permission granted/denied/provisional where supported | `NOT_RUN` | `NOT_RUN` |
| APNs/FCM token registration and rotation | `BLOCKED — credentials/device` | `BLOCKED — credentials/device` |
| Logout/account switch disables old binding | `BLOCKED` | `BLOCKED` |
| Provider acceptance, delivery receipt, invalid token | `BLOCKED — provider` | `BLOCKED — provider` |
| Notification open routes to the server-authorized destination | `BLOCKED` | `BLOCKED` |

## Safe evidence template

```text
Date/time and timezone:
Tester:
Reviewed commit SHA:
EAS build ID and profile:
Device model and OS:
Application identifier:
API environment:
Push environment:
Permission scenarios:
Token registration/rotation (token redacted):
Logout/account switch:
Provider acceptance and receipt (IDs hashed/redacted):
Notification warm/cold open:
Media and weak-network/process-death regressions:
Hosted-return regressions:
Sanitized evidence filenames:
Final result: PASS / FAIL / BLOCKED
```

Evidence must not include push tokens, cookies, authorization headers,
installation secrets, provider keys, HMAC material, database URLs, checkout
URLs/state, customer contact data, device identifiers, or financial data.

## Owner actions needed for closure

1. Authorize Apple signing and a physical iPhone, plus Google/Android signing
   and a physical Android device.
2. Configure separately scoped staging APNs/FCM credentials, token encryption,
   and receipt HMAC/bridge values in the approved secret stores.
3. Create/install signed EAS Development or Preview builds; do not submit them.
4. Execute every matrix row and attach sanitized evidence to the Gate 7D PR.
5. Provide an approved payment sandbox origin/adapter only if hosted payment
   device return is to be exercised.
6. Request a new independent review of the exact evidence-bearing PR head.

Owner deferral does not remove, satisfy, or weaken any row in this matrix.
Stage 7 formal closure remains `NOT COMPLETED` until this matrix is complete
and independently reviewed.
