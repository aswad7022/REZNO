# Stage 7 — Release and Physical-Device Validation

Status: **ACTIVE — GATES 7A/7B CLOSED, GATE 7C AUTHOR VERIFIED/INDEPENDENT REVIEW PENDING**.

Canonical base: `origin/main` at
`1cf1b9e15de17e49bef3f469b8d99ea498212821`, the merge commit of PR #130.
PR #100 remains an untouched Open Draft reference at
`e46454df993ecccb06180060dda4353ec88e2641`.

Stage 6 operational activation was explicitly deferred by the owner:

`DEFERRED_BY_OWNER — CODE MERGED, RUNTIME NOT ACTIVATED`

No Stage 6 runtime control, schedule, GitHub runtime variable, staging database,
Vercel environment, or provider configuration is changed by Stage 7.

## Objective

Prove REZNO Mobile on real iPhone and Android hardware and close the release,
media-input, hosted-payment return, device-token, and provider-receipt gaps
that were intentionally deferred by Stages 4–6. Repository preparation may
proceed without external credentials, but a build, store, provider, or
physical-device result is never claimed without exact evidence.

Stage 7 does not own broad visual redesign, Stage 6 runtime activation,
production/provider activation, irreversible financial success, AI features,
or changes to protected PR #100.

## Canonical audit

The audit matches current source and configuration, not historical reports
alone. `IMPLEMENTED_AND_PROVEN` below means repository/static or safe
read-only endpoint evidence; it does not imply physical-device proof.

| Capability | Status | Current evidence and boundary |
| --- | --- | --- |
| Expo project linkage | `IMPLEMENTED_AND_PROVEN` | `@alhakeem7/rezno-mobile` and project ID `ef209c9c-0d04-4731-a998-6241fef1b29d` match `app.json` and the authenticated read-only EAS project lookup. |
| iOS/Android identifiers | `IMPLEMENTED_AND_PROVEN` | Both canonical identifiers are `com.rezno.mobile`; Gate 7A validation rejects drift. |
| Application scheme | `IMPLEMENTED_AND_PROVEN` | `rezno` is configured and statically locked; no deep-link handler is implied. |
| Expo Web runtime | `IMPLEMENTED_AND_PROVEN` | Expo-compatible `react-dom` and `react-native-web` are installed, version-locked by validation, and the Web export passes. |
| Development build profile | `IMPLEMENTED_AND_PROVEN` | Development client, internal distribution, `development` EAS environment, and the public staging API origin are validated. No current build was created. |
| Preview build profile | `IMPLEMENTED_AND_PROVEN` | Standalone internal distribution, `preview` EAS environment, and the public staging API origin are validated. No current build was created. |
| Production build profile | `PARTIAL` | Store distribution and the `production` EAS environment are explicit. The production API origin is deliberately not tracked and is not configured in EAS, so a release fails closed until separately approved. |
| Public staging API origin | `IMPLEMENTED_AND_PROVEN` | `https://rezno-staging.vercel.app` resolves to the same exact-main staging deployment as the protected team alias and returns the unauthenticated session API with HTTP 200. |
| Release API-origin safety | `IMPLEMENTED_AND_PROVEN` | Non-development bundles accept only the exact source-controlled staging origin. Hostname shape is never treated as proof of safety; every special-use, DNS-to-private, or otherwise unapproved origin is rejected. |
| EAS account/project access | `IMPLEMENTED_AND_PROVEN` | Read-only `whoami` and `project:info` succeeded on 2026-07-25. No credential material was read or printed. |
| Current signed Development/Preview artifact | `IMPLEMENTED_NOT_PHYSICAL_PROVEN` | Configuration and runbook exist. Historical Android evidence is not evidence for this Stage 7 commit. |
| Physical iPhone install/open | `BLOCKED_BY_EXTERNAL_CREDENTIAL` | Requires an authorized Apple team/signing path, registered device or TestFlight path, and a physical iPhone. |
| Physical Android install/open | `IMPLEMENTED_NOT_PHYSICAL_PROVEN` | An internal APK path is defined, but no Stage 7 build was created or installed on a physical phone. |
| `ar`/`en`/`ckb` and RTL/LTR | `IMPLEMENTED_NOT_PHYSICAL_PROVEN` | Current app source contains all three locales and direction handling; physical-device regression remains required. |
| SecureStore session persistence | `IMPLEMENTED_NOT_PHYSICAL_PROVEN` | Better Auth cookies are normalized and stored in Expo SecureStore; cold-process behavior is not physically proven. |
| Photo Library selection | `IMPLEMENTED_NOT_PHYSICAL_PROVEN` | Customer avatar uses `expo-image-picker`, asks for library permission, and accepts one image. |
| Camera capture | `IMPLEMENTED_NOT_PHYSICAL_PROVEN` | Gate 7B requests camera permission, distinguishes retryable and settings-blocked denial, handles cancellation, and launches image-only rear-camera capture. Physical proof remains open. |
| HEIC | `IMPLEMENTED_NOT_PHYSICAL_PROVEN` | File signatures are inspected before decode. HEIC/HEIF enters a local JPEG re-encode that strips metadata; a platform decode failure remains an explicit safe rejection. Physical HEIC proof remains open. |
| Upload retry/resume/cancel | `IMPLEMENTED_NOT_PHYSICAL_PROVEN` | Gate 7B adds a lifecycle-independent coordinator, progress, pre-commit cancellation, bounded attempts, write-once target reconciliation, durable checkpoints, stable idempotency keys, fenced attach verification handoff, and cleanup. Native upload tasks do not claim byte-range resume across process death. |
| Poor-network recovery | `IMPLEMENTED_NOT_PHYSICAL_PROVEN` | Offline, timeout, ambiguous completion, retry, and maximum-attempt states are explicit. The operation remains recoverable without false success. |
| Process-death recovery | `IMPLEMENTED_NOT_PHYSICAL_PROVEN` | A short-lived SecureStore manifest plus a normalized app-private file restores the exact owner and destination through session, target, upload, finalize, and attach checkpoints. |
| Hosted payment handoff | `IMPLEMENTED_NOT_PROVIDER_PROVEN` | Gate 7C adds an exact-origin, ephemeral hosted-browser handoff with a bounded durable recovery record. Both server and Mobile provider-origin allowlists remain empty, so the runtime fails closed until a provider adapter and exact origin are separately approved. |
| Deep-link return | `IMPLEMENTED_NOT_PHYSICAL_PROVEN` | The exact `rezno://payments/return` shape supports warm/cold return, signed owner/intent binding, one-time server consumption, bounded process-death reconciliation, and server-authoritative status. Physical-device proof remains Gate 7D work. |
| Device-token lifecycle | `NOT_IMPLEMENTED` | No device-token model or mobile registration lifecycle exists. |
| APNs/FCM integration | `NOT_IMPLEMENTED` | No production adapter, credential configuration, or device endpoint exists. |
| Real provider receipts | `BLOCKED_BY_EXTERNAL_CREDENTIAL` | Provider adapters and credentials are not configured; Stage 7 must not fabricate receipt success. |
| TestFlight/Play validation | `BLOCKED_BY_EXTERNAL_CREDENTIAL` | Requires signed artifacts and authorized store access. No submission is authorized in Gate 7A. |
| Broad visual redesign | `DEFERRED` | Stage 8 only. |
| AI capabilities | `DEFERRED` | Blocked until Stage 8 is closed. |

