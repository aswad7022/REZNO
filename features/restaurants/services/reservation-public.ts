import "server-only";

import type { BusinessVertical, Prisma } from "@prisma/client";

import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import {
  localDateForInstant,
  isValidIanaTimezone,
  RESTAURANT_RESERVATION_DURATION_MINUTES,
  RESTAURANT_RESERVATION_INTERVAL_MINUTES,
  restaurantLocalTime,
  selectRestaurantTable,
  validateRestaurantDateRange,
  validateRestaurantGuestCount,
} from "@/features/restaurants/domain/reservation-policy";
import { restaurantReservationError } from "@/features/restaurants/domain/reservation-errors";
import { prisma } from "@/lib/db/prisma";

const ACTIVE_RESERVATION_STATUSES = ["PENDING", "CONFIRMED"] as const;

type RestaurantDatabase = Pick<
  Prisma.TransactionClient,
  "booking" | "branch" | "menuCategory" | "organization"
>;

function publicRestaurantWhere(slug: string) {
  return {
    slug,
    deletedAt: null,
    isActive: true,
    status: "ACTIVE" as const,
    settings: { bookingEnabled: true, marketplaceVisible: true },
  };
}

function addressLine(branch: {
  addressLine1: string | null;
  addressLine2: string | null;
}) {
  return [branch.addressLine1, branch.addressLine2].filter(Boolean).join(" ") || null;
}

function assertRestaurantVertical(vertical: BusinessVertical) {
  if (!isRestaurantVertical(vertical)) {
    restaurantReservationError(
      "RESTAURANT_FLOW_REQUIRED",
      "Restaurant reservation endpoints only support Restaurant and Cafe businesses.",
    );
  }
}

export async function getPublicRestaurantReservationBusiness(slug: string) {
  const organization = await prisma.organization.findFirst({
    where: publicRestaurantWhere(slug),
    include: {
      profile: true,
      branches: {
        where: { deletedAt: null, status: "ACTIVE" },
        select: {
          id: true,
          name: true,
          city: true,
          addressLine1: true,
          addressLine2: true,
          timezone: true,
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      },
      restaurantTables: {
        where: { isActive: true, branchId: { not: null } },
        select: { area: true, branchId: true },
      },
      menuItems: {
        where: { isAvailable: true, category: { isActive: true } },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!organization) {
    restaurantReservationError("NOT_FOUND", "Restaurant was not found.");
  }
  assertRestaurantVertical(organization.vertical);
  const reservableBranches = organization.branches.filter((branch) =>
    isValidIanaTimezone(branch.timezone),
  );
  const reservableBranchIds = new Set(reservableBranches.map((branch) => branch.id));
  return {
    id: organization.id,
    slug: organization.slug,
    name: organization.name,
    description: organization.profile?.description ?? null,
    logoUrl: organization.profile?.logoUrl ?? null,
    coverImageUrl: organization.profile?.coverImageUrl ?? null,
    vertical: organization.vertical,
    supportsReservations: reservableBranches.length > 0,
    reservationDurationMinutes: RESTAURANT_RESERVATION_DURATION_MINUTES,
    reservationRangeDays: 90,
    hasMenu: organization.menuItems.length > 0,
    seatingAreas: [...new Set(
      organization.restaurantTables.flatMap((table) => table.area ? [table.area] : []),
    )].sort((left, right) => left.localeCompare(right)),
    branches: reservableBranches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      city: branch.city,
      address: addressLine(branch),
      timezone: branch.timezone,
      supportsReservations: organization.restaurantTables.some(
        (table) =>
          reservableBranchIds.has(branch.id) && table.branchId === branch.id,
      ),
    })),
  };
}

export async function getPublicRestaurantReservationBranches(slug: string) {
  return (await getPublicRestaurantReservationBusiness(slug)).branches;
}

export async function getPublicRestaurantReservationMenu(slug: string) {
  const organization = await prisma.organization.findFirst({
    where: publicRestaurantWhere(slug),
    select: { id: true, vertical: true },
  });
  if (!organization) {
    restaurantReservationError("NOT_FOUND", "Restaurant was not found.");
  }
  assertRestaurantVertical(organization.vertical);
  const categories = await prisma.menuCategory.findMany({
    where: { businessId: organization.id, isActive: true },
    include: {
      items: {
        where: { businessId: organization.id, isAvailable: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
  });
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    items: category.items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      price: item.price.toString(),
      currency: item.currency,
      imageUrl: item.imageUrl,
      preparationMinutes: item.preparationMinutes,
    })),
  }));
}

export interface RestaurantAvailabilityInput {
  branchId: string;
  date: string;
  guestCount: number;
  seatingArea: string | null;
}

export type RestaurantAvailabilityReason =
  | "CAPACITY_UNAVAILABLE"
  | "NO_SLOTS"
  | "RESTAURANT_CLOSED"
  | null;

