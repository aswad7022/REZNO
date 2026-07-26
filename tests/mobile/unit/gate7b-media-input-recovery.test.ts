import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  acquireCustomerAvatarRunner,
  createCustomerAvatarRunnerRegistry,
  customerAvatarCancellationDisposition,
  isCustomerAvatarRunnerOwner,
  MediaUploadEngineError,
  releaseCustomerAvatarRunner,
  resolveAssetBoundAvatarPreview,
  runCustomerAvatarUpload,
  updateCustomerAvatarRunner,
  type CustomerAvatarUploadEngineDependencies,
} from "../../../apps/mobile/src/media/upload-engine";
import {
  cleanupCustomerAvatarRecoveryArtifacts,
  CustomerAvatarCleanupError,
} from "../../../apps/mobile/src/media/upload-cleanup";
import {
  CUSTOMER_AVATAR_NORMALIZED_MAX_BYTES,
  MEDIA_UPLOAD_MAX_ATTEMPTS,
  MediaUploadPolicyError,
  canAttemptUpload,
  createCustomerAvatarUploadManifest,
  firstSelectedImage,
  isImagePickerErrorResult,
  mediaPermissionDisposition,
  parseCustomerAvatarUploadManifest,
  retryDelayMs,
  sniffImageFormat,
  uploadProgressFraction,
  validateSelectedImage,
  validateUploadTarget,
  type CustomerAvatarUploadManifest,
  type SafeUploadTarget,
} from "../../../apps/mobile/src/media/upload-policy";

const NOW = 1_800_000_000_000;
const OWNER = "person_7b";
const SESSION_ID = "00000000-0000-4000-8000-000000000101";
const ASSET_ID = "00000000-0000-4000-8000-000000000102";

test("Gate 7B reports granted, retryable denial, and blocked permission truth", () => {
  assert.equal(
    mediaPermissionDisposition({ canAskAgain: true, granted: true }),
    "GRANTED",
  );
  assert.equal(
    mediaPermissionDisposition({ canAskAgain: true, granted: false }),
    "DENIED_RETRYABLE",
  );
  assert.equal(
    mediaPermissionDisposition({ canAskAgain: false, granted: false }),
    "DENIED_BLOCKED",
  );
});

test("Gate 7B treats camera/library cancellation and empty results as no selection", () => {
  const asset = { uri: "file:///private/image.jpg" };
  assert.equal(firstSelectedImage({ assets: [asset], canceled: false }), asset);
  assert.equal(firstSelectedImage({ assets: [asset], canceled: true }), null);
  assert.equal(firstSelectedImage({ assets: [], canceled: false }), null);
  assert.equal(firstSelectedImage({ assets: null, canceled: false }), null);
  assert.equal(
    firstSelectedImage({ code: "E_PICKER", message: "native failure" }),
    null,
  );
  assert.equal(firstSelectedImage(null), null);
  assert.equal(isImagePickerErrorResult({ code: "E_PICKER" }), true);
  assert.equal(isImagePickerErrorResult({ assets: [], canceled: true }), false);
});

