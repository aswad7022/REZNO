import * as Crypto from "expo-crypto";
import {
  Directory,
  File,
  FileMode,
  Paths,
  UploadType,
} from "expo-file-system";
import {
  ImageManipulator,
  SaveFormat,
} from "expo-image-manipulator";
import type { ImagePickerAsset } from "expo-image-picker";
import * as Network from "expo-network";
import * as SecureStore from "expo-secure-store";

import {
  mobileApiRequest,
  MobileApiRequestError,
} from "../api/client";
import {
  type CustomerAvatarUploadEngineDependencies,
  type CustomerMediaContainer,
} from "./upload-engine";
import {
  cleanupCustomerAvatarRecoveryArtifacts,
  CustomerAvatarCleanupError,
} from "./upload-cleanup";
import {
  CUSTOMER_AVATAR_NORMALIZED_MAX_BYTES,
  MEDIA_UPLOAD_MAX_DIMENSION,
  MEDIA_UPLOAD_MAX_PIXELS,
  MEDIA_UPLOAD_REQUEST_TIMEOUT_MS,
  MEDIA_UPLOAD_TRANSFER_TIMEOUT_MS,
  MediaUploadPolicyError,
  createCustomerAvatarUploadManifest,
  parseCustomerAvatarUploadManifest,
  sniffImageFormat,
  uploadProgressFraction,
  validateSelectedImage,
  validateUploadTarget,
  type CustomerAvatarUploadManifest,
  type MediaInputSource,
} from "./upload-policy";

type Data<T> = { data: T };

const MANIFEST_KEY = "rezno.media-upload.customer-avatar.v1";
const MANAGED_DIRECTORY_NAME = "rezno-media-uploads-v1";
const secureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export class MediaUploadRuntimeError extends Error {
  constructor(readonly code: string, options?: { cause?: unknown }) {
    super(code, options);
    this.name = "MediaUploadRuntimeError";
  }
}

export async function prepareCustomerAvatarUpload(input: {
  asset: ImagePickerAsset;
  containerVersion: number;
  maximumBytes: number;
  operationId: string;
  ownerId: string;
  source: MediaInputSource;
}) {
  if (
    !Number.isSafeInteger(input.maximumBytes)
    || input.maximumBytes <= 0
    || input.maximumBytes > CUSTOMER_AVATAR_NORMALIZED_MAX_BYTES
  ) {
    throw new MediaUploadRuntimeError("INVALID_UPLOAD_LIMIT");
  }
  const existing = await SecureStore.getItemAsync(
    MANIFEST_KEY,
    secureStoreOptions,
  );
  if (existing) throw new MediaUploadRuntimeError("PENDING_OPERATION");

  await cleanupManagedDirectory();
  const sourceFile = new File(input.asset.uri);
  const sourceSize = sourceFile.size ?? sourceFile.info().size ?? 0;
  validateSelectedImage({
    fileSize: sourceSize,
    height: input.asset.height,
    type: input.asset.type,
    width: input.asset.width,
  });
  const sourceFormat = sniffImageFormat(readHeader(sourceFile));
  if (
    sourceFormat === "UNSUPPORTED"
    || sourceFormat === "AVIF"
  ) {
    throw new MediaUploadPolicyError("UNSUPPORTED_MEDIA_TYPE");
  }

  const directory = managedDirectory();
  ensureDirectory(directory);
  const destination = new File(directory, `${input.operationId}.jpg`);
  let generated: File | null = null;
  let context: ReturnType<typeof ImageManipulator.manipulate> | null = null;
  let rendered: Awaited<ReturnType<
    ReturnType<typeof ImageManipulator.manipulate>["renderAsync"]
  >> | null = null;
  try {
    context = ImageManipulator.manipulate(sourceFile.uri);
    if (
      input.asset.width > MEDIA_UPLOAD_MAX_DIMENSION
      || input.asset.height > MEDIA_UPLOAD_MAX_DIMENSION
    ) {
      context.resize(
        input.asset.width >= input.asset.height
          ? { width: MEDIA_UPLOAD_MAX_DIMENSION }
          : { height: MEDIA_UPLOAD_MAX_DIMENSION },
      );
    }
    rendered = await context.renderAsync();
    if (
      rendered.width <= 0
      || rendered.height <= 0
      || rendered.width * rendered.height > MEDIA_UPLOAD_MAX_PIXELS
    ) {
      throw new MediaUploadPolicyError("PIXEL_LIMIT_EXCEEDED");
    }
    const result = await rendered.saveAsync({
      base64: false,
      compress: 0.9,
      format: SaveFormat.JPEG,
    });
    generated = new File(result.uri);
    await generated.move(destination, { overwrite: true });
    const normalized = new File(destination);
    const sizeBytes = normalized.size ?? normalized.info().size ?? 0;
    if (
      !Number.isSafeInteger(sizeBytes)
      || sizeBytes <= 0
      || sizeBytes > input.maximumBytes
    ) {
      throw new MediaUploadPolicyError(
        sizeBytes > input.maximumBytes ? "FILE_TOO_LARGE" : "INVALID_FILE",
      );
    }
    const bytes = await normalized.bytes();
    if (
      bytes.byteLength !== sizeBytes
      || sniffImageFormat(bytes.subarray(0, 64)) !== "JPEG"
    ) {
      throw new MediaUploadPolicyError("NORMALIZATION_FAILED");
    }
    const checksumSha256 = await sha256Hex(bytes);
    const manifest = createCustomerAvatarUploadManifest({
      checksumSha256,
      containerVersion: input.containerVersion,
      fileUri: normalized.uri,
      now: Date.now(),
      operationId: input.operationId,
      ownerId: input.ownerId,
      sizeBytes,
      source: input.source,
      uuid: Crypto.randomUUID,
    });
    await persistCustomerAvatarUpload(manifest);
    return manifest;
  } catch (error) {
    safeDelete(destination);
    throw error;
  } finally {
    rendered?.release();
    context?.release();
  }
}

