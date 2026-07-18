import { communicationError } from "@/features/communications/domain/errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORIES = new Set([
  "BOOKINGS", "RESTAURANT", "COMMERCE", "MESSAGES", "ACCOUNT", "ADMIN_ANNOUNCEMENT",
]);

export async function parseOutboundPreferenceRequest(request: Request) {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    communicationError("VALIDATION_ERROR", "Request body must be JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    communicationError("VALIDATION_ERROR", "Request body must be an object.");
  }
  const object = value as Record<string, unknown>;
  const allowed = ["categories", "expectedVersion"];
  if (Object.keys(object).some((key) => !allowed.includes(key))) {
    communicationError("VALIDATION_ERROR", "Request body contains unknown fields.");
  }
  if (!Number.isInteger(object.expectedVersion) || (object.expectedVersion as number) < 1) {
    communicationError("VALIDATION_ERROR", "expectedVersion must be a positive integer.");
  }
  if (!object.categories || typeof object.categories !== "object" || Array.isArray(object.categories)) {
    communicationError("VALIDATION_ERROR", "categories is invalid.");
  }
  const categories = object.categories as Record<string, unknown>;
  if (Object.keys(categories).length !== 3 || ["EMAIL", "SMS", "PUSH"].some((key) => !Object.hasOwn(categories, key))) {
    communicationError("VALIDATION_ERROR", "All outbound channels are required.");
  }
  for (const [channel, selected] of Object.entries(categories)) {
    if (!["EMAIL", "SMS", "PUSH"].includes(channel) || !Array.isArray(selected) || selected.some((item) => typeof item !== "string" || !CATEGORIES.has(item))) {
      communicationError("VALIDATION_ERROR", "Outbound category matrix is invalid.");
    }
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim().toLowerCase() ?? "";
  if (!UUID_PATTERN.test(idempotencyKey) || idempotencyKey.includes(",")) {
    communicationError("VALIDATION_ERROR", "Idempotency-Key must be one UUID.");
  }
  return {
    categories,
    expectedVersion: object.expectedVersion,
    idempotencyKey,
  };
}
