export const MEDIA_UPLOAD_SCHEMA_VERSION = 1 as const;
export const MEDIA_UPLOAD_MAX_ATTEMPTS = 3;
export const MEDIA_UPLOAD_OPERATION_TTL_MS = 15 * 60 * 1000;
export const MEDIA_UPLOAD_SOURCE_MAX_BYTES = 20 * 1024 * 1024;
export const CUSTOMER_AVATAR_NORMALIZED_MAX_BYTES = 5 * 1024 * 1024;
export const MEDIA_UPLOAD_MAX_PIXELS = 40_000_000;
export const MEDIA_UPLOAD_MAX_DIMENSION = 2_048;
export const MEDIA_UPLOAD_REQUEST_TIMEOUT_MS = 20_000;
export const MEDIA_UPLOAD_TRANSFER_TIMEOUT_MS = 60_000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_OWNER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const CHECKPOINTS = [
  "CREATE_SESSION",
  "ISSUE_TARGET",
  "UPLOAD",
  "FINALIZE",
  "ATTACH",
] as const;

export type MediaInputSource = "CAMERA" | "LIBRARY" | "ANDROID_RECOVERY";
export type MediaPermissionDisposition =
  | "GRANTED"
  | "DENIED_RETRYABLE"
  | "DENIED_BLOCKED";
export type SniffedImageFormat =
  | "AVIF"
  | "HEIC"
  | "JPEG"
  | "PNG"
  | "UNSUPPORTED"
  | "WEBP";
export type MediaUploadCheckpoint = (typeof CHECKPOINTS)[number];

export type CustomerAvatarUploadManifest = {
  schemaVersion: typeof MEDIA_UPLOAD_SCHEMA_VERSION;
  operationId: string;
  ownerId: string;
  destination: {
    kind: "CUSTOMER_PROFILE";
    ownerId: string;
    slot: "CUSTOMER_AVATAR";
  };
  source: MediaInputSource;
  createdAt: number;
  expiresAt: number;
  checkpoint: MediaUploadCheckpoint;
  attempts: number;
  containerVersion: number;
  file: {
    checksumSha256: string;
    mimeType: "image/jpeg";
    sizeBytes: number;
    uri: string;
  };
  idempotency: {
    abort: string;
    attach: string;
    create: string;
    finalize: string;
    target: string;
  };
  session: {
    id: string;
    targetExpiresAt: number | null;
    targetRequestVersion: number;
    version: number;
  } | null;
  assetId: string | null;
};

export type SafeUploadTarget = {
  expiresAt: number;
  headers: Record<string, string>;
  method: "PUT";
  sessionVersion: number;
  url: string;
};

export class MediaUploadPolicyError extends Error {
  constructor(readonly code: string, message = code) {
    super(message);
    this.name = "MediaUploadPolicyError";
  }
}

export function mediaPermissionDisposition(permission: {
  canAskAgain: boolean;
  granted: boolean;
}): MediaPermissionDisposition {
  if (permission.granted) return "GRANTED";
  return permission.canAskAgain ? "DENIED_RETRYABLE" : "DENIED_BLOCKED";
}

export function firstSelectedImage<T>(result: unknown): T | null {
  if (
    !isRecord(result)
    || result.canceled !== false
    || !Array.isArray(result.assets)
  ) {
    return null;
  }
  return (result.assets[0] as T | undefined) ?? null;
}

export function isImagePickerErrorResult(result: unknown) {
  return (
    isRecord(result)
    && typeof result.code === "string"
    && result.code.length > 0
    && result.canceled !== true
  );
}

