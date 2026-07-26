# Gate 7B — Camera, Library, HEIC and Network Recovery

Status: **AUTHOR REMEDIATION COMPLETE — DRAFT RE-REVIEW PENDING — PHYSICAL DEVICE NOT RUN**.

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
- checkpointed at create-session, issue-target, upload, finalize, attach, and
  durable attach verification;
- equipped with stable UUID idempotency keys per transition;
- limited to three provider-upload attempts.

Foreground upload and startup recovery share a module-owned coordinator that
lives outside the React component lifecycle. The avatar component subscribes
to immutable snapshots and translates status codes only when rendering; a
locale change, callback replacement, rerender, or unmount/remount neither
creates nor aborts transport. The coordinator owns the durable checkpoint,
completion promise, and one in-memory runner registry.

The coordinator atomically claims the single slot before preparation, an
abort controller, commit phase, cancellation handle, or pending UI state is
changed. Its operation ID plus per-run UUID form the owner token. Startup
skips recovery when either that operation or another operation already owns
the slot. Only the matching owner may advance commit state, cancel, clear
pending state, or release the slot, so a rejected duplicate or stale
`finally` cannot disturb a newer run. A remounted component subscribes to the
same owner and completion rather than starting a replacement.

The normalized path must exactly match the app-owned directory and operation
UUID. A different user, destination, path, checksum, size, schema, or expired
manifest fails closed and is cleaned.

Expiry cleanup is ordered and truthful. The private JPEG is removed before its
SecureStore recovery pointer. A missing file or record is an idempotent
success. If private-file deletion fails, the manifest remains as the pointer
for a later cleanup attempt; if manifest deletion fails after file removal,
the failure remains visible instead of being mislabeled as a successful
cleanup.

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

Attach success is the final server commit boundary. The returned container is
accepted and the upload manifest/private JPEG are cleaned before preview
loading begins. Preview URL failure cannot turn a committed upload into a
failed upload, and the localized preview-refresh action performs only the
download request; it never repeats upload, finalize, or attach. The same
non-blocking preview policy applies during startup, so it cannot prevent
reconciliation of an already-sent attach.

Expo upload tasks provide live progress and cancellation but do not provide
byte-range upload resume after process termination. Gate 7B truthfully
implements operation-level resume: replay the durable checkpoint, reconcile
the write-once object, and continue with server idempotency.

## Destination integrity

Recovery always refreshes the current customer media container before attach.
If the finalized asset is already attached, recovery completes without a
second mutation. If the container version changed to different content, the
old operation is cleaned and does not overwrite it.

Every preview entry point—startup, post-commit, and preview-only Retry—checks
the requested asset identity again after the asynchronous request settles.
Both successful and unavailable responses become `STALE` without changing UI
state when a newer asset is current or the avatar was removed. Server-side
expected container version and stable attach idempotency remain the authority
that prevents an old operation from replacing newer content.

No booking or restaurant upload destination is introduced in Gate 7B. The
manifest parser rejects any destination other than the exact authenticated
customer avatar.

## Cancellation and cleanup

The in-memory state machine exposes `CANCELLABLE`, `COMMITTING`, and
`COMMITTED` inside the runner-owned record. Cancellation targets only the
current matching owner, stops its live native task, and performs the
idempotent abort/local cleanup only while the operation is `CANCELLABLE`,
before attach is sent. Once attach enters `COMMITTING`, Cancel changes the UI
to verification rather than aborting the request or deleting the manifest.
Success received after that request is reported as committed. A network or
timeout ambiguity retains the `ATTACH` checkpoint and private state so a
later explicit Retry first reads the authoritative container and either
recognizes the exact asset or safely rejects a changed destination.

Immediately before the attach request is sent, `VERIFY_ATTACH` is persisted.
That checkpoint restores directly into `COMMITTING` after process death, even
if provider capability is temporarily unavailable, so a restart cannot
downgrade an ambiguous commit back into a cancellable operation.

If the first runner loses the attach response, it releases only its fenced
runner generation and hands the same durable operation to exactly one
verification owner. Pending state and the original completion remain live
through that handoff. If authoritative verification is temporarily
unavailable, the owner releases with `VERIFY_ATTACH`, a visible retryable
state, and the durable restart/Retry path intact; there is no unowned hidden
commit state.

Pre-commit cancellation also remains owner-fenced through quiescence. A persist
checks the exact runner before and after the underlying durable write. The
coordinator aborts the transport, waits for the active execution (including an
already-started SecureStore write) to settle, removes the latest checkpoint, and
only then releases ownership. A duplicate or newer upload cannot enter that
interval, so a late write from the cancelled generation cannot resurrect its
record or overwrite a newer operation.

Before commit, server abort failure cannot block local privacy cleanup; the
owner-scoped session expires and existing storage automation handles provider
orphan cleanup. Cleanup uses the stable abort key and is idempotent. If an old
cleanup observes a different, newer recovery manifest, it removes only its
own file and does not sweep the newer operation.

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
