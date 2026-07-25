import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MediaUploadEngineError,
  runCustomerAvatarUpload,
  type CustomerAvatarUploadEngineDependencies,
} from "../../../apps/mobile/src/media/upload-engine";
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
    ["ISSUE_TARGET", "UPLOAD", "UPLOAD", "FINALIZE", "ATTACH"],
  );
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

test("Gate 7B aborts before remote work when the user cancels", async () => {
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
    "success",
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
  container?: { bindings: Array<{ id: string; media: { assetId: string | null } | null; slot: string }>; version: number };
  finalize?: CustomerAvatarUploadEngineDependencies["finalize"];
  online?: boolean;
  upload?: CustomerAvatarUploadEngineDependencies["upload"];
  uploadError?: unknown;
} = {}) {
  const calls: string[] = [];
  const persisted: CustomerAvatarUploadManifest[] = [];
  const uuid = uuidFactory(800);
  const dependencies: CustomerAvatarUploadEngineDependencies = {
    async attach(input) {
      calls.push(
        `attach:${input.idempotencyKey}:${input.containerVersion}:${input.replace}`,
      );
      return {
        bindings: [
          {
            id: "binding",
            media: { assetId: input.assetId },
            slot: "CUSTOMER_AVATAR",
          },
        ],
        version: input.containerVersion + 1,
      };
    },
    async cleanupLocal() {
      calls.push("cleanup");
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
    now: () => NOW,
    onProgress() {},
    async persist(manifest) {
      persisted.push(structuredClone(manifest));
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
  return { calls, dependencies, persisted };
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
