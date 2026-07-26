import type {
  PushPermissionStatus,
  PushPlatform,
  PushProvider,
} from "@prisma/client";

import { pushNotificationError } from "@/features/push-notifications/domain/errors";

const MAX_CUSTOMER_BODY_BYTES = 8 * 1024;
const MAX_RECEIPT_BODY_BYTES = 64 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const APP_VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,49}$/;
const SAFE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_.:-]{0,79}$/;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:~-]{0,190}$/;

export type RegisterPushInstallationInput = {
  installationId: string;
  installationSecret: string;
  platform: PushPlatform;
  provider: PushProvider;
  permissionStatus: PushPermissionStatus;
  token: string;
  appVersion: string;
  idempotencyKey: string;
  operationGeneration: number;
};

export type RevokePushInstallationInput = {
  installationId: string;
  installationSecret: string;
  idempotencyKey: string;
  operationGeneration: number;
};

export async function parseRegisterPushInstallation(request: Request) {
  const body = await readBoundedJsonObject(request, MAX_CUSTOMER_BODY_BYTES);
  assertExactKeys(body, [
    "appVersion",
    "installationId",
    "installationSecret",
    "operationGeneration",
    "permissionStatus",
    "platform",
    "provider",
    "token",
  ]);
  const installationId = parseUuid(body.installationId, "installationId");
  const installationSecret = parseInstallationSecret(body.installationSecret);
  const platform = parseOneOf(body.platform, ["IOS", "ANDROID"] as const, "platform");
  const provider = parseOneOf(body.provider, ["APNS", "FCM"] as const, "provider");
  const permissionStatus = parseOneOf(
    body.permissionStatus,
    ["GRANTED", "PROVISIONAL"] as const,
    "permissionStatus",
  );
  if (
    (platform === "IOS" && provider !== "APNS")
    || (platform === "ANDROID" && provider !== "FCM")
  ) {
    pushNotificationError(
      "VALIDATION_ERROR",
      "The push provider does not match the device platform.",
    );
  }
  const token = parseToken(body.token, provider);
  const appVersion =
    typeof body.appVersion === "string" && APP_VERSION_PATTERN.test(body.appVersion)
      ? body.appVersion
      : pushNotificationError("VALIDATION_ERROR", "appVersion is invalid.");
  return {
    appVersion,
    idempotencyKey: parseIdempotencyKey(request),
    installationId,
    installationSecret,
    permissionStatus,
    platform,
    provider,
    token,
    operationGeneration: parseOperationGeneration(body.operationGeneration),
  } satisfies RegisterPushInstallationInput;
}

export async function parseRevokePushInstallation(request: Request) {
  const body = await readBoundedJsonObject(request, MAX_CUSTOMER_BODY_BYTES);
  assertExactKeys(body, [
    "installationId",
    "installationSecret",
    "operationGeneration",
  ]);
  return {
    idempotencyKey: parseIdempotencyKey(request),
    installationId: parseUuid(body.installationId, "installationId"),
    installationSecret: parseInstallationSecret(body.installationSecret),
    operationGeneration: parseOperationGeneration(body.operationGeneration),
  } satisfies RevokePushInstallationInput;
}

export async function readAuthenticatedReceiptBody(request: Request) {
  const timestamp = request.headers.get("x-rezno-push-timestamp")?.trim() ?? "";
  const signature = request.headers.get("x-rezno-push-signature")?.trim() ?? "";
  if (!/^[0-9]{10}$/.test(timestamp) || !signature) {
    pushNotificationError("RECEIPT_REJECTED", "Receipt authentication failed.");
  }
  const body = await readBoundedBytes(request, MAX_RECEIPT_BODY_BYTES);
  return { body, signature, timestamp };
}