export function sniffImageFormat(bytes: Uint8Array): SniffedImageFormat {
  if (
    bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff
  ) {
    return "JPEG";
  }
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) {
    return "PNG";
  }
  if (
    bytes.length >= 12
    && ascii(bytes, 0, 4) === "RIFF"
    && ascii(bytes, 8, 12) === "WEBP"
  ) {
    return "WEBP";
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const brands = isoBaseMediaBrands(bytes);
    if (brands.some((brand) => brand === "avif" || brand === "avis")) {
      return "AVIF";
    }
    if (
      brands.some((brand) =>
        [
          "heic",
          "heix",
          "hevc",
          "hevx",
          "heim",
          "heis",
          "mif1",
          "msf1",
        ].includes(brand),
      )
    ) {
      return "HEIC";
    }
  }
  return "UNSUPPORTED";
}

export function validateSelectedImage(input: {
  fileSize: number;
  height: number;
  type?: string | null;
  width: number;
}) {
  if (input.type && input.type !== "image") {
    throw new MediaUploadPolicyError(
      "UNSUPPORTED_MEDIA_TYPE",
      "Only still images are accepted.",
    );
  }
  if (
    !Number.isSafeInteger(input.fileSize)
    || input.fileSize <= 0
    || input.fileSize > MEDIA_UPLOAD_SOURCE_MAX_BYTES
  ) {
    throw new MediaUploadPolicyError(
      input.fileSize > MEDIA_UPLOAD_SOURCE_MAX_BYTES
        ? "FILE_TOO_LARGE"
        : "INVALID_FILE",
      "The selected file size is invalid.",
    );
  }
  if (
    !Number.isFinite(input.width)
    || !Number.isFinite(input.height)
    || input.width <= 0
    || input.height <= 0
    || input.width * input.height > MEDIA_UPLOAD_MAX_PIXELS
  ) {
    throw new MediaUploadPolicyError(
      "PIXEL_LIMIT_EXCEEDED",
      "The selected image dimensions are unsafe.",
    );
  }
}

export function createCustomerAvatarUploadManifest(input: {
  checksumSha256: string;
  containerVersion: number;
  fileUri: string;
  now: number;
  operationId: string;
  ownerId: string;
  sizeBytes: number;
  source: MediaInputSource;
  uuid: () => string;
}): CustomerAvatarUploadManifest {
  const manifest: CustomerAvatarUploadManifest = {
    schemaVersion: MEDIA_UPLOAD_SCHEMA_VERSION,
    operationId: input.operationId,
    ownerId: input.ownerId,
    destination: {
      kind: "CUSTOMER_PROFILE",
      ownerId: input.ownerId,
      slot: "CUSTOMER_AVATAR",
    },
    source: input.source,
    createdAt: input.now,
    expiresAt: input.now + MEDIA_UPLOAD_OPERATION_TTL_MS,
    checkpoint: "CREATE_SESSION",
    attempts: 0,
    containerVersion: input.containerVersion,
    file: {
      checksumSha256: input.checksumSha256,
      mimeType: "image/jpeg",
      sizeBytes: input.sizeBytes,
      uri: input.fileUri,
    },
    idempotency: {
      abort: input.uuid(),
      attach: input.uuid(),
      create: input.uuid(),
      finalize: input.uuid(),
      target: input.uuid(),
    },
    session: null,
    assetId: null,
  };
  return validateCustomerAvatarUploadManifest(manifest, {
    now: input.now,
    ownerId: input.ownerId,
  });
}

export function parseCustomerAvatarUploadManifest(
  value: string,
  expectation: { allowExpired?: boolean; now: number; ownerId: string },
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new MediaUploadPolicyError("RECOVERY_INVALID");
  }
  return validateCustomerAvatarUploadManifest(parsed, expectation);
}

