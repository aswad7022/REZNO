import { bookingApiError } from "@/features/bookings/api/errors";
import { parseBookingDate } from "@/features/bookings/domain/date";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

export function parseBookingUuid(value: unknown, name: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    bookingApiError("INVALID_REQUEST", 400, `${name} must be a UUID.`);
  }
  return value.trim().toLowerCase();
}

export function parseBookingSlug(value: string): string {
  const slug = value.trim();
  if (!slug || slug.length > 160 || !SLUG_PATTERN.test(slug)) {
    bookingApiError("INVALID_REQUEST", 400, "Business slug is invalid.");
  }
  return slug.toLowerCase();
}

export function parseAvailabilityQuery(params: URLSearchParams) {
  assertUniqueQueryParameters(params, ["date", "memberId"]);
  const date = params.get("date")?.trim() ?? "";
  if (!parseBookingDate(date)) {
    bookingApiError("INVALID_REQUEST", 400, "date must be a valid YYYY-MM-DD value.");
  }
  const rawMemberId = params.get("memberId")?.trim();
  return {
    date,
    memberId: rawMemberId ? parseBookingUuid(rawMemberId, "memberId") : null,
  };
}

export async function parseCreateBookingRequest(request: Request) {
  const body = await readJsonObject(request, [
    "branchServiceId",
    "date",
    "memberId",
    "startsAt",
  ]);
  const date = typeof body.date === "string" ? body.date.trim() : "";
  if (!parseBookingDate(date)) {
    bookingApiError("INVALID_REQUEST", 400, "date must be a valid YYYY-MM-DD value.");
  }
  const startsAt = typeof body.startsAt === "string" ? body.startsAt.trim() : "";
  const startsAtDate = new Date(startsAt);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(startsAt) ||
    !Number.isFinite(startsAtDate.getTime()) ||
    startsAtDate.toISOString() !== startsAt
  ) {
    bookingApiError("INVALID_REQUEST", 400, "startsAt must be a canonical UTC timestamp.");
  }
  const memberId =
    body.memberId === null || body.memberId === undefined
      ? null
      : parseBookingUuid(body.memberId, "memberId");
  return {
    branchServiceId: parseBookingUuid(
      body.branchServiceId,
      "branchServiceId",
    ),
    date,
    memberId,
    startsAt,
  };
}

export function parseBookingIdempotencyKey(request: Request): string {
  const value = request.headers.get("idempotency-key")?.trim();
  if (!value) {
    bookingApiError(
      "IDEMPOTENCY_KEY_REQUIRED",
      400,
      "Idempotency-Key is required.",
    );
  }
  if (value.includes(",") || !UUID_PATTERN.test(value)) {
    bookingApiError(
      "INVALID_REQUEST",
      400,
      "Idempotency-Key must be one UUID.",
    );
  }
  return value.toLowerCase();
}

async function readJsonObject(
  request: Request,
  allowed: readonly string[],
): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    bookingApiError("INVALID_REQUEST", 400, "A valid JSON object is required.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    bookingApiError("INVALID_REQUEST", 400, "A valid JSON object is required.");
  }
  const body = value as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      bookingApiError("INVALID_REQUEST", 400, `Unsupported field: ${key}.`);
    }
  }
  return body;
}

function assertUniqueQueryParameters(
  params: URLSearchParams,
  allowed: readonly string[],
) {
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) {
      bookingApiError(
        "INVALID_REQUEST",
        400,
        `Unsupported or duplicate query parameter: ${key}.`,
      );
    }
  }
}