export async function getPublicRestaurantReservationAvailability(
  input: RestaurantAvailabilityInput,
  database: RestaurantDatabase = prisma,
  now = new Date(),
) {
  const guestCount = validateRestaurantGuestCount(input.guestCount);
  const branch = await database.branch.findFirst({
    where: {
      id: input.branchId,
      deletedAt: null,
      status: "ACTIVE",
      organization: {
        deletedAt: null,
        isActive: true,
        status: "ACTIVE",
        settings: { bookingEnabled: true, marketplaceVisible: true },
      },
    },
    include: {
      businessHours: true,
      blockedTimes: { where: { memberId: null } },
      organization: {
        include: {
          restaurantTables: {
            where: { branchId: input.branchId, isActive: true },
            select: { id: true, name: true, capacity: true, area: true },
          },
        },
      },
    },
  });
  if (!branch) {
    restaurantReservationError("NOT_FOUND", "Restaurant branch was not found.");
  }
  assertRestaurantVertical(branch.organization.vertical);
  const parsed = validateRestaurantDateRange(input.date, branch.timezone, now);
  const seatingAreas = [...new Set(
    branch.organization.restaurantTables.flatMap((table) => table.area ? [table.area] : []),
  )].sort((left, right) => left.localeCompare(right));
  if (input.seatingArea && !seatingAreas.includes(input.seatingArea)) {
    return availabilityResult(branch, input, seatingAreas, [], "CAPACITY_UNAVAILABLE");
  }
  const capacityTables = branch.organization.restaurantTables.filter(
    (table) =>
      table.capacity >= guestCount &&
      (!input.seatingArea || table.area === input.seatingArea),
  );
  if (!selectRestaurantTable(capacityTables, guestCount, input.seatingArea)) {
    return availabilityResult(branch, input, seatingAreas, [], "CAPACITY_UNAVAILABLE");
  }
  const dayOfWeek = new Date(Date.UTC(parsed.year, parsed.month, parsed.day)).getUTCDay();
  const hours = branch.businessHours.find(
    (value) => value.dayOfWeek === dayOfWeek && value.isOpen,
  );
  if (!hours) {
    return availabilityResult(branch, input, seatingAreas, [], "RESTAURANT_CLOSED");
  }
  const opensAt = restaurantLocalTime(parsed, hours.openTime, branch.timezone);
  const closesAt = restaurantLocalTime(parsed, hours.closeTime, branch.timezone);
  if (!opensAt || !closesAt || opensAt >= closesAt) {
    return availabilityResult(branch, input, seatingAreas, [], "RESTAURANT_CLOSED");
  }
  const dayStart = restaurantLocalTime(parsed, "00:00", branch.timezone);
  if (!dayStart) {
    restaurantReservationError("INVALID_REQUEST", "Local reservation date is invalid.");
  }
  const nextDate = new Date(Date.UTC(parsed.year, parsed.month, parsed.day + 1));
  const nextParsed = {
    year: nextDate.getUTCFullYear(),
    month: nextDate.getUTCMonth(),
    day: nextDate.getUTCDate(),
  };
  const dayEnd = restaurantLocalTime(nextParsed, "00:00", branch.timezone);
  if (!dayEnd) {
    restaurantReservationError("INVALID_REQUEST", "Local reservation boundary is invalid.");
  }
  const occupied = await database.booking.findMany({
    where: {
      status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      startsAt: { lt: dayEnd },
      endsAt: { gt: dayStart },
      restaurantReservation: {
        tableId: { in: capacityTables.map((table) => table.id) },
      },
    },
    select: {
      startsAt: true,
      endsAt: true,
      restaurantReservation: { select: { tableId: true } },
    },
  });
  const slots: Array<{ startsAt: string; endsAt: string }> = [];
  const durationMs = RESTAURANT_RESERVATION_DURATION_MINUTES * 60_000;
  for (
    let startsAt = opensAt;
    startsAt.getTime() + durationMs <= closesAt.getTime();
    startsAt = new Date(
      startsAt.getTime() + RESTAURANT_RESERVATION_INTERVAL_MINUTES * 60_000,
    )
  ) {
    const endsAt = new Date(startsAt.getTime() + durationMs);
    if (startsAt <= now || localDateForInstant(startsAt, branch.timezone) !== input.date) {
      continue;
    }
    if (branch.blockedTimes.some((block) => startsAt < block.endsAt && endsAt > block.startsAt)) {
      continue;
    }
    const available = capacityTables.some((table) =>
      !occupied.some(
        (booking) =>
          booking.restaurantReservation?.tableId === table.id &&
          startsAt < booking.endsAt &&
          endsAt > booking.startsAt,
      ),
    );
    if (available) slots.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
  }
  return availabilityResult(
    branch,
    input,
    seatingAreas,
    slots,
    slots.length > 0 ? null : "NO_SLOTS",
  );
}

function availabilityResult(
  branch: { id: string; name: string; timezone: string },
  input: RestaurantAvailabilityInput,
  seatingAreas: string[],
  slots: Array<{ startsAt: string; endsAt: string }>,
  reason: RestaurantAvailabilityReason,
) {
  return {
    branch: { id: branch.id, name: branch.name },
    date: input.date,
    timezone: branch.timezone,
    guestCount: input.guestCount,
    seatingArea: input.seatingArea,
    seatingAreas,
    durationMinutes: RESTAURANT_RESERVATION_DURATION_MINUTES,
    slots,
    reason,
  };
}
