"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireCustomerIdentity } from "@/features/identity/server";
import { RestaurantReservationError } from "@/features/restaurants/domain/reservation-errors";
import { createCustomerRestaurantReservation } from "@/features/restaurants/services/reservation-creation";
import { isValidBusinessSlug } from "@/features/business/lib/business-slug";
import { logServerError } from "@/lib/logging/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";

function errorUrl(input: {
  slug: string;
  branchId: string;
  date: string;
  guests: string;
  startsAt: string;
  error: string;
}) {
  const query = new URLSearchParams({
    branchId: input.branchId,
    date: input.date,
    guests: input.guests,
    startsAt: input.startsAt,
    error: input.error,
  });
  return `/${isValidBusinessSlug(input.slug) ? input.slug : "marketplace"}/reserve?${query}`;
}

export async function createRestaurantReservation(formData: FormData) {
  const { person } = await requireCustomerIdentity();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const branchId = String(formData.get("branchId") ?? "");
  const date = String(formData.get("date") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  const guests = String(formData.get("guestCount") ?? "");
  const failure = (error: string): never =>
    redirect(errorUrl({ slug, branchId, date, startsAt, guests, error }));
  const rateLimit = consumeRateLimit("restaurantReservation:create", person.id, {
    limit: 6,
    windowMs: 60_000,
  });
  if (!rateLimit.success) failure("rateLimited");

  const knownFields = new Set([
    "slug",
    "branchId",
    "date",
    "startsAt",
    "guestCount",
    "seatingArea",
    "customerNote",
    "idempotencyKey",
  ]);
  const preorderItems: Array<{ itemId: string; quantity: number }> = [];
  for (const [key, value] of formData.entries()) {
    if (knownFields.has(key) || key.startsWith("$ACTION_")) continue;
    if (!key.startsWith("menuItem:")) failure("invalid");
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 20) failure("invalid");
    if (quantity > 0) preorderItems.push({ itemId: key.slice("menuItem:".length), quantity });
  }

  let reservationId: string | null = null;
  try {
    const result = await createCustomerRestaurantReservation({
      businessSlug: slug,
      branchId,
      customerId: person.id,
      customerNote: String(formData.get("customerNote") ?? ""),
      date,
      guestCount: Number(guests),
      idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
      preorderItems,
      seatingArea: String(formData.get("seatingArea") ?? "") || null,
      startsAt,
    });
    reservationId = result.reservation.id;
  } catch (error) {
    if (error instanceof RestaurantReservationError) {
      const code =
        error.code === "TABLE_CONFLICT" || error.code === "CAPACITY_UNAVAILABLE"
          ? "table-unavailable"
          : error.code === "RESTAURANT_CLOSED" || error.code === "DATE_OUT_OF_RANGE"
            ? "time"
            : "invalid";
      failure(code);
    }
    logServerError("restaurantReservation.create", error, {
      slug,
      branchId,
      customerId: person.id,
    });
    failure("failed");
  }
  revalidatePath("/customer/bookings");
  revalidatePath("/business/reservations");
  revalidatePath(`/${slug}`);
  if (!reservationId) failure("failed");
  redirect(`/customer/bookings?reserved=${reservationId}`);
}