export function validateCustomerAvatarUploadManifest(
  value: unknown,
  expectation: { allowExpired?: boolean; now: number; ownerId: string },
): CustomerAvatarUploadManifest {
  if (!isRecord(value)) throw new MediaUploadPolicyError("RECOVERY_INVALID");
  const destination = value.destination;
  const file = value.file;
  const idempotency = value.idempotency;
  const session = value.session;
  if (
    !hasExactKeys(value, [
      "assetId",
      "attempts",
      "checkpoint",
      "containerVersion",
      "createdAt",
      "destination",
      "expiresAt",
      "file",
      "idempotency",
      "operationId",
      "ownerId",
      "schemaVersion",
      "session",
      "source",
    ])
    || value.schemaVersion !== MEDIA_UPLOAD_SCHEMA_VERSION
    || !isUuid(value.operationId)
    || !safeOwnerId(value.ownerId)
    || value.ownerId !== expectation.ownerId
    || !isRecord(destination)
    || !hasExactKeys(destination, ["kind", "ownerId", "slot"])
    || destination.kind !== "CUSTOMER_PROFILE"
    || destination.ownerId !== value.ownerId
    || destination.slot !== "CUSTOMER_AVATAR"
    || !["CAMERA", "LIBRARY", "ANDROID_RECOVERY"].includes(String(value.source))
    || !isTimestamp(value.createdAt)
    || !isTimestamp(value.expiresAt)
    || value.expiresAt <= value.createdAt
    || value.expiresAt - value.createdAt > MEDIA_UPLOAD_OPERATION_TTL_MS
    || value.createdAt > expectation.now + 30_000
    || !CHECKPOINTS.includes(value.checkpoint as MediaUploadCheckpoint)
    || !Number.isInteger(value.attempts)
    || Number(value.attempts) < 0
    || Number(value.attempts) > MEDIA_UPLOAD_MAX_ATTEMPTS
    || !Number.isInteger(value.containerVersion)
    || Number(value.containerVersion) < 0
    || !isRecord(file)
    || !hasExactKeys(file, [
      "checksumSha256",
      "mimeType",
      "sizeBytes",
      "uri",
    ])
    || typeof file.uri !== "string"
    || file.uri.length < 1
    || file.uri.length > 2_048
    || file.mimeType !== "image/jpeg"
    || !Number.isSafeInteger(file.sizeBytes)
    || Number(file.sizeBytes) <= 0
    || Number(file.sizeBytes) > CUSTOMER_AVATAR_NORMALIZED_MAX_BYTES
    || !isSha256(file.checksumSha256)
    || !isRecord(idempotency)
    || !hasExactKeys(idempotency, [
      "abort",
      "attach",
      "create",
      "finalize",
      "target",
    ])
    || !["abort", "attach", "create", "finalize", "target"].every((key) =>
      isUuid(idempotency[key]),
    )
    || (value.assetId !== null && !isUuid(value.assetId))
  ) {
    throw new MediaUploadPolicyError("RECOVERY_INVALID");
  }
  if (!expectation.allowExpired && expectation.now >= Number(value.expiresAt)) {
    throw new MediaUploadPolicyError("RECOVERY_EXPIRED");
  }
  if (session !== null) {
    if (
      !isRecord(session)
      || !hasExactKeys(session, [
        "id",
        "targetExpiresAt",
        "targetRequestVersion",
        "version",
      ])
      || !isUuid(session.id)
      || !Number.isInteger(session.version)
      || Number(session.version) < 1
      || !Number.isInteger(session.targetRequestVersion)
      || Number(session.targetRequestVersion) < 1
      || (
        session.targetExpiresAt !== null
        && !isTimestamp(session.targetExpiresAt)
      )
    ) {
      throw new MediaUploadPolicyError("RECOVERY_INVALID");
    }
  } else if (value.checkpoint !== "CREATE_SESSION") {
    throw new MediaUploadPolicyError("RECOVERY_INVALID");
  }
  if (value.checkpoint === "ATTACH" && !isUuid(value.assetId)) {
    throw new MediaUploadPolicyError("RECOVERY_INVALID");
  }
  return value as CustomerAvatarUploadManifest;
}

export function rotateUploadTargetGeneration(
  manifest: CustomerAvatarUploadManifest,
  uuid: () => string,
): CustomerAvatarUploadManifest {
  if (!manifest.session) {
    throw new MediaUploadPolicyError("RECOVERY_INVALID");
  }
  return {
    ...manifest,
    checkpoint: "ISSUE_TARGET",
    idempotency: {
      ...manifest.idempotency,
      finalize: uuid(),
      target: uuid(),
    },
    session: {
      ...manifest.session,
      targetExpiresAt: null,
      targetRequestVersion: manifest.session.version,
    },
  };
}

