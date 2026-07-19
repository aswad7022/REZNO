import { createHash, randomUUID } from "node:crypto";
import type { StoragePurpose } from "@prisma/client";

import { storageError } from "@/features/storage/domain/errors";

export const STORAGE_SESSION_TTL_MS = 15 * 60 * 1000;
export const STORAGE_TARGET_TTL_SECONDS = 5 * 60;
export const STORAGE_ORPHAN_RETENTION_MS = 24 * 60 * 60 * 1000;
export const STORAGE_PROVIDER_CLAIM_TTL_MS = 15 * 60 * 1000;
export const STORAGE_MAX_DECODED_PIXELS = 40_000_000;
export const STORAGE_JSON_BODY_MAX_BYTES = 32 * 1024;

export const STORAGE_QUOTA_LIMITS = {
  person: {
    activeSessions: 5,
    dailyFinalizedBytes: 100 * 1024 * 1024,
    dailySessions: 30,
    pendingBytes: 25 * 1024 * 1024,
  },
  organization: {
    activeSessions: 10,
    dailyFinalizedBytes: 1024 * 1024 * 1024,
    dailySessions: 100,
    pendingBytes: 100 * 1024 * 1024,
  },
  internal: {
    activeSessions: 10,
    dailyFinalizedBytes: 100 * 1024 * 1024,
    dailySessions: 30,
    pendingBytes: 25 * 1024 * 1024,
  },
} as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function normalizeChecksum(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    storageError("VALIDATION_ERROR", "expectedChecksumSha256 must be lowercase SHA-256 hex.");
  }
  return value;
}

export function sanitizeStorageDisplayName(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    storageError("VALIDATION_ERROR", "displayName must be text.");
  }
  const normalized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || normalized === "." || normalized === ".." || normalized.length > 180) {
    storageError("VALIDATION_ERROR", "displayName is invalid or too long.");
  }
  return normalized;
}

export function storageRuntimeEnvironment(environment = process.env) {
  if (environment.NODE_ENV === "test") return "test" as const;
  if (environment.REZNO_ENV === "staging" || environment.VERCEL_ENV === "preview") {
    return "staging" as const;
  }
  if (environment.NODE_ENV === "production") return "production" as const;
  return "development" as const;
}

export function generateStorageObjectKey(
  purpose: StoragePurpose,
  options: {
    environment?: ReturnType<typeof storageRuntimeEnvironment>;
    random?: () => string;
  } = {},
) {
  const environment = options.environment ?? storageRuntimeEnvironment();
  const nextUuid = options.random ?? randomUUID;
  const ownerScope = nextUuid().toLowerCase();
  const objectId = nextUuid().toLowerCase();
  if (!isUuid(ownerScope) || !isUuid(objectId)) {
    throw new Error("Storage object key randomness did not produce UUIDs.");
  }
  const purposeSegment = purpose.toLowerCase().replaceAll("_", "-");
  return `${environment}/${purposeSegment}/${ownerScope}/${objectId}`;
}

export function isServerGeneratedStorageKey(value: string) {
  return /^(development|test|staging|production)\/[a-z0-9-]+\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
    && !value.includes("..")
    && !value.includes("\\");
}

export function storageRequestHash(value: unknown) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function sha256Hex(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(null);
}
