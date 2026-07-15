import { parseRestaurantDate } from "@/features/restaurants/domain/reservation-policy";
import { restaurantReservationApiError } from "@/features/restaurants/api/errors";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

export function parseRestaurantUuid(value: unknown, name: string) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    restaurantReservationApiError("INVALID_REQUEST", 400, `${name} must be a UUID.`);
  }
  return value.trim().toLowerCase();
}

export function parseRestaurantSlug(value: string) {
  const slug = value.trim().toLowerCase();
  if (!slug || slug.length > 160 || !SLUG_PATTERN.test(slug)) {
    restaurantReservationApiError("INVALID_REQUEST", 400, "Business slug is invalid.");
  }
  return slug;
}

export function parseRestaurantIdempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key")?.trim();
  if (!value) {
    restaurantReservationApiError(
      "IDEMPOTENCY_KEY_REQUIRED",
      400,
      "Idempotency-Key is required.",
    );
  }
  if (value.includes(",") || !UUID_PATTERN.test(value)) {
    restaurantReservationApiError(
      "INVALID_REQUEST",
      400,
      "Idempotency-Key must be one UUID.",
    );
  }
  return value.toLowerCase();
}

export function parseRestaurantAvailabilityQuery(params: URLSearchParams) {
  assertUniqueQuery(params, ["date", "guestCount", "seatingArea"]);
  const date = params.get("date")?.trim() ?? "";
  if (!parseRestaurantDate(date)) {
    restaurantReservationApiError(
      "INVALID_REQUEST",
      400,
      "date must be a valid YYYY-MM-DD value.",
    );
  }
  const guestCount = Number(params.get("guestCount"));
  if (!Number.isInteger(guestCount)) {
    restaurantReservationApiError("INVALID_REQUEST", 400, "guestCount must be an integer.");
  }
  const rawArea = params.get("seatingArea");
  if (rawArea !== null && (rawArea.trim().length < 1 || rawArea.trim().length > 120)) {
    restaurantReservationApiError("INVALID_REQUEST", 400, "seatingArea is invalid.");
  }
  return { date, guestCount, seatingArea: rawArea?.trim() || null };
}

export async function parseCreateRestaurantReservationRequest(request: Request) {
  const body = await readJsonObject(request, [
    "businessSlug",
    "branchId",
    "date",
    "startsAt",
    "guestCount",
    "seatingArea",
    "customerNote",
    "preorderItems",
  ]);
  const date = typeof body.date === "string" ? body.date.trim() : "";
  if (!parseRestaurantDate(date)) {
    restaurantReservationApiError(
      "INVALID_REQUEST",
      400,
      "date must be a valid YYYY-MM-DD value.",
    );
  }
  const startsAt = typeof body.startsAt === "string" ? body.startsAt.trim() : "";
  const parsedStartsAt = new Date(startsAt);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(startsAt) ||
    !Number.isFinite(parsedStartsAt.getTime()) ||
    parsedStartsAt.toISOString() !== startsAt
  ) {
    restaurantReservationApiError(
      "INVALID_REQUEST",
      400,
      "startsAt must be a canonical UTC timestamp.",
    );
  }
  if (!Number.isInteger(body.guestCount)) {
    restaurantReservationApiError("INVALID_REQUEST", 400, "guestCount must be an integer.");
  }
  const seatingArea = parseNullableString(body.seatingArea, "seatingArea", 120);
  const customerNote = parseNullableString(body.customerNote, "customerNote", 500);
  if (!Array.isArray(body.preorderItems) || body.preorderItems.length > 100) {
    restaurantReservationApiError(
      "INVALID_REQUEST",
      400,
      "preorderItems must be an array with at most 100 entries.",
    );
  }
  const preorderItems = body.preorderItems.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      restaurantReservationApiError(
        "INVALID_REQUEST",
        400,
        `preorderItems[${index}] must be an object.`,
      );
    }
    const item = value as Record<string, unknown>;
    for (const key of Object.keys(item)) {
      if (!["itemId", "quantity"].includes(key)) {
        restaurantReservationApiError("INVALID_REQUEST", 400, `Unsupported field: ${key}.`);
      }
    }
    if (!Number.isInteger(item.quantity)) {
      restaurantReservationApiError(
        "INVALID_REQUEST",
        400,
        `preorderItems[${index}].quantity must be an integer.`,
      );
    }
    return {
      itemId: parseRestaurantUuid(item.itemId, `preorderItems[${index}].itemId`),
      quantity: item.quantity as number,
    };
  });
  return {
    businessSlug: parseRestaurantSlug(String(body.businessSlug ?? "")),
    branchId: parseRestaurantUuid(body.branchId, "branchId"),
    date,
    startsAt,
    guestCount: body.guestCount as number,
    seatingArea,
    customerNote,
    preorderItems,
  };
}

function parseNullableString(value: unknown, name: string, max: number) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    restaurantReservationApiError("INVALID_REQUEST", 400, `${name} must be a string or null.`);
  }
  const result = value.trim();
  if (result.length > max) {
    restaurantReservationApiError("INVALID_REQUEST", 400, `${name} is too long.`);
  }
  return result || null;
}

async function readJsonObject(request: Request, allowed: readonly string[]) {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    restaurantReservationApiError("INVALID_REQUEST", 400, "A valid JSON object is required.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    restaurantReservationApiError("INVALID_REQUEST", 400, "A valid JSON object is required.");
  }
  const body = value as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      restaurantReservationApiError("INVALID_REQUEST", 400, `Unsupported field: ${key}.`);
    }
  }
  return body;
}

function assertUniqueQuery(params: URLSearchParams, allowed: readonly string[]) {
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) {
      restaurantReservationApiError(
        "INVALID_REQUEST",
        400,
        `Unsupported or duplicate query parameter: ${key}.`,
      );
    }
  }
  for (const required of ["date", "guestCount"]) {
    if (params.getAll(required).length !== 1) {
      restaurantReservationApiError("INVALID_REQUEST", 400, `${required} is required.`);
    }
  }
}