test("Gate 7B sniffs JPEG, PNG, WebP, HEIC/HEIF, and AVIF from bytes", () => {
  assert.equal(sniffImageFormat(Uint8Array.from([0xff, 0xd8, 0xff])), "JPEG");
  assert.equal(
    sniffImageFormat(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
    "PNG",
  );
  assert.equal(
    sniffImageFormat(bytes("RIFF0000WEBP")),
    "WEBP",
  );
  assert.equal(
    sniffImageFormat(bytes("\0\0\0\u0018ftypheic\0\0\0\0mif1heic")),
    "HEIC",
  );
  assert.equal(
    sniffImageFormat(bytes("\0\0\0\u0018ftypmif1\0\0\0\0heix")),
    "HEIC",
  );
  assert.equal(
    sniffImageFormat(bytes("\0\0\0\u0018ftypmif1\0\0\0\0avif")),
    "AVIF",
  );
  assert.equal(sniffImageFormat(bytes("not-a-real-jpeg")), "UNSUPPORTED");
});

test("Gate 7B rejects non-images, oversized sources, and unsafe pixel counts", () => {
  assert.throws(
    () =>
      validateSelectedImage({
        fileSize: 1_024,
        height: 20,
        type: "video",
        width: 20,
      }),
    hasPolicyCode("UNSUPPORTED_MEDIA_TYPE"),
  );
  assert.throws(
    () =>
      validateSelectedImage({
        fileSize: 21 * 1024 * 1024,
        height: 20,
        type: "image",
        width: 20,
      }),
    hasPolicyCode("FILE_TOO_LARGE"),
  );
  assert.throws(
    () =>
      validateSelectedImage({
        fileSize: 1_024,
        height: 10_000,
        type: "image",
        width: 10_000,
      }),
    hasPolicyCode("PIXEL_LIMIT_EXCEEDED"),
  );
});

test("Gate 7B accepts only a bounded HTTPS write-once upload target", () => {
  const target = rawTargetFor(2);
  assert.deepEqual(
    validateUploadTarget(target, {
      mimeType: "image/jpeg",
      sizeBytes: 1_024,
    }),
    targetFor(2),
  );
  for (const unsafe of [
    { ...target, url: "http://storage.example/upload" },
    { ...target, url: "https://user:pass@storage.example/upload" },
    { ...target, headers: { ...target.headers, cookie: "secret" } },
    { ...target, headers: { ...target.headers, authorization: "secret" } },
    {
      ...target,
      headers: { ...target.headers, "content-length": "1025" },
    },
  ]) {
    assert.throws(
      () =>
        validateUploadTarget(unsafe, {
          mimeType: "image/jpeg",
          sizeBytes: 1_024,
        }),
      hasPolicyCode("UNSAFE_UPLOAD_TARGET"),
    );
  }
});

test("Gate 7B recovery manifest is owner-, destination-, and TTL-bound", () => {
  const manifest = manifestFor();
  assert.deepEqual(
    parseCustomerAvatarUploadManifest(JSON.stringify(manifest), {
      now: NOW,
      ownerId: OWNER,
    }),
    manifest,
  );
  assert.throws(
    () =>
      parseCustomerAvatarUploadManifest(JSON.stringify(manifest), {
        now: NOW,
        ownerId: "different_person",
      }),
    hasPolicyCode("RECOVERY_INVALID"),
  );
  assert.throws(
    () =>
      parseCustomerAvatarUploadManifest(JSON.stringify(manifest), {
        now: manifest.expiresAt,
        ownerId: OWNER,
      }),
    hasPolicyCode("RECOVERY_EXPIRED"),
  );
  assert.throws(
    () =>
      parseCustomerAvatarUploadManifest(
        JSON.stringify({
          ...manifest,
          destination: {
            kind: "BOOKING",
            ownerId: OWNER,
            slot: "CUSTOMER_AVATAR",
          },
        }),
        { now: NOW, ownerId: OWNER },
      ),
    hasPolicyCode("RECOVERY_INVALID"),
  );
  assert.throws(
    () =>
      parseCustomerAvatarUploadManifest(
        JSON.stringify({ ...manifest, token: "must-not-persist" }),
        { now: NOW, ownerId: OWNER },
      ),
    hasPolicyCode("RECOVERY_INVALID"),
  );
});

test("Gate 7B completes the happy path with stable idempotency and exact destination", async () => {
  const manifest = manifestFor();
  const harness = engineHarness();
  const result = await runCustomerAvatarUpload(manifest, harness.dependencies);
  assert.equal(result.assetId, ASSET_ID);
  assert.deepEqual(harness.calls, [
    `create:${manifest.idempotency.create}`,
    `target:${manifest.idempotency.target}:1`,
    "upload:1",
    `finalize:${manifest.idempotency.finalize}:2`,
    `container:${OWNER}`,
    `attach:${manifest.idempotency.attach}:0:false`,
    "cleanup",
  ]);
  assert.deepEqual(
    harness.persisted.map((item) => item.checkpoint),
    [
      "ISSUE_TARGET",
      "UPLOAD",
      "UPLOAD",
      "FINALIZE",
      "ATTACH",
      "VERIFY_ATTACH",
    ],
  );
});

test("Gate 7B keeps a committed attach successful when preview loading fails", async () => {
  const harness = engineHarness();
  const result = await runCustomerAvatarUpload(
    manifestFor(),
    harness.dependencies,
  );
  let previewLoads = 0;
  const currentAssetId: string | null = result.assetId;
  const unavailable = await resolveAssetBoundAvatarPreview({
    assetId: result.assetId,
    currentAssetId: () => currentAssetId,
    async loadPreview() {
      previewLoads += 1;
      throw new TypeError("preview unavailable");
    },
  });
  assert.deepEqual(unavailable, { status: "UNAVAILABLE" });
  assert.equal(
    harness.calls.filter((call) => call.startsWith("attach:")).length,
    1,
  );
  assert.equal(harness.calls.filter((call) => call === "cleanup").length, 1);

  const refreshed = await resolveAssetBoundAvatarPreview({
    assetId: result.assetId,
    currentAssetId: () => currentAssetId,
    async loadPreview() {
      previewLoads += 1;
      return { assetId: result.assetId, url: "https://preview.example/avatar" };
    },
  });
  assert.equal(refreshed.status, "READY");
  assert.equal(previewLoads, 2);
  assert.equal(
    harness.calls.filter((call) => call.startsWith("attach:")).length,
    1,
    "preview retry must not re-run attach",
  );
});

test("Gate 7B ignores a delayed successful preview after a newer avatar becomes current", async () => {
  const preview = deferred<{ url: string }>();
  let currentAssetId: string | null = "asset-a";
  const pending = resolveAssetBoundAvatarPreview({
    assetId: "asset-a",
    currentAssetId: () => currentAssetId,
    loadPreview: () => preview.promise,
  });
  currentAssetId = "asset-b";
  preview.resolve({ url: "https://preview.example/avatar-a" });
  assert.deepEqual(await pending, { status: "STALE" });
});

test("Gate 7B ignores a delayed failed preview after a newer avatar becomes current", async () => {
  const preview = deferred<{ url: string }>();
  let currentAssetId: string | null = "asset-a";
  const pending = resolveAssetBoundAvatarPreview({
    assetId: "asset-a",
    currentAssetId: () => currentAssetId,
    loadPreview: () => preview.promise,
  });
  currentAssetId = "asset-b";
  preview.reject(new TypeError("old preview failed"));
  assert.deepEqual(await pending, { status: "STALE" });
});

test("Gate 7B ignores delayed preview success and failure after avatar removal", async () => {
  for (const outcome of ["READY", "UNAVAILABLE"] as const) {
    const preview = deferred<{ url: string }>();
    let currentAssetId: string | null = "asset-a";
    const pending = resolveAssetBoundAvatarPreview({
      assetId: "asset-a",
      currentAssetId: () => currentAssetId,
      loadPreview: () => preview.promise,
    });
    currentAssetId = null;
    if (outcome === "READY") {
      preview.resolve({ url: "https://preview.example/avatar-a" });
    } else {
      preview.reject(new TypeError("removed preview failed"));
    }
    assert.deepEqual(await pending, { status: "STALE" });
  }
});

test("Gate 7B applies ready and non-blocking unavailable only to the current avatar", async () => {
  const currentAssetId: string | null = "asset-a";
  const ready = await resolveAssetBoundAvatarPreview({
    assetId: "asset-a",
    currentAssetId: () => currentAssetId,
    async loadPreview() {
      return { url: "https://preview.example/avatar-a" };
    },
  });
  assert.deepEqual(ready, {
    status: "READY",
    value: { url: "https://preview.example/avatar-a" },
  });
  const unavailable = await resolveAssetBoundAvatarPreview({
    assetId: "asset-a",
    currentAssetId: () => currentAssetId,
    async loadPreview() {
      throw new TypeError("current preview unavailable");
    },
  });
  assert.deepEqual(unavailable, { status: "UNAVAILABLE" });
});

test("Gate 7B resumes after process death without creating a duplicate session", async () => {
  const manifest = uploadCheckpoint(manifestFor());
  const harness = engineHarness();
  const result = await runCustomerAvatarUpload(manifest, harness.dependencies);
  assert.equal(result.assetId, ASSET_ID);
  assert.equal(harness.calls.some((call) => call.startsWith("create:")), false);
  assert.equal(harness.calls.filter((call) => call.startsWith("target:")).length, 1);
  assert.equal(harness.calls.filter((call) => call.startsWith("upload:")).length, 1);
});

test("Gate 7B reconciles a post-attach process death without duplicate binding", async () => {
  const manifest: CustomerAvatarUploadManifest = {
    ...uploadCheckpoint(manifestFor()),
    assetId: ASSET_ID,
    checkpoint: "ATTACH",
  };
  const harness = engineHarness({
    container: {
      bindings: [
        {
          id: "binding",
          media: { assetId: ASSET_ID },
          slot: "CUSTOMER_AVATAR",
        },
      ],
      version: 1,
    },
  });
  await runCustomerAvatarUpload(manifest, harness.dependencies);
  assert.equal(harness.calls.some((call) => call.startsWith("attach:")), false);
  assert.equal(harness.calls.at(-1), "cleanup");
});

test("Gate 7B fails closed when the destination changed before recovery", async () => {
  const manifest: CustomerAvatarUploadManifest = {
    ...uploadCheckpoint(manifestFor()),
    assetId: ASSET_ID,
    checkpoint: "ATTACH",
  };
  const harness = engineHarness({
    container: { bindings: [], version: 7 },
  });
  await assert.rejects(
    runCustomerAvatarUpload(manifest, harness.dependencies),
    hasEngineCode("DESTINATION_CHANGED", false),
  );
  assert.equal(harness.calls.some((call) => call.startsWith("attach:")), false);
  assert.equal(harness.calls.at(-1), "cleanup");
});

test("Gate 7B keeps offline and timeout failures recoverable and bounded", async () => {
  const offline = engineHarness({ online: false });
  await assert.rejects(
    runCustomerAvatarUpload(uploadCheckpoint(manifestFor()), offline.dependencies),
    hasEngineCode("OFFLINE", true),
  );
  assert.equal(offline.calls.some((call) => call.startsWith("upload:")), false);

  const timeout = engineHarness({
    uploadError: Object.assign(new Error("timeout"), { code: "TIMEOUT" }),
  });
  await assert.rejects(
    runCustomerAvatarUpload(uploadCheckpoint(manifestFor()), timeout.dependencies),
    hasEngineCode("TIMEOUT", true),
  );
  assert.equal(timeout.persisted.at(-1)?.attempts, 1);

  const exhausted = engineHarness();
  await assert.rejects(
    runCustomerAvatarUpload({
      ...uploadCheckpoint(manifestFor()),
      attempts: MEDIA_UPLOAD_MAX_ATTEMPTS,
    }, exhausted.dependencies),
    hasEngineCode("MAX_RETRIES_REACHED", false),
  );
  assert.equal(canAttemptUpload(exhausted.persisted.at(-1) ?? {
    ...manifestFor(),
    attempts: MEDIA_UPLOAD_MAX_ATTEMPTS,
  }), false);
  assert.deepEqual([retryDelayMs(0), retryDelayMs(1), retryDelayMs(2)], [
    1_000,
    2_500,
    5_000,
  ]);
});

test("Gate 7B safely retries an ambiguous provider result with a new generation", async () => {
  let finalizeAttempts = 0;
  const harness = engineHarness({
    async finalize() {
      finalizeAttempts += 1;
      if (finalizeAttempts === 1) {
        throw Object.assign(new Error("not found"), {
          code: "UPLOAD_OBJECT_MISMATCH",
        });
      }
      return { asset: { id: ASSET_ID, state: "READY" } };
    },
  });
  const original = manifestFor();
  await assert.rejects(
    runCustomerAvatarUpload(original, harness.dependencies),
    hasEngineCode("UPLOAD_RETRY_REQUIRED", true),
  );
  const rotated = harness.persisted.at(-1);
  assert.ok(rotated);
  assert.equal(rotated.checkpoint, "ISSUE_TARGET");
  assert.notEqual(rotated.idempotency.target, original.idempotency.target);
  assert.notEqual(rotated.idempotency.finalize, original.idempotency.finalize);

  await runCustomerAvatarUpload(rotated, harness.dependencies);
  assert.equal(finalizeAttempts, 2);
  assert.equal(
    harness.calls.filter((call) => call.startsWith("upload:")).length,
    2,
  );
});

test("Gate 7B rejects duplicate in-memory submission of the same operation", async () => {
  let releaseUpload!: () => void;
  const waitForRelease = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  const harness = engineHarness({
    async upload() {
      await waitForRelease;
      return { status: 200 };
    },
  });
  const manifest = uploadCheckpoint(manifestFor());
  const first = runCustomerAvatarUpload(manifest, harness.dependencies);
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(
    runCustomerAvatarUpload(manifest, harness.dependencies),
    hasEngineCode("ALREADY_RUNNING", true),
  );
  releaseUpload();
  await first;
  assert.equal(
    harness.calls.filter((call) => call.startsWith("upload:")).length,
    1,
  );
});

test("Gate 7B startup recovery cannot adopt or disturb the active pre-commit runner", async () => {
  const startupPreview = deferred<{ url: string }>();
  const currentAssetId: string | null = "asset-a";
  const startupPreviewResult = resolveAssetBoundAvatarPreview({
    assetId: "asset-a",
    currentAssetId: () => currentAssetId,
    loadPreview: () => startupPreview.promise,
  });

  const registry = createCustomerAvatarRunnerRegistry();
  let controllerCreations = 0;
  const manifest = uploadCheckpoint(manifestFor());
  const acquisition = acquireCustomerAvatarRunner(registry, {
    createAbortController() {
      controllerCreations += 1;
      return new AbortController();
    },
    createRunnerId: () => "foreground-runner",
    operationId: manifest.operationId,
  });
  assert.equal(acquisition.status, "ACQUIRED");
  if (acquisition.status !== "ACQUIRED") return;
  const owner = acquisition.owner;
  const originalAbortController = owner.abortController;
  const originalCancel = () => {};
  assert.equal(
    updateCustomerAvatarRunner(registry, owner, {
      activeCancel: originalCancel,
    }),
    true,
  );

  const uploadStarted = deferred<void>();
  const releaseUpload = deferred<void>();
  const harness = engineHarness({
    async upload() {
      uploadStarted.resolve();
      await releaseUpload.promise;
      return { status: 200 };
    },
  });
  harness.dependencies.signal = owner.abortController.signal;
  harness.dependencies.onCommitPhaseChange = (phase) => {
    updateCustomerAvatarRunner(registry, owner, { commitPhase: phase });
  };
  let pending = true;
  const running = runCustomerAvatarUpload(manifest, harness.dependencies);
  await uploadStarted.promise;

  startupPreview.resolve({ url: "https://preview.example/avatar-a" });
  assert.equal((await startupPreviewResult).status, "READY");
  const startupAdoption = acquireCustomerAvatarRunner(registry, {
    createAbortController() {
      controllerCreations += 1;
      return new AbortController();
    },
    createRunnerId: () => "startup-recovery",
    operationId: manifest.operationId,
  });
  assert.deepEqual(startupAdoption, {
    activeOperationId: manifest.operationId,
    status: "ACTIVE_SAME_OPERATION",
  });
  assert.equal(controllerCreations, 1);
  assert.equal(registry.current, owner);
  assert.equal(owner.runnerId, "foreground-runner");
  assert.equal(owner.abortController, originalAbortController);
  assert.equal(owner.activeCancel, originalCancel);
  assert.equal(owner.commitPhase, "CANCELLABLE");
  assert.equal(pending, true);
  assert.equal(
    harness.calls.filter((call) => call.startsWith("upload:")).length,
    1,
  );
  assert.equal(
    harness.calls.filter((call) => call.startsWith("attach:")).length,
    0,
  );

  assert.equal(
    updateCustomerAvatarRunner(registry, owner, {
      cancelRequested: true,
    }),
    true,
  );
  owner.activeCancel?.();
  owner.abortController.abort();
  releaseUpload.resolve();
  await assert.rejects(running, hasEngineCode("CANCELLED", false));
  assert.equal(
    harness.calls.filter((call) => call.startsWith("upload:")).length,
    1,
  );
  assert.equal(
    harness.calls.filter((call) => call.startsWith("attach:")).length,
    0,
  );
  assert.equal(pending, true, "only the owner cleanup may lower pending");
  assert.equal(releaseCustomerAvatarRunner(registry, owner), true);
  pending = false;
  assert.equal(pending, false);
});

test("Gate 7B duplicate startup cannot claim a different active operation", () => {
  const registry = createCustomerAvatarRunnerRegistry();
  let controllerCreations = 0;
  const acquisition = acquireCustomerAvatarRunner(registry, {
    createAbortController() {
      controllerCreations += 1;
      return new AbortController();
    },
    createRunnerId: () => "foreground-runner",
    operationId: "operation-b",
  });
  assert.equal(acquisition.status, "ACQUIRED");
  const duplicate = acquireCustomerAvatarRunner(registry, {
    createAbortController() {
      controllerCreations += 1;
      return new AbortController();
    },
    createRunnerId: () => "startup-recovery",
    operationId: "operation-from-recovery",
  });
  assert.deepEqual(duplicate, {
    activeOperationId: "operation-b",
    status: "ACTIVE_DIFFERENT_OPERATION",
  });
  assert.equal(controllerCreations, 1);
  assert.equal(registry.current?.runnerId, "foreground-runner");
});

test("Gate 7B cancellation during an owned commit preserves verification truth", async () => {
  const registry = createCustomerAvatarRunnerRegistry();
  const manifest: CustomerAvatarUploadManifest = {
    ...uploadCheckpoint(manifestFor()),
    assetId: ASSET_ID,
    checkpoint: "ATTACH",
  };
  const acquisition = acquireCustomerAvatarRunner(registry, {
    createAbortController: () => new AbortController(),
    createRunnerId: () => "foreground-runner",
    operationId: manifest.operationId,
  });
  assert.equal(acquisition.status, "ACQUIRED");
  if (acquisition.status !== "ACQUIRED") return;
  const owner = acquisition.owner;
  const verificationPersistStarted = deferred<void>();
  const releaseVerificationPersist = deferred<void>();
  const harness = engineHarness({
    async persist(nextManifest) {
      if (nextManifest.checkpoint === "VERIFY_ATTACH") {
        verificationPersistStarted.resolve();
        await releaseVerificationPersist.promise;
      }
    },
  });
  harness.dependencies.signal = owner.abortController.signal;
  harness.dependencies.onCommitPhaseChange = (phase) => {
    updateCustomerAvatarRunner(registry, owner, { commitPhase: phase });
  };
  let pending = true;
  const running = runCustomerAvatarUpload(manifest, harness.dependencies);
  await verificationPersistStarted.promise;
  assert.equal(owner.commitPhase, "COMMITTING");

  const duplicate = acquireCustomerAvatarRunner(registry, {
    createAbortController: () => {
      throw new Error("duplicate must not create cancellation state");
    },
    createRunnerId: () => {
      throw new Error("duplicate must not create an owner token");
    },
    operationId: manifest.operationId,
  });
  assert.equal(duplicate.status, "ACTIVE_SAME_OPERATION");
  assert.equal(registry.current, owner);
  assert.equal(owner.runnerId, "foreground-runner");
  assert.equal(
    customerAvatarCancellationDisposition(owner.commitPhase),
    "VERIFY",
  );
  assert.equal(
    updateCustomerAvatarRunner(registry, owner, {
      verificationRequested: true,
    }),
    true,
  );
  assert.equal(owner.abortController.signal.aborted, false);
  assert.equal(pending, true);

  releaseVerificationPersist.resolve();
  const result = await running;
  assert.equal(result.assetId, ASSET_ID);
  assert.equal(owner.commitPhase, "COMMITTED");
  assert.equal(owner.verificationRequested, true);
  assert.equal(
    harness.calls.filter((call) => call.startsWith("attach:")).length,
    1,
  );
  assert.equal(releaseCustomerAvatarRunner(registry, owner), true);
  pending = false;
  assert.equal(pending, false);
});

test("Gate 7B stale finally cannot release or mutate a newer runner generation", () => {
  const registry = createCustomerAvatarRunnerRegistry();
  const first = acquireCustomerAvatarRunner(registry, {
    createAbortController: () => new AbortController(),
    createRunnerId: () => "runner-1",
    operationId: "operation",
  });
  assert.equal(first.status, "ACQUIRED");
  if (first.status !== "ACQUIRED") return;
  assert.equal(releaseCustomerAvatarRunner(registry, first.owner), true);

  const second = acquireCustomerAvatarRunner(registry, {
    createAbortController: () => new AbortController(),
    createRunnerId: () => "runner-2",
    operationId: "operation",
  });
  assert.equal(second.status, "ACQUIRED");
  if (second.status !== "ACQUIRED") return;
  let pending = true;
  assert.equal(
    updateCustomerAvatarRunner(registry, first.owner, {
      activeCancel: null,
      commitPhase: "COMMITTED",
    }),
    false,
  );
  if (releaseCustomerAvatarRunner(registry, first.owner)) pending = false;
  assert.equal(pending, true);
  assert.equal(registry.current, second.owner);
  assert.equal(second.owner.commitPhase, "CANCELLABLE");
  assert.equal(isCustomerAvatarRunnerOwner(registry, second.owner), true);
  assert.equal(releaseCustomerAvatarRunner(registry, second.owner), true);
});

test("Gate 7B starts ordinary recovery when no in-memory runner owns the slot", async () => {
  const registry = createCustomerAvatarRunnerRegistry();
  const manifest: CustomerAvatarUploadManifest = {
    ...uploadCheckpoint(manifestFor()),
    assetId: ASSET_ID,
    checkpoint: "ATTACH",
  };
  const acquisition = acquireCustomerAvatarRunner(registry, {
    createAbortController: () => new AbortController(),
    createRunnerId: () => "startup-recovery",
    operationId: manifest.operationId,
  });
  assert.equal(acquisition.status, "ACQUIRED");
  if (acquisition.status !== "ACQUIRED") return;
  const harness = engineHarness();
  harness.dependencies.signal = acquisition.owner.abortController.signal;
  const result = await runCustomerAvatarUpload(manifest, harness.dependencies);
  assert.equal(result.assetId, ASSET_ID);
  assert.equal(
    harness.calls.filter((call) => call.startsWith("attach:")).length,
    1,
  );
  assert.equal(
    releaseCustomerAvatarRunner(registry, acquisition.owner),
    true,
  );
  assert.equal(registry.current, null);
});

test("Gate 7B cancels directly only before the server commit boundary", async () => {
  assert.equal(
    customerAvatarCancellationDisposition("CANCELLABLE"),
    "CANCEL",
  );
  assert.equal(
    customerAvatarCancellationDisposition("COMMITTING"),
    "VERIFY",
  );
  assert.equal(
    customerAvatarCancellationDisposition("COMMITTED"),
    "VERIFY",
  );
  const controller = new AbortController();
  controller.abort();
  const harness = engineHarness();
  harness.dependencies.signal = controller.signal;
  await assert.rejects(
    runCustomerAvatarUpload(manifestFor(), harness.dependencies),
    hasEngineCode("CANCELLED", false),
  );
  assert.deepEqual(harness.calls, []);
  assert.deepEqual(harness.persisted, []);
});

test("Gate 7B cancellation before commit prevents attach after a late container response", async () => {
  let releaseContainer!: () => void;
  let markContainerStarted!: () => void;
  const containerStarted = new Promise<void>((resolve) => {
    markContainerStarted = resolve;
  });
  const containerReleased = new Promise<void>((resolve) => {
    releaseContainer = resolve;
  });
  const controller = new AbortController();
  const manifest: CustomerAvatarUploadManifest = {
    ...uploadCheckpoint(manifestFor()),
    assetId: ASSET_ID,
    checkpoint: "ATTACH",
  };
  const harness = engineHarness({
    async getContainer() {
      markContainerStarted();
      await containerReleased;
      return { bindings: [], version: manifest.containerVersion };
    },
  });
  harness.dependencies.signal = controller.signal;
  const running = runCustomerAvatarUpload(manifest, harness.dependencies);
  await containerStarted;
  assert.equal(
    customerAvatarCancellationDisposition("CANCELLABLE"),
    "CANCEL",
  );
  controller.abort();
  releaseContainer();
  await assert.rejects(
    running,
    hasEngineCode("CANCELLED", false),
  );
  assert.equal(
    harness.calls.some((call) => call.startsWith("attach:")),
    false,
  );
  assert.deepEqual(harness.commitPhases, []);
});

test("Gate 7B verifies cancellation during commit and accepts the later server success", async () => {
  let releaseAttach!: () => void;
  let markAttachStarted!: () => void;
  let releaseVerificationPersist!: () => void;
  let markVerificationPersistStarted!: () => void;
  const attachStarted = new Promise<void>((resolve) => {
    markAttachStarted = resolve;
  });
  const attachReleased = new Promise<void>((resolve) => {
    releaseAttach = resolve;
  });
  const verificationPersistStarted = new Promise<void>((resolve) => {
    markVerificationPersistStarted = resolve;
  });
  const verificationPersistReleased = new Promise<void>((resolve) => {
    releaseVerificationPersist = resolve;
  });
  const manifest: CustomerAvatarUploadManifest = {
    ...uploadCheckpoint(manifestFor()),
    assetId: ASSET_ID,
    checkpoint: "ATTACH",
  };
  const harness = engineHarness({
    async attach(input) {
      markAttachStarted();
      await attachReleased;
      return attachedContainer(input.assetId, input.containerVersion + 1);
    },
    async persist(nextManifest) {
      if (nextManifest.checkpoint === "VERIFY_ATTACH") {
        markVerificationPersistStarted();
        await verificationPersistReleased;
      }
    },
  });
  const running = runCustomerAvatarUpload(manifest, harness.dependencies);
  await verificationPersistStarted;
  assert.deepEqual(harness.commitPhases, ["COMMITTING"]);
  assert.equal(
    customerAvatarCancellationDisposition(harness.commitPhases.at(-1)!),
    "VERIFY",
  );
  releaseVerificationPersist();
  await attachStarted;
  releaseAttach();
  const result = await running;
  assert.equal(result.assetId, ASSET_ID);
  assert.deepEqual(harness.commitPhases, ["COMMITTING", "COMMITTED"]);
  assert.equal(harness.calls.filter((call) => call === "cleanup").length, 1);
});

test("Gate 7B retains recovery state when commit truth is unavailable and reconciles later", async () => {
  const manifest: CustomerAvatarUploadManifest = {
    ...uploadCheckpoint(manifestFor()),
    assetId: ASSET_ID,
    checkpoint: "ATTACH",
  };
  const interrupted = engineHarness({
    attachError: Object.assign(new TypeError("network interrupted"), {
      code: "NETWORK_ERROR",
    }),
  });
  await assert.rejects(
    runCustomerAvatarUpload(manifest, interrupted.dependencies),
    hasEngineCode("NETWORK_ERROR", true),
  );
  assert.deepEqual(interrupted.commitPhases, ["COMMITTING"]);
  assert.equal(
    interrupted.calls.filter((call) => call === "cleanup").length,
    0,
    "an ambiguous attach must retain the recovery manifest and private file",
  );
  const verificationManifest = interrupted.persisted.at(-1);
  assert.equal(verificationManifest?.checkpoint, "VERIFY_ATTACH");

  const recovered = engineHarness({
    container: attachedContainer(ASSET_ID, 1),
  });
  await runCustomerAvatarUpload(verificationManifest!, recovered.dependencies);
  assert.equal(
    recovered.calls.some((call) => call.startsWith("attach:")),
    false,
  );
  assert.deepEqual(recovered.commitPhases, ["COMMITTING", "COMMITTED"]);
  assert.equal(recovered.calls.at(-1), "cleanup");
});

test("Gate 7B restored attach verification cannot be downgraded to cancellable", async () => {
  let releaseContainer!: () => void;
  let markContainerStarted!: () => void;
  const containerStarted = new Promise<void>((resolve) => {
    markContainerStarted = resolve;
  });
  const containerReleased = new Promise<void>((resolve) => {
    releaseContainer = resolve;
  });
  const manifest: CustomerAvatarUploadManifest = {
    ...uploadCheckpoint(manifestFor()),
    assetId: ASSET_ID,
    checkpoint: "VERIFY_ATTACH",
  };
  const harness = engineHarness({
    async getContainer() {
      markContainerStarted();
      await containerReleased;
      return attachedContainer(ASSET_ID, 1);
    },
  });
  const running = runCustomerAvatarUpload(manifest, harness.dependencies);
  await containerStarted;
  assert.deepEqual(harness.commitPhases, ["COMMITTING"]);
  assert.equal(
    customerAvatarCancellationDisposition(harness.commitPhases.at(-1)!),
    "VERIFY",
  );
  releaseContainer();
  await running;
  assert.deepEqual(harness.commitPhases, ["COMMITTING", "COMMITTED"]);
  assert.equal(harness.calls.at(-1), "cleanup");
});

test("Gate 7B expiry cleans recovery before returning expired and reports cleanup failure truthfully", async () => {
  const manifest = manifestFor();
  const cleaned = engineHarness({ now: manifest.expiresAt });
  await assert.rejects(
    runCustomerAvatarUpload(manifest, cleaned.dependencies),
    hasEngineCode("RECOVERY_EXPIRED", false),
  );
  assert.deepEqual(cleaned.calls, ["cleanup"]);

  const failed = engineHarness({
    cleanupError: new Error("private file still exists"),
    now: manifest.expiresAt,
  });
  await assert.rejects(
    runCustomerAvatarUpload(manifest, failed.dependencies),
    hasEngineCode("RECOVERY_CLEANUP_FAILED", false),
  );
  assert.deepEqual(failed.calls, ["cleanup"]);
});

test("Gate 7B cleanup is idempotent for missing artifacts and preserves recovery truth on partial failure", async () => {
  let fileExists = true;
  let manifestExists = true;
  const cleanup = () =>
    cleanupCustomerAvatarRecoveryArtifacts({
      async cleanupFile() {
        if (fileExists) fileExists = false;
      },
      async cleanupManifest() {
        if (manifestExists) manifestExists = false;
      },
    });
  await cleanup();
  await cleanup();
  assert.equal(fileExists, false);
  assert.equal(manifestExists, false);

  let manifestRemovedAfterMissingFile = false;
  await cleanupCustomerAvatarRecoveryArtifacts({
    async cleanupFile() {
      // The private file was already absent.
    },
    async cleanupManifest() {
      manifestRemovedAfterMissingFile = true;
    },
  });
  assert.equal(manifestRemovedAfterMissingFile, true);

  let fileRemovedWithMissingManifest = false;
  await cleanupCustomerAvatarRecoveryArtifacts({
    async cleanupFile() {
      fileRemovedWithMissingManifest = true;
    },
    async cleanupManifest() {
      // The SecureStore record was already absent.
    },
  });
  assert.equal(fileRemovedWithMissingManifest, true);

  let retainedManifest = true;
  await assert.rejects(
    cleanupCustomerAvatarRecoveryArtifacts({
      async cleanupFile() {
        throw new Error("file deletion failed");
      },
      async cleanupManifest() {
        retainedManifest = false;
      },
    }),
    hasCleanupStep("FILE"),
  );
  assert.equal(
    retainedManifest,
    true,
    "the manifest must remain when its private file could not be deleted",
  );

  let removedFile = false;
  await assert.rejects(
    cleanupCustomerAvatarRecoveryArtifacts({
      async cleanupFile() {
        removedFile = true;
      },
      async cleanupManifest() {
        throw new Error("SecureStore deletion failed");
      },
    }),
    hasCleanupStep("MANIFEST"),
  );
  assert.equal(removedFile, true);

});

test("Gate 7B UI and native config cover camera, library, cancellation, and ar/en/ckb", async () => {
  const [component, appConfigText] = await Promise.all([
    readFile(
      "apps/mobile/src/components/customer-avatar-manager.tsx",
      "utf8",
    ),
    readFile("apps/mobile/app.json", "utf8"),
  ]);
  const appConfig = JSON.parse(appConfigText) as {
    expo: { plugins: unknown[] };
  };
  assert.match(component, /requestCameraPermissionsAsync/);
  assert.match(component, /requestMediaLibraryPermissionsAsync/);
  assert.match(component, /getPendingResultAsync/);
  assert.match(component, /cancelCustomerAvatarUpload/);
  const runnerClaim = component.indexOf("acquireCustomerAvatarRunner(registry");
  const runnerStateChange = component.indexOf(
    "setManifest(pendingManifest)",
    runnerClaim,
  );
  assert.ok(runnerClaim >= 0);
  assert.ok(
    runnerStateChange > runnerClaim,
    "runner ownership must precede upload refs and UI state",
  );
  assert.match(
    component,
    /if \(runnerRegistry\.current\) return;[\s\S]*await runUpload\(recovered\)/,
  );
  assert.match(
    component,
    /releaseCustomerAvatarRunner\(registry, owner\)[\s\S]*setPending\(false\)/,
  );
  for (const locale of ["ar", "en", "ckb"]) {
    assert.match(component, new RegExp(`\\n  ${locale}: \\{`));
  }
  for (const key of [
    "cameraPermission",
    "libraryPermission",
    "pickerCancelled",
    "offline",
    "timeout",
    "retry",
    "cancelOperation",
    "cleanupFailed",
    "commitUnconfirmed",
    "previewUnavailable",
    "refreshPreview",
    "success",
    "verifyingCommit",
  ]) {
    assert.equal(
      [...component.matchAll(new RegExp(`\\n    ${key}:`, "g"))].length,
      3,
      `${key} must exist in ar/en/ckb`,
    );
  }
  const picker = appConfig.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-image-picker",
  );
  assert.ok(Array.isArray(picker));
  assert.equal(
    (picker[1] as { microphonePermission?: unknown }).microphonePermission,
    false,
  );
});