export async function loadCustomerAvatarUpload(ownerId: string) {
  const raw = await SecureStore.getItemAsync(MANIFEST_KEY, secureStoreOptions);
  if (!raw) {
    await cleanupManagedDirectory();
    return null;
  }
  let manifest: CustomerAvatarUploadManifest;
  try {
    manifest = parseCustomerAvatarUploadManifest(raw, {
      allowExpired: true,
      now: Date.now(),
      ownerId,
    });
    assertManagedFile(manifest);
    const file = new File(manifest.file.uri);
    if (!file.exists || file.size !== manifest.file.sizeBytes) {
      throw new MediaUploadPolicyError("RECOVERY_FILE_MISSING");
    }
    const bytes = await file.bytes();
    if (
      bytes.byteLength !== manifest.file.sizeBytes
      || sniffImageFormat(bytes.subarray(0, 64)) !== "JPEG"
      || await sha256Hex(bytes) !== manifest.file.checksumSha256
    ) {
      throw new MediaUploadPolicyError("RECOVERY_FILE_MISMATCH");
    }
  } catch (error) {
    await SecureStore.deleteItemAsync(MANIFEST_KEY, secureStoreOptions);
    await cleanupManagedDirectory();
    throw error;
  }
  await cleanupManagedDirectory(manifest.file.uri);
  return manifest;
}

export async function persistCustomerAvatarUpload(
  manifest: CustomerAvatarUploadManifest,
) {
  assertManagedFile(manifest);
  await SecureStore.setItemAsync(
    MANIFEST_KEY,
    JSON.stringify(manifest),
    secureStoreOptions,
  );
}

export async function cleanupCustomerAvatarUpload(
  manifest: CustomerAvatarUploadManifest,
) {
  assertManagedFile(manifest);
  let newerManifestPresent = false;
  try {
    await cleanupCustomerAvatarRecoveryArtifacts({
      async cleanupFile() {
        deleteManagedFile(new File(manifest.file.uri));
      },
      async cleanupManifest() {
        const raw = await SecureStore.getItemAsync(
          MANIFEST_KEY,
          secureStoreOptions,
        );
        if (!raw) return;
        try {
          const stored = JSON.parse(raw) as { operationId?: unknown };
          if (stored.operationId !== manifest.operationId) {
            newerManifestPresent = true;
            return;
          }
        } catch {
          // Invalid state cannot safely be recovered and must not survive.
        }
        await SecureStore.deleteItemAsync(MANIFEST_KEY, secureStoreOptions);
      }
    });
  } catch (error) {
    if (error instanceof CustomerAvatarCleanupError) {
      throw new MediaUploadRuntimeError(error.code, { cause: error });
    }
    throw error;
  }
  if (!newerManifestPresent) await cleanupManagedDirectory();
}

