import "server-only";

import {
  StoragePurpose,
  StoredAssetState,
  UploadSessionState,
} from "@prisma/client";

import { StorageDomainError, storageError } from "@/features/storage/domain/errors";
import { isUuid, STORAGE_JSON_BODY_MAX_BYTES } from "@/features/storage/domain/policy";
import { isStoragePurpose } from "@/features/storage/domain/purpose-registry";

export async function readStorageJson(request: Request, allowed: readonly string[]) {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const length = Number(contentLength);
    if (!Number.isSafeInteger(length) || length < 0 || length > STORAGE_JSON_BODY_MAX_BYTES) {
      storageError("VALIDATION_ERROR", "Request body is too large.");
    }
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") storageError("VALIDATION_ERROR", "application/json is required.");
  const text = await readBoundedStorageBody(request, STORAGE_JSON_BODY_MAX_BYTES);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    storageError("VALIDATION_ERROR", "A valid JSON object is required.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    storageError("VALIDATION_ERROR", "A valid JSON object is required.");
  }
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  for (const key of keys) {
    if (!allowed.includes(key)) storageError("VALIDATION_ERROR", `Unsupported field: ${key}.`);
  }
  return body;
}

export function idempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key")?.trim();
  if (!value || value.includes(",") || !isUuid(value)) {
    storageError("VALIDATION_ERROR", "Idempotency-Key must be one UUID.");
  }
  return value.toLowerCase();
}

export function routeUuid(value: string, name: string) {
  if (!isUuid(value)) storageError("VALIDATION_ERROR", `${name} must be a UUID.`);
  return value.toLowerCase();
}

export async function parseCreateSession(request: Request) {
  const body = await readStorageJson(request, [
    "displayName",
    "expectedChecksumSha256",
    "expectedMimeType",
    "expectedSizeBytes",
    "purpose",
  ]);
  if (!isStoragePurpose(body.purpose)) storageError("VALIDATION_ERROR", "purpose is invalid.");
  return {
    displayName: body.displayName,
    expectedChecksumSha256: body.expectedChecksumSha256,
    expectedMimeType: body.expectedMimeType,
    expectedSizeBytes: body.expectedSizeBytes,
    idempotencyKey: idempotencyKey(request),
    purpose: body.purpose,
  };
}

export async function parseVersionMutation(request: Request) {
  const body = await readStorageJson(request, ["expectedVersion"]);
  if (!Number.isInteger(body.expectedVersion) || Number(body.expectedVersion) < 1) {
    storageError("VALIDATION_ERROR", "expectedVersion must be a positive integer.");
  }
  return { expectedVersion: Number(body.expectedVersion), idempotencyKey: idempotencyKey(request) };
}

export function parseAssetListQuery(url: URL) {
  strictQuery(url.searchParams, ["cursor", "limit", "purpose", "state"]);
  const purpose = url.searchParams.get("purpose");
  const state = url.searchParams.get("state");
  if (purpose && !Object.values(StoragePurpose).includes(purpose as StoragePurpose)) {
    storageError("VALIDATION_ERROR", "purpose query is invalid.");
  }
  if (state && !Object.values(StoredAssetState).includes(state as StoredAssetState)) {
    storageError("VALIDATION_ERROR", "state query is invalid.");
  }
  return {
    cursor: url.searchParams.get("cursor"),
    limit: parseLimit(url.searchParams.get("limit")),
    purpose: purpose as StoragePurpose | null,
    state: state as StoredAssetState | null,
  };
}

export function parseSessionListQuery(url: URL) {
  strictQuery(url.searchParams, ["cursor", "limit", "state"]);
  const state = url.searchParams.get("state");
  if (state && !Object.values(UploadSessionState).includes(state as UploadSessionState)) {
    storageError("VALIDATION_ERROR", "state query is invalid.");
  }
  return {
    cursor: url.searchParams.get("cursor"),
    limit: parseLimit(url.searchParams.get("limit")),
    state: state as UploadSessionState | null,
  };
}

export async function parseCleanup(request: Request) {
  const body = await readStorageJson(request, ["batchSize"]);
  if (body.batchSize !== undefined && !Number.isInteger(body.batchSize)) {
    storageError("VALIDATION_ERROR", "batchSize must be an integer.");
  }
  return {
    batchSize: body.batchSize === undefined ? undefined : Number(body.batchSize),
    idempotencyKey: idempotencyKey(request),
  };
}

export async function assertEmptyStorageBody(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && contentLength !== "0") {
    storageError("VALIDATION_ERROR", "This storage request does not accept a body.");
  }
  if (await readBoundedStorageBody(request, 0)) {
    storageError("VALIDATION_ERROR", "This storage request does not accept a body.");
  }
}

function strictQuery(parameters: URLSearchParams, allowed: readonly string[]) {
  for (const key of parameters.keys()) {
    if (!allowed.includes(key) || parameters.getAll(key).length !== 1) {
      storageError("VALIDATION_ERROR", `Unsupported or duplicate query parameter: ${key}.`);
    }
  }
}

function parseLimit(value: string | null) {
  if (value === null) return undefined;
  if (!/^\d{1,2}$/.test(value)) storageError("VALIDATION_ERROR", "limit is invalid.");
  return Number(value);
}

async function readBoundedStorageBody(request: Request, maximumBytes: number) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        storageError("VALIDATION_ERROR", maximumBytes === 0
          ? "This storage request does not accept a body."
          : "Request body is too large.");
      }
      chunks.push(value);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, total));
  } catch (error) {
    if (error instanceof StorageDomainError) throw error;
    storageError("VALIDATION_ERROR", "A valid UTF-8 request body is required.");
  }
}