test("Gate 7B progress is clamped and normalized output remains within avatar policy", () => {
  assert.equal(uploadProgressFraction(-1, 100), 0);
  assert.equal(uploadProgressFraction(50, 100), 0.5);
  assert.equal(uploadProgressFraction(200, 100), 1);
  assert.equal(CUSTOMER_AVATAR_NORMALIZED_MAX_BYTES, 5 * 1024 * 1024);
});

function engineHarness(options: {
  attach?: CustomerAvatarUploadEngineDependencies["attach"];
  attachError?: unknown;
  cleanupError?: unknown;
  container?: { bindings: Array<{ id: string; media: { assetId: string | null } | null; slot: string }>; version: number };
  finalize?: CustomerAvatarUploadEngineDependencies["finalize"];
  getContainer?: CustomerAvatarUploadEngineDependencies["getContainer"];
  now?: number;
  online?: boolean;
  persist?: (manifest: CustomerAvatarUploadManifest) => Promise<void>;
  upload?: CustomerAvatarUploadEngineDependencies["upload"];
  uploadError?: unknown;
} = {}) {
  const calls: string[] = [];
  const commitPhases: Array<
    Parameters<NonNullable<
      CustomerAvatarUploadEngineDependencies["onCommitPhaseChange"]
    >>[0]
  > = [];
  const persisted: CustomerAvatarUploadManifest[] = [];
  const uuid = uuidFactory(800);
  const dependencies: CustomerAvatarUploadEngineDependencies = {
    async attach(input) {
      calls.push(
        `attach:${input.idempotencyKey}:${input.containerVersion}:${input.replace}`,
      );
      if (options.attach) return options.attach(input);
      if (options.attachError) throw options.attachError;
      return attachedContainer(input.assetId, input.containerVersion + 1);
    },
    async cleanupLocal() {
      calls.push("cleanup");
      if (options.cleanupError) throw options.cleanupError;
    },
    async createSession(input) {
      calls.push(`create:${input.idempotencyKey}`);
      return { id: SESSION_ID, version: 1 };
    },
    async finalize(input) {
      calls.push(`finalize:${input.idempotencyKey}:${input.version}`);
      if (options.finalize) return options.finalize(input);
      return { asset: { id: ASSET_ID, state: "READY" } };
    },
    async getContainer() {
      calls.push(`container:${OWNER}`);
      if (options.getContainer) return options.getContainer(dependencies.signal);
      return options.container ?? { bindings: [], version: 0 };
    },
    async isOnline() {
      return options.online ?? true;
    },
    async issueTarget(input) {
      calls.push(
        `target:${input.idempotencyKey}:${input.version}`,
      );
      return targetFor(input.version + 1);
    },
    now: () => options.now ?? NOW,
    onCommitPhaseChange(phase) {
      commitPhases.push(phase);
    },
    onProgress() {},
    async persist(manifest) {
      persisted.push(structuredClone(manifest));
      await options.persist?.(manifest);
    },
    signal: new AbortController().signal,
    async upload(input) {
      calls.push(`upload:${persisted.at(-1)?.attempts ?? 0}`);
      if (options.upload) return options.upload(input);
      if (options.uploadError) throw options.uploadError;
      return { status: 200 };
    },
    uuid,
  };
  return { calls, commitPhases, dependencies, persisted };
}