export async function cancelCustomerAvatarUpload(
  manifest: CustomerAvatarUploadManifest,
  signal: AbortSignal,
) {
  if (manifest.session && Date.now() < manifest.expiresAt) {
    try {
      await requestWithTimeout(
        (requestSignal) =>
          mobileApiRequest(
            `/api/storage/customer/sessions/${encodeURIComponent(manifest.session!.id)}/abort`,
            {
              authenticated: true,
              body: { expectedVersion: manifest.session!.version },
              headers: {
                "Idempotency-Key": manifest.idempotency.abort,
              },
              method: "POST",
              signal: requestSignal,
            },
          ),
        signal,
        MEDIA_UPLOAD_REQUEST_TIMEOUT_MS,
      );
    } catch {
      // The server session is owner-scoped and expires automatically. Local
      // cleanup must not be blocked by an unavailable abort endpoint.
    }
  }
  await cleanupCustomerAvatarUpload(manifest);
}

export function createCustomerAvatarUploadDependencies(input: {
  onCommitPhaseChange?:
    CustomerAvatarUploadEngineDependencies["onCommitPhaseChange"];
  onActiveCancel(cancel: (() => void) | null): void;
  onProgress(fraction: number): void;
  signal: AbortSignal;
}): CustomerAvatarUploadEngineDependencies {
  return {
    async attach({
      assetId,
      containerVersion,
      idempotencyKey,
      replace,
      signal,
    }) {
      return requestData<CustomerMediaContainer>(
        "/api/media/customer/profile",
        {
          body: {
            altText: null,
            assetId,
            expectedVersion: containerVersion,
            productVariantId: null,
            slot: "CUSTOMER_AVATAR",
          },
          headers: { "Idempotency-Key": idempotencyKey },
          method: replace ? "PUT" : "POST",
          signal,
        },
      );
    },
    cleanupLocal: cleanupCustomerAvatarUpload,
    async createSession({
      checksumSha256,
      idempotencyKey,
      mimeType,
      signal,
      sizeBytes,
    }) {
      return requestData<{ id: string; version: number }>(
        "/api/storage/customer/sessions",
        {
          body: {
            displayName: "avatar.jpg",
            expectedChecksumSha256: checksumSha256,
            expectedMimeType: mimeType,
            expectedSizeBytes: sizeBytes,
            purpose: "CUSTOMER_AVATAR",
          },
          headers: { "Idempotency-Key": idempotencyKey },
          method: "POST",
          signal,
        },
      );
    },
    async finalize({ idempotencyKey, sessionId, signal, version }) {
      return requestData<{ asset: { id: string; state: string } }>(
        `/api/storage/customer/sessions/${encodeURIComponent(sessionId)}/finalize`,
        {
          body: { expectedVersion: version },
          headers: { "Idempotency-Key": idempotencyKey },
          method: "POST",
          signal,
        },
      );
    },
    getContainer(signal) {
      return requestData<CustomerMediaContainer>(
        "/api/media/customer/profile",
        { signal },
      );
    },
    async isOnline() {
      const state = await Network.getNetworkStateAsync();
      return state.isConnected === true && state.isInternetReachable !== false;
    },
    async issueTarget({
      idempotencyKey,
      mimeType,
      sessionId,
      signal,
      sizeBytes,
      version,
    }) {
      const target = await requestData<unknown>(
        `/api/storage/customer/sessions/${encodeURIComponent(sessionId)}/target`,
        {
          body: { expectedVersion: version },
          headers: { "Idempotency-Key": idempotencyKey },
          method: "POST",
          signal,
        },
      );
      return validateUploadTarget(target, {
        mimeType,
        sizeBytes,
      });
    },
    now: Date.now,
    onCommitPhaseChange: input.onCommitPhaseChange,
    onProgress: input.onProgress,
    persist: persistCustomerAvatarUpload,
    signal: input.signal,
    async upload({ fileUri, signal, target }) {
      const file = new File(fileUri);
      const controller = linkedAbortController(signal);
      const timeout = setTimeout(
        () => controller.abort("timeout"),
        MEDIA_UPLOAD_TRANSFER_TIMEOUT_MS,
      );
      const task = file.createUploadTask(target.url, {
        headers: target.headers,
        httpMethod: target.method,
        mimeType: "image/jpeg",
        onProgress: ({ bytesSent, totalBytes }) =>
          input.onProgress(uploadProgressFraction(bytesSent, totalBytes)),
        sessionType: "background",
        signal: controller.signal,
        uploadType: UploadType.BINARY_CONTENT,
      });
      input.onActiveCancel(() => task.cancel());
      try {
        const result = await task.uploadAsync();
        return { status: result.status };
      } catch (error) {
        if (controller.signal.aborted && !signal.aborted) {
          throw new MediaUploadRuntimeError("TIMEOUT", { cause: error });
        }
        throw error;
      } finally {
        clearTimeout(timeout);
        input.onActiveCancel(null);
        task.release();
      }
    },
    uuid: Crypto.randomUUID,
  };
}

