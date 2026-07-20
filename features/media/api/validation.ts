import "server-only";

import type { MediaSlot } from "@prisma/client";

import { mediaError } from "@/features/media/domain/errors";
import { MEDIA_JSON_BODY_MAX_BYTES, type MediaTarget } from "@/features/media/domain/policy";
import { isMediaSlot } from "@/features/media/domain/slot-registry";
import { isUuid } from "@/features/storage/domain/policy";

export function mediaIdempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key")?.trim();
  if (!value || value.includes(",") || !isUuid(value)) {
    mediaError("VALIDATION_ERROR", "Idempotency-Key must be one UUID.");
  }
  return value.toLowerCase();
}

export function mediaRouteUuid(value: string, name: string) {
  if (!isUuid(value)) mediaError("VALIDATION_ERROR", `${name} must be a UUID.`);
  return value.toLowerCase();
}

export async function parseAttachMedia(request: Request, target: MediaTarget) {
  const body = await readMediaJson(request, ["altText", "assetId", "expectedVersion", "productVariantId", "slot"]);
  const slot = parseSlot(body.slot);
  if (!isUuid(body.assetId) || !version(body.expectedVersion, true)) {
    mediaError("VALIDATION_ERROR", "assetId and expectedVersion are invalid.");
  }
  if (body.productVariantId !== undefined && body.productVariantId !== null && !isUuid(body.productVariantId)) {
    mediaError("VALIDATION_ERROR", "productVariantId must be a UUID or null.");
  }
  return {
    altText: body.altText,
    assetId: body.assetId,
    expectedVersion: Number(body.expectedVersion),
    idempotencyKey: mediaIdempotencyKey(request),
    productVariantId: body.productVariantId as string | null | undefined,
    slot,
    target,
  };
}

export async function parseBindingMutation(
  request: Request,
  target: MediaTarget,
  bindingId: string,
) {
  const body = await readMediaJson(request, ["expectedVersion", "slot"]);
  if (!version(body.expectedVersion, false)) mediaError("VALIDATION_ERROR", "expectedVersion is invalid.");
  return {
    bindingId: mediaRouteUuid(bindingId, "bindingId"),
    expectedVersion: Number(body.expectedVersion),
    idempotencyKey: mediaIdempotencyKey(request),
    slot: parseSlot(body.slot),
    target,
  };
}

export async function parseAltMutation(request: Request, target: MediaTarget, bindingId: string) {
  const body = await readMediaJson(request, ["altText", "expectedVersion", "slot"]);
  if (!version(body.expectedVersion, false)) mediaError("VALIDATION_ERROR", "expectedVersion is invalid.");
  return {
    altText: body.altText,
    bindingId: mediaRouteUuid(bindingId, "bindingId"),
    expectedVersion: Number(body.expectedVersion),
    idempotencyKey: mediaIdempotencyKey(request),
    slot: parseSlot(body.slot),
    target,
  };
}

export async function parseReorderMedia(request: Request, target: MediaTarget) {
  const body = await readMediaJson(request, ["bindingIds", "expectedVersion", "slot"]);
  if (!Array.isArray(body.bindingIds) || !version(body.expectedVersion, false)) {
    mediaError("VALIDATION_ERROR", "bindingIds and expectedVersion are invalid.");
  }
  return {
    bindingIds: body.bindingIds as unknown[],
    expectedVersion: Number(body.expectedVersion),
    idempotencyKey: mediaIdempotencyKey(request),
    slot: parseSlot(body.slot),
    target,
  };
}

export function assertNoMediaQuery(request: Request) {
  const parameters = new URL(request.url).searchParams;
  for (const key of parameters.keys()) mediaError("VALIDATION_ERROR", `Unsupported query parameter: ${key}.`);
}

async function readMediaJson(request: Request, allowed: readonly string[]) {
  const type = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (type !== "application/json") mediaError("VALIDATION_ERROR", "application/json is required.");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/u.test(length) || Number(length) > MEDIA_JSON_BODY_MAX_BYTES)) {
    mediaError("VALIDATION_ERROR", "Request body is too large.");
  }
  const text = await readBoundedBody(request);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { mediaError("VALIDATION_ERROR", "A valid JSON object is required."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    mediaError("VALIDATION_ERROR", "A valid JSON object is required.");
  }
  const body = parsed as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) mediaError("VALIDATION_ERROR", `Unsupported field: ${key}.`);
  }
  return body;
}

async function readBoundedBody(request: Request) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MEDIA_JSON_BODY_MAX_BYTES) {
      await reader.cancel();
      mediaError("VALIDATION_ERROR", "Request body is too large.");
    }
    chunks.push(value);
  }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, total)); }
  catch { mediaError("VALIDATION_ERROR", "A valid UTF-8 request body is required."); }
}

function parseSlot(value: unknown): MediaSlot {
  if (!isMediaSlot(value)) mediaError("VALIDATION_ERROR", "slot is invalid.");
  return value;
}

function version(value: unknown, zeroAllowed: boolean) {
  return Number.isInteger(value) && Number(value) >= (zeroAllowed ? 0 : 1);
}