function attachedContainer(assetId: string, version: number) {
  return {
    bindings: [
      {
        id: "binding",
        media: { assetId },
        slot: "CUSTOMER_AVATAR",
      },
    ],
    version,
  };
}

function manifestFor() {
  const uuid = uuidFactory();
  return createCustomerAvatarUploadManifest({
    checksumSha256: "a".repeat(64),
    containerVersion: 0,
    fileUri: "file:///safe/avatar.jpg",
    now: NOW,
    operationId: uuid(),
    ownerId: OWNER,
    sizeBytes: 1_024,
    source: "LIBRARY",
    uuid,
  });
}

function uploadCheckpoint(
  manifest: CustomerAvatarUploadManifest,
): CustomerAvatarUploadManifest {
  return {
    ...manifest,
    checkpoint: "UPLOAD",
    session: {
      id: SESSION_ID,
      targetExpiresAt: NOW + 60_000,
      targetRequestVersion: 1,
      version: 2,
    },
  };
}

function targetFor(sessionVersion: number): SafeUploadTarget {
  return {
    expiresAt: NOW + 60_000,
    headers: {
      "content-length": "1024",
      "content-type": "image/jpeg",
      "if-none-match": "*",
    },
    method: "PUT",
    sessionVersion,
    url: "https://storage.example/upload",
  };
}

function rawTargetFor(sessionVersion: number) {
  return {
    ...targetFor(sessionVersion),
    expiresAt: new Date(NOW + 60_000).toISOString(),
  };
}

function uuidFactory(start = 1) {
  let value = start;
  return () =>
    `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function bytes(value: string) {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}

function hasPolicyCode(code: string) {
  return (error: unknown) =>
    error instanceof MediaUploadPolicyError && error.code === code;
}

function hasEngineCode(code: string, retryable: boolean) {
  return (error: unknown) =>
    error instanceof MediaUploadEngineError
    && error.code === code
    && error.retryable === retryable;
}

function hasCleanupStep(step: "FILE" | "MANIFEST") {
  return (error: unknown) =>
    error instanceof CustomerAvatarCleanupError && error.step === step;
}
