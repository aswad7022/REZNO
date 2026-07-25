# Gate 7B — Camera, Library, HEIC and Network Recovery

Status: **AUTHOR COMPLETE — DRAFT REVIEW PENDING — PHYSICAL DEVICE NOT RUN**.

Base: `0149ca6165e6117cf2f7d8d1a7dda49cfd1b0333`, the merge commit of PR #129.

Gate 7B closes the Mobile customer-avatar media-input and recovery gap. It
does not add message/review attachments, booking or restaurant media slots,
hosted payments, deep links, device tokens, provider receipts, Stage 6
runtime activation, store submission, or production configuration.

## User flow

The account avatar surface now offers two explicit sources:

- rear-camera capture;
- one still image from the Photo Library.

Camera and library permissions are requested separately. Granted, retryable
denial, permanently blocked denial, and picker cancellation have distinct
`ar`, `en`, and `ckb` messages. A permanently blocked permission exposes an
explicit system-settings action. The picker never requests EXIF or Base64 and
the image-only configuration blocks microphone permission at build time.

Android's `ImagePicker.getPendingResultAsync()` is consumed after startup so a
selection returned after Activity destruction is not silently lost.

## Content and privacy pipeline

1. Read actual file size from the local file, not the picker filename or MIME
   declaration.
2. Enforce a 20 MiB source ceiling and 40 megapixel decode ceiling.
3. Inspect magic bytes for JPEG, PNG, WebP, HEIC/HEIF, and AVIF.
4. Reject unsupported or disguised content before a storage session exists.
5. Decode and re-encode accepted input as JPEG, resizing the longest edge to
   at most 2048 pixels.
6. Verify the generated JPEG magic bytes, exact size, and SHA-256.
7. Store only the normalized copy in an app-private directory. Original EXIF,
   GPS, filename, and picker metadata are not persisted or sent.
8. Use the server-advertised `CUSTOMER_AVATAR` limit, never exceeding the
   canonical 5 MiB purpose ceiling.

HEIC/HEIF is therefore normalized when the native platform decoder accepts
it. A decoder failure is a visible safe rejection and is never mislabeled as
a successful upload.

## Durable upload lifecycle

The recovery manifest is stored in Expo SecureStore with
`WHEN_UNLOCKED_THIS_DEVICE_ONLY`. It contains no cookie, token, presigned URL,
provider response body, original filename, or image bytes.

The manifest is:

- schema-versioned;
- limited to 15 minutes;
- bound to the authenticated owner;
- bound to `CUSTOMER_PROFILE/CUSTOMER_AVATAR`;
- bound to the normalized file size and SHA-256;
- checkpointed at create-session, issue-target, upload, finalize, and attach;
- equipped with stable UUID idempotency keys per transition;
- limited to three provider-upload attempts.

The normalized path must exactly match the app-owned directory and operation
UUID. A different user, destination, path, checksum, size, schema, or expired
manifest fails closed and is cleaned.

## Network and provider behavior

API requests have a 20-second timeout. Provider transfer has a 60-second
timeout and reports byte progress. Offline state performs no provider request
and preserves the manifest. Retry is explicit and bounded.

The provider request:

- accepts only an HTTPS target without credentials or fragment;
- accepts only `content-length`, `content-type`, and `if-none-match` headers;
- never receives the REZNO session cookie or Mobile authorization state;
- uses binary `PUT`, exact JPEG size/type, and `If-None-Match: *`.

An ambiguous provider result is reconciled through server-authoritative
finalization. If the object is absent, a new target/finalize idempotency
generation is created. If a previous upload completed, finalization safely
continues without a duplicate asset.

Expo upload tasks provide live progress and cancellation but do not provide
byte-range upload resume after process termination. Gate 7B truthfully
implements operation-level resume: replay the durable checkpoint, reconcile
the write-once object, and continue with server idempotency.

## Destination integrity

Recovery always refreshes the current customer media container before attach.
If the finalized asset is already attached, recovery completes without a
second mutation. If the container version changed to different content, the
old operation is cleaned and does not overwrite it.

No booking or restaurant upload destination is introduced in Gate 7B. The
manifest parser rejects any destination other than the exact authenticated
customer avatar.

## Cancellation and cleanup

Cancellation stops the live native task, aborts the owner-scoped server
session when still active, deletes the normalized file, and removes the
manifest. Server abort failure cannot block local privacy cleanup; the
owner-scoped session expires and existing storage automation handles provider
orphan cleanup.

Success, terminal rejection, destination conflict, corrupt recovery state,
account switch, and expiry also remove local temporary state. Unreferenced
files in the dedicated app directory are removed without logging their paths.

## External boundary

- No migration or Prisma schema change.
- No staging or production database access.
- No Stage 6 runtime activation or secret rotation.
- No EAS build, update, submit, TestFlight, Play, or production action is
  implied by repository verification.
- A local iOS Simulator native build completed with zero errors, installed,
  and opened from the final Mobile source state. Generated native/build files
  and the simulator app were removed afterward. This is not physical-device
  evidence.
- Physical Camera, HEIC, poor-network, and force-close evidence remains
  explicitly unproven until a current exact-head device run is recorded.

## Primary platform references

- [Expo ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/)
- [Expo ImageManipulator](https://docs.expo.dev/versions/latest/sdk/imagemanipulator/)
- [Expo FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/)
