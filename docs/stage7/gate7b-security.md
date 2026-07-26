# Gate 7B Security Review

Status: **CLOSED THROUGH PR #130**.

## Threat and control matrix

| Threat | Gate 7B control |
| --- | --- |
| Image extension disguises executable or unsupported content | Magic-byte classification precedes decode and the server independently inspects final bytes. Filenames and declared MIME do not authorize content. |
| HEIC or crafted image leaks EXIF/GPS | Accepted input is decoded and re-encoded as JPEG; EXIF, GPS, original filename, picker metadata, and Base64 are neither requested nor persisted. |
| Decompression or storage exhaustion | Source is capped at 20 MiB/40 megapixels, longest edge at 2048, normalized avatar at 5 MiB, provider attempts at three, API at 20 seconds, transfer at 60 seconds, and operation age at 15 minutes. |
| Session cookie leaks to provider origin | REZNO API calls alone use the authenticated client. Provider transfer uses FileSystem with only the three validated write-once headers. Cookie and authorization headers are rejected. |
| Malicious or compromised upload target | Client revalidates HTTPS, no credentials/fragment, exact method, exact length/type, and exact header allowlist before native transfer. Server also validates provider targets. |
| Duplicate tap, retry, or relaunch creates duplicate data | One module-owned coordinator, one atomically claimed runner slot, one durable manifest, stable per-transition UUID idempotency keys, provider write-once condition, and server mutation replay. The owner is fenced by operation ID plus per-run UUID before controller/state mutation; startup duplicates and stale `finally` blocks have no authority over the current owner. Cancellation keeps that owner until the active execution and every already-started durable persist have quiesced, then removes the latest checkpoint before releasing the slot, so an old write cannot resurrect or replace recovery state. |
| Account changes while normalization, transfer, or attach is active | The coordinator changes the accepted UI owner first. Each runner captures an opaque API-session requester at atomic claim, before asynchronous preparation or UI pending state, so every authenticated transition—including attach after an awaited `VERIFY_ATTACH` persist—uses that runner's original session rather than rereading a newer account cookie. Captured requests use `credentials: "omit"` with the captured Cookie as their sole session source and reject caller-supplied Cookie/Authorization headers; the native Cookie Jar therefore cannot inject a newer login. Pre-commit work is aborted and quiesced before the new account bootstraps, with local-only operation-scoped cleanup so no old session identifier is sent under the new cookie. An in-flight attach is not aborted or replayed: its exact owner completes before the new account may issue API work, and post-switch automatic verification/preview is suppressed. The cookie snapshot is memory-only, absent from manifests/logs/provider requests, and stale old-account commands cannot target the new runner. |
| React rerender, locale change, or remount aborts or duplicates transport | React owns no upload controller or commit lifecycle. It subscribes by owner to coordinator snapshots and localizes status codes at render time. Subscription cleanup removes only the listener; the stable owner, controller, commit phase, checkpoint, and completion remain outside the component. |
| Process death loses user intent | Every server transition is checkpointed in SecureStore and replayable. Android picker pending result is recovered before accepting new input. |
| Old operation uploads to another user or domain target | Manifest owner and exact `CUSTOMER_PROFILE/CUSTOMER_AVATAR` destination are validated against the current authenticated user before recovery. Other destination kinds are invalid. |
| Recovery overwrites a newer avatar | Attach first refreshes the current container. A different container version fails closed unless the exact finalized asset is already attached. |
| A delayed preview response hides or replaces newer state | Attach success is committed independently of preview loading. Startup, post-commit, and Retry compare the requested asset to the current asset after either preview success or failure; stale results mutate no UI state and Retry cannot bind again. |
| Presigned target or local path persists in logs/state | Target URL/headers live only in memory. No image bytes, provider body, tokens, cookies, original paths, or managed local paths are logged. |
| Cancel races the irreversible attach mutation | Direct cancel is allowed only in `CANCELLABLE`. `COMMITTING`/`COMMITTED` use server-result verification; `VERIFY_ATTACH` is persisted before the request so an ambiguous response or restart never claims cancellation. |
| Cleanup failure leaves an untracked private image | Cleanup deletes the JPEG before its owner-scoped manifest. File failure preserves the manifest pointer, manifest failure is reported, missing artifacts are idempotent, and an old cleanup cannot sweep a newer operation. |
| Infinite offline/retry loop | Offline performs no transfer, retries are user-visible and bounded to three provider attempts, and no unbounded timer or background loop exists. |
| New native permission silently expands access | ImagePicker config explicitly requests Camera/Photos and blocks microphone. No video, audio, location, or broad file permission is introduced by application code. |

## Storage and identity boundary

The server remains authoritative for actor identity, purpose, quota, session
ownership, content inspection, scanner outcome, and media-container version.
Gate 7B does not create a client-supplied owner, object key, organization,
booking, restaurant, storage provider, visibility, or delivery URL.

The local manifest contains the authenticated owner identifier only to reject
cross-account recovery. It is stored with a this-device-only SecureStore
accessibility class. The normalized image remains in an app-private directory
and is deleted at every terminal boundary.

Attach is the explicit irreversible boundary. Before it, abort plus local
cleanup is safe. After the attach request is sent, the manifest remains until
the response or a later container reconciliation establishes server truth.
`VERIFY_ATTACH` restores as non-cancellable before any asynchronous read.
Only a confirmed committed result performs terminal cleanup. Preview fetching
is a separate non-mutating phase and cannot alter that truth.

An ambiguous attach uses a fenced single handoff from the transport owner to
one verification owner. The first completion remains pending through the
handoff. A verifier that cannot establish server truth retains
`VERIFY_ATTACH` and an explicit durable retry/startup path; it never reports
cancel or silently discards the checkpoint.

## Release-origin boundary

Gate 7A remains authoritative:

- non-development API traffic accepts only
  `https://rezno-staging.vercel.app`;
- Production remains fail-closed without an approved origin;
- Development localhost behavior is unchanged.

Gate 7B does not weaken this guard. The external provider target is returned
by the authenticated storage API and receives no REZNO session material.

## Deferred boundaries

Stage 6 remains:

`DEFERRED_BY_OWNER — CODE MERGED, RUNTIME NOT ACTIVATED`

No runtime schedule, provider configuration, Vercel setting, database,
payment, deep link, device token, APNs/FCM, store, or production action belongs
to Gate 7B. PR #100 remains an untouched deferred Draft reference.

## Author remediation review result

The remediation diff is limited to the Mobile avatar runner ownership and
commit/cancel/preview state machine, direct Gate 7B regression tests, and
Stage 7 documentation. The scoped secret scan found no credential,
database URL, private key, access token, or authorization value. The privacy
scan found no image-content, token, presigned-target, original-path, or EXIF
logging. Root production dependencies and all Mobile dependencies report zero
known vulnerabilities. The root full audit retains the existing development-
only baseline of 12 findings (3 moderate and 9 high); no production dependency
finding is present.

No Prisma schema or migration changed. Stage 6 runtime, staging, production,
provider configuration, and protected PR #100 were not accessed or mutated.