async function requestData<T>(
  path: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
    method?: "GET" | "POST" | "PUT";
    signal: AbortSignal;
  },
) {
  return requestWithTimeout(
    async (signal) => {
      const response = await mobileApiRequest<Data<T>>(path, {
        authenticated: true,
        body: options.body,
        headers: options.headers,
        method: options.method,
        signal,
      });
      return response.data;
    },
    options.signal,
    MEDIA_UPLOAD_REQUEST_TIMEOUT_MS,
  );
}

async function requestWithTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  parentSignal: AbortSignal,
  timeoutMs: number,
) {
  const controller = linkedAbortController(parentSignal);
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted && !parentSignal.aborted) {
      throw new MediaUploadRuntimeError("TIMEOUT", { cause: error });
    }
    if (
      !parentSignal.aborted
      && error instanceof TypeError
    ) {
      throw new MediaUploadRuntimeError("NETWORK_ERROR", { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function linkedAbortController(parentSignal: AbortSignal) {
  const controller = new AbortController();
  if (parentSignal.aborted) controller.abort(parentSignal.reason);
  else {
    parentSignal.addEventListener(
      "abort",
      () => controller.abort(parentSignal.reason),
      { once: true },
    );
  }
  return controller;
}

function readHeader(file: File) {
  const handle = file.open(FileMode.ReadOnly);
  try {
    return handle.readBytes(Math.min(64, handle.size ?? 64));
  } finally {
    handle.close();
  }
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await Crypto.digest(
    Crypto.CryptoDigestAlgorithm.SHA256,
    Uint8Array.from(bytes),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function managedDirectory() {
  return new Directory(Paths.document, MANAGED_DIRECTORY_NAME);
}

function ensureDirectory(directory: Directory) {
  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true });
  }
}

function assertManagedFile(manifest: CustomerAvatarUploadManifest) {
  const expected = new File(
    managedDirectory(),
    `${manifest.operationId}.jpg`,
  ).uri;
  if (manifest.file.uri !== expected) {
    throw new MediaUploadPolicyError("RECOVERY_UNSAFE_PATH");
  }
}

async function cleanupManagedDirectory(activeUri?: string) {
  const directory = managedDirectory();
  if (!directory.exists) return;
  for (const entry of directory.list()) {
    if (
      entry instanceof File
      && entry.uri !== activeUri
      && /^[0-9a-f-]{36}\.jpg$/i.test(entry.name)
    ) {
      safeDelete(entry);
    }
  }
}

function safeDelete(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {
    // Cleanup is deliberately best-effort and never logs a private path.
  }
}

function deleteManagedFile(file: File) {
  if (!file.exists) return;
  file.delete();
  if (file.exists) {
    throw new MediaUploadRuntimeError("RECOVERY_CLEANUP_FAILED");
  }
}

export function isExpectedMediaUploadError(error: unknown) {
  return (
    error instanceof MediaUploadRuntimeError
    || error instanceof MediaUploadPolicyError
    || error instanceof MobileApiRequestError
  );
}