## Proposed gate decomposition

This is the canonical Stage 7 decomposition. Gates 7A and 7B are closed and
only Gate 7C is active in the current work.

### Gate 7A — Release and Physical-Device Foundation

- lock Expo/EAS project, identifiers, scheme, and environment profiles;
- validate the public staging API origin and release fail-closed behavior;
- restore and validate the declared Expo Web runtime without changing native behavior;
- document Development/Preview build, install, launch, and sanitized evidence;
- inspect EAS access only; do not create or submit a build in this gate without
  a separate authorization.

### Gate 7B — Camera, Library, HEIC and Network Recovery

- camera and Photo Library permission truth;
- HEIC normalization or explicit retained safe rejection;
- retry/resume/cancel, weak-network behavior, process-death recovery, and
  duplicate prevention for managed uploads.

### Gate 7C — Hosted Payment and Deep-Link Recovery

- hosted browser handoff and exact return-URL allowlist;
- warm-start and cold-start deep links;
- replay protection, process-death recovery, and server-authoritative payment
  status;
- no provider credential or real financial success without separate authority.

### Gate 7D — Device Tokens, Provider Receipts and Stage 7 Closure

- device-token registration, rotation, logout/revocation, and deletion;
- APNs/FCM readiness and receipt truth for configured providers only;
- TestFlight/Play validation, physical-device regression, integrated closure,
  and independent review.

Gate 7B began only after Gate 7A was independently reviewed and merged through
PR #129. Gate 7C began only after Gate 7B was independently reviewed and
merged through PR #130. Gate 7D must not begin until Gate 7C is independently
reviewed and merged.

## Provider and release truth

- staging storage/payment/communications providers remain `NOT_CONFIGURED`;
- no production or store submission was executed;
- no EAS build was created in Gate 7A;
- no physical-device result is claimed;
- no migration is required by the audited Gate 7C design; migrations 48 and 49
  remain immutable.