export function parsePushReceiptEvents(
  body: Uint8Array,
  expectedProvider: PushProvider,
) {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(body));
  } catch {
    pushNotificationError("VALIDATION_ERROR", "Receipt body must be JSON.");
  }
  if (!isRecord(value)) {
    pushNotificationError("VALIDATION_ERROR", "Receipt body must be an object.");
  }
  assertExactKeys(value, ["events", "provider"]);
  if (value.provider !== expectedProvider) {
    pushNotificationError("VALIDATION_ERROR", "Receipt provider does not match the route.");
  }
  if (!Array.isArray(value.events) || value.events.length < 1 || value.events.length > 100) {
    pushNotificationError("VALIDATION_ERROR", "Receipt events are invalid.");
  }
  return value.events.map((event) => {
    if (!isRecord(event)) {
      pushNotificationError("VALIDATION_ERROR", "Receipt event is invalid.");
    }
    assertExactKeys(event, [
      "eventId",
      "occurredAt",
      "providerMessageId",
      "safeCode",
      "status",
    ]);
    if (typeof event.eventId !== "string" || !PROVIDER_ID_PATTERN.test(event.eventId)) {
      pushNotificationError("VALIDATION_ERROR", "Receipt eventId is invalid.");
    }
    if (
      typeof event.providerMessageId !== "string"
      || !PROVIDER_ID_PATTERN.test(event.providerMessageId)
    ) {
      pushNotificationError("VALIDATION_ERROR", "Receipt providerMessageId is invalid.");
    }
    const status = parseOneOf(
      event.status,
      ["DELIVERED", "TRANSIENT_FAILURE", "PERMANENT_FAILURE", "INVALID_TOKEN"] as const,
      "status",
    );
    if (typeof event.safeCode !== "string" || !SAFE_CODE_PATTERN.test(event.safeCode)) {
      pushNotificationError("VALIDATION_ERROR", "Receipt safeCode is invalid.");
    }
    const occurredAt =
      typeof event.occurredAt === "string" ? new Date(event.occurredAt) : new Date(Number.NaN);
    if (!Number.isFinite(occurredAt.getTime())) {
      pushNotificationError("VALIDATION_ERROR", "Receipt occurredAt is invalid.");
    }
    return {
      eventId: event.eventId,
      occurredAt,
      providerMessageId: event.providerMessageId,
      safeCode: event.safeCode,
      status,
    };
  });
}

export function parseReceiptProvider(value: string): PushProvider {
  const normalized = value.toUpperCase();
  if (normalized === "APNS" || normalized === "FCM") return normalized;
  pushNotificationError("NOT_FOUND", "Push receipt provider was not found.");
}

function parseToken(value: unknown, provider: PushProvider) {
  if (typeof value !== "string" || value.length < 20 || value.length > 4096 || /\s/.test(value)) {
    pushNotificationError("VALIDATION_ERROR", "The push token is invalid.");
  }
  if (provider === "APNS" && !/^[0-9a-f]{64}$/i.test(value)) {
    pushNotificationError("VALIDATION_ERROR", "The APNs token is invalid.");
  }
  return value;
}

function parseInstallationSecret(value: unknown) {
  if (typeof value !== "string" || !SECRET_PATTERN.test(value)) {
    pushNotificationError("VALIDATION_ERROR", "The installation secret is invalid.");
  }
  return value;
}

function parseOperationGeneration(value: unknown) {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 1
    || value > 2_147_483_647
  ) {
    pushNotificationError(
      "VALIDATION_ERROR",
      "operationGeneration is invalid.",
    );
  }
  return value;
}

function parseIdempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key")?.trim().toLowerCase() ?? "";
  return parseUuid(value, "Idempotency-Key");
}

function parseUuid(value: unknown, field: string) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value) || value.includes(",")) {
    pushNotificationError("VALIDATION_ERROR", `${field} must be one UUID.`);
  }
  return value.toLowerCase();
}

function parseOneOf<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    pushNotificationError("VALIDATION_ERROR", `${field} is invalid.`);
  }
  return value as T[number];
}

function assertExactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    pushNotificationError("VALIDATION_ERROR", "Request body contains invalid fields.");
  }
}

async function readBoundedJsonObject(request: Request, maximumBytes: number) {
  const bytes = await readBoundedBytes(request, maximumBytes);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    pushNotificationError("VALIDATION_ERROR", "Request body must be JSON.");
  }
  if (!isRecord(value)) {
    pushNotificationError("VALIDATION_ERROR", "Request body must be an object.");
  }
  return value;
}

async function readBoundedBytes(request: Request, maximumBytes: number) {
  const declared = request.headers.get("content-length");
  if (declared && (!/^[0-9]+$/.test(declared) || Number(declared) > maximumBytes)) {
    pushNotificationError("VALIDATION_ERROR", "Request body is too large.");
  }
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      pushNotificationError("VALIDATION_ERROR", "Request body is too large.");
    }
    chunks.push(next.value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