export function validateUploadTarget(
  value: unknown,
  expected: { mimeType: "image/jpeg"; sizeBytes: number },
): SafeUploadTarget {
  if (!isRecord(value) || !isRecord(value.headers)) {
    throw new MediaUploadPolicyError("UNSAFE_UPLOAD_TARGET");
  }
  let url: URL;
  try {
    url = new URL(String(value.url));
  } catch {
    throw new MediaUploadPolicyError("UNSAFE_UPLOAD_TARGET");
  }
  const headerEntries = Object.entries(value.headers);
  const normalizedHeaders = new Map<string, string>();
  for (const [key, raw] of headerEntries) {
    if (typeof raw !== "string") {
      throw new MediaUploadPolicyError("UNSAFE_UPLOAD_TARGET");
    }
    const normalized = key.toLowerCase();
    if (normalizedHeaders.has(normalized)) {
      throw new MediaUploadPolicyError("UNSAFE_UPLOAD_TARGET");
    }
    normalizedHeaders.set(normalized, raw);
  }
  const allowedHeaders = ["content-length", "content-type", "if-none-match"];
  if (
    value.method !== "PUT"
    || typeof value.url !== "string"
    || value.url.length > 8_192
    || url.protocol !== "https:"
    || !url.hostname
    || Boolean(url.username)
    || Boolean(url.password)
    || Boolean(url.hash)
    || !Number.isInteger(value.sessionVersion)
    || Number(value.sessionVersion) < 1
    || typeof value.expiresAt !== "string"
    || !Number.isFinite(Date.parse(value.expiresAt))
    || [...normalizedHeaders.keys()].some((key) => !allowedHeaders.includes(key))
    || normalizedHeaders.size !== allowedHeaders.length
    || normalizedHeaders.get("content-length") !== String(expected.sizeBytes)
    || normalizedHeaders.get("content-type") !== expected.mimeType
    || normalizedHeaders.get("if-none-match") !== "*"
  ) {
    throw new MediaUploadPolicyError("UNSAFE_UPLOAD_TARGET");
  }
  return {
    expiresAt: Date.parse(value.expiresAt),
    headers: Object.fromEntries(normalizedHeaders),
    method: "PUT",
    sessionVersion: Number(value.sessionVersion),
    url: url.toString(),
  };
}

export function uploadProgressFraction(bytesSent: number, totalBytes: number) {
  if (
    !Number.isFinite(bytesSent)
    || !Number.isFinite(totalBytes)
    || totalBytes <= 0
  ) {
    return 0;
  }
  return Math.min(1, Math.max(0, bytesSent / totalBytes));
}

export function canAttemptUpload(manifest: CustomerAvatarUploadManifest) {
  return manifest.attempts < MEDIA_UPLOAD_MAX_ATTEMPTS;
}

export function retryDelayMs(attempts: number) {
  if (!Number.isInteger(attempts) || attempts < 0) return 0;
  return [1_000, 2_500, 5_000][Math.min(attempts, 2)] ?? 5_000;
}

export function isTargetFresh(
  manifest: CustomerAvatarUploadManifest,
  now: number,
) {
  return Boolean(
    manifest.session?.targetExpiresAt
    && manifest.session.targetExpiresAt - now > 5_000,
  );
}

function isoBaseMediaBrands(bytes: Uint8Array) {
  const brands: string[] = [];
  for (let offset = 8; offset + 4 <= Math.min(bytes.length, 64); offset += 4) {
    brands.push(ascii(bytes, offset, offset + 4).toLowerCase());
  }
  return brands;
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function safeOwnerId(value: unknown): value is string {
  return typeof value === "string" && SAFE_OWNER_ID_PATTERN.test(value);
}

function isTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}
