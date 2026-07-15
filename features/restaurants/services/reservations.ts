import "server-only";

import type { BusinessVertical } from "@prisma/client";

import {
  localDateForInstant,
  parseRestaurantDate,
  RESTAURANT_RESERVATION_DURATION_MINUTES,
  RESTAURANT_RESERVATION_MAX_GUESTS,
  validateRestaurantDateRange,
} from "@/features/restaurants/domain/reservation-policy";
import {
  getPublicRestaurantReservationAvailability,
  getPublicRestaurantReservationBusiness,
  getPublicRestaurantReservationMenu,
} from "@/features/restaurants/services/reservation-public";
import { RestaurantReservationError } from "@/features/restaurants/domain/reservation-errors";

export interface RestaurantReservationPageData {
  business: {
    id: string;
    name: string;
    slug: string;
    vertical: BusinessVertical;
    logoUrl: string | null;
    coverImageUrl: string | null;
    city: string | null;
    phone: string | null;
  };
  branch: {
    id: string;
    name: string;
    timezone: string;
    address: string | null;
    city: string | null;
  } | null;
  branches: Array<{
    id: string;
    name: string;
    timezone: string;
    address: string | null;
    city: string | null;
  }>;
  selectedDate: string;
  selectedStartsAt: string | null;
  guestCount: number;
  durationMinutes: number;
  slots: Array<{ startsAt: string; endsAt: string }>;
  seatingAreas: string[];
  menuCategories: Awaited<ReturnType<typeof getPublicRestaurantReservationMenu>>;
  unavailableReason:
    | "NO_BRANCH"
    | "NO_BRANCH_SELECTED"
    | "NO_HOURS"
    | "NO_TABLES"
    | "NO_SLOTS"
    | null;
}

export async function getRestaurantReservationPageData(options: {
  slug: string;
  branchId?: string;
  date?: string;
  startsAt?: string;
  guestCount?: number;
}): Promise<RestaurantReservationPageData | null> {
  let business: Awaited<ReturnType<typeof getPublicRestaurantReservationBusiness>>;
  try {
    business = await getPublicRestaurantReservationBusiness(options.slug);
  } catch (error) {
    if (
      error instanceof RestaurantReservationError &&
      (error.code === "NOT_FOUND" || error.code === "RESTAURANT_FLOW_REQUIRED")
    ) return null;
    throw error;
  }
  const selectedBranch = options.branchId
    ? business.branches.find((branch) => branch.id === options.branchId) ?? null
    : business.branches.length === 1
      ? business.branches[0]!
      : null;
  const timezone = selectedBranch?.timezone ?? business.branches[0]?.timezone ?? "Asia/Baghdad";
  const today = localDateForInstant(new Date(), timezone);
  let selectedDate = today;
  if (parseRestaurantDate(options.date ?? "")) {
    try {
      validateRestaurantDateRange(options.date!, timezone);
      selectedDate = options.date!;
    } catch {
      selectedDate = today;
    }
  }
  const rawGuestCount = options.guestCount ?? 2;
  const guestCount = Number.isInteger(rawGuestCount)
    ? Math.min(Math.max(rawGuestCount, 1), RESTAURANT_RESERVATION_MAX_GUESTS)
    : 2;
  const [menuCategories, availability] = await Promise.all([
    getPublicRestaurantReservationMenu(options.slug),
    selectedBranch
      ? getPublicRestaurantReservationAvailability({
          branchId: selectedBranch.id,
          date: selectedDate,
          guestCount,
          seatingArea: null,
        })
      : null,
  ]);
  const selectedStartsAt = availability?.slots.some(
    (slot) => slot.startsAt === options.startsAt,
  )
    ? options.startsAt!
    : null;
  const unavailableReason = !selectedBranch
    ? business.branches.length ? "NO_BRANCH_SELECTED" : "NO_BRANCH"
    : availability?.reason === "CAPACITY_UNAVAILABLE"
      ? "NO_TABLES"
      : availability?.reason === "RESTAURANT_CLOSED"
        ? "NO_HOURS"
        : availability?.reason
          ? "NO_SLOTS"
          : null;
  return {
    business: {
      id: business.id,
      name: business.name,
      slug: business.slug,
      vertical: business.vertical,
      logoUrl: business.logoUrl,
      coverImageUrl: business.coverImageUrl,
      city: business.branches.find((branch) => branch.city)?.city ?? null,
      phone: null,
    },
    branch: selectedBranch,
    branches: business.branches,
    selectedDate,
    selectedStartsAt,
    guestCount,
    durationMinutes: RESTAURANT_RESERVATION_DURATION_MINUTES,
    slots: availability?.slots ?? [],
    seatingAreas: availability?.seatingAreas ?? [],
    menuCategories,
    unavailableReason,
  };
}
