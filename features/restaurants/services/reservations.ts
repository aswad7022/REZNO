import "server-only";

import { TZDate } from "@date-fns/tz";
import type { BusinessVertical, Prisma } from "@prisma/client";

import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import { prisma } from "@/lib/db/prisma";

const ACTIVE_RESTAURANT_RESERVATION_STATUSES = ["PENDING", "CONFIRMED"] as const;
const DEFAULT_RESERVATION_DURATION_MINUTES = 90;
const SLOT_INTERVAL_MINUTES = 30;
const RESERVATION_CATEGORY_SLUG = "restaurant-reservations";

type ParsedDate = {
  year: number;
  month: number;
  day: number;
};

export interface RestaurantReservationSlot {
  startsAt: string;
  endsAt: string;
}

export interface RestaurantReservationTableOption {
  id: string;
  name: string;
  code: string | null;
  capacity: number;
  area: string | null;
  floor: string | null;
  positionLabel: string | null;
}

export interface RestaurantReservationBranchOption {
  id: string;
  name: string;
  timezone: string;
  address: string | null;
  city: string | null;
}

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
  branches: RestaurantReservationBranchOption[];
  selectedDate: string;
  selectedStartsAt: string | null;
  guestCount: number;
  durationMinutes: number;
  slots: RestaurantReservationSlot[];
  availableTables: RestaurantReservationTableOption[];
  seatingAreas: string[];
  menuCategories: Array<{
    id: string;
    name: string;
    description: string | null;
    items: Array<{
      id: string;
      name: string;
      description: string | null;
      price: string;
      currency: string;
      imageUrl: string | null;
      preparationMinutes: number | null;
    }>;
  }>;
  unavailableReason:
    | "NO_BRANCH"
    | "NO_BRANCH_SELECTED"
    | "NO_HOURS"
    | "NO_TABLES"
    | "NO_SLOTS"
    | null;
}

function parseDate(date: string): ParsedDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const parsed = {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  };
  const normalized = new Date(
    Date.UTC(parsed.year, parsed.month, parsed.day),
  );
  if (
    normalized.getUTCFullYear() !== parsed.year ||
    normalized.getUTCMonth() !== parsed.month ||
    normalized.getUTCDate() !== parsed.day
  ) {
    return null;
  }
  return parsed;
}

function atLocalTime(date: ParsedDate, time: string, timezone: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(
    new TZDate(date.year, date.month, date.day, hour, minute, timezone),
  );
}

function getLocalDateString(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day
    ? `${year}-${month}-${day}`
    : new Date().toISOString().slice(0, 10);
}

function overlaps(
  start: Date,
  end: Date,
  occupied: Array<{ startsAt: Date; endsAt: Date }>,
): boolean {
  return occupied.some(
    (interval) => start < interval.endsAt && end > interval.startsAt,
  );
}

function addressLine(branch: {
  addressLine1: string | null;
  addressLine2: string | null;
}) {
  return [branch.addressLine1, branch.addressLine2].filter(Boolean).join(" ") || null;
}

export async function getRestaurantReservationPageData(options: {
  slug: string;
  branchId?: string;
  date?: string;
  startsAt?: string;
  guestCount?: number;
}): Promise<RestaurantReservationPageData | null> {
  const organization = await prisma.organization.findFirst({
    where: {
      slug: options.slug,
      deletedAt: null,
      isActive: true,
      status: "ACTIVE",
      settings: { bookingEnabled: true, marketplaceVisible: true },
    },
    include: {
      profile: true,
      branches: {
        where: { deletedAt: null, status: "ACTIVE" },
        include: {
          businessHours: { where: { isOpen: true } },
          blockedTimes: { where: { memberId: null } },
        },
        orderBy: { name: "asc" },
      },
      restaurantTables: {
        where: { isActive: true },
        orderBy: [{ area: "asc" }, { capacity: "asc" }, { name: "asc" }],
      },
      menuCategories: {
        where: { isActive: true },
        include: {
          items: {
            where: { isAvailable: true },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
    },
  });

  if (!organization || !isRestaurantVertical(organization.vertical)) return null;

  const selectedBranch =
    options.branchId
      ? organization.branches.find((item) => item.id === options.branchId)
      : null;
  const branch =
    selectedBranch ??
    (organization.branches.length === 1 ? organization.branches[0] : null);
  const timezone =
    branch?.timezone ?? organization.branches[0]?.timezone ?? "Asia/Baghdad";
  const selectedDate = parseDate(options.date ?? "")
    ? options.date!
    : getLocalDateString(timezone);
  const parsedDate = parseDate(selectedDate)!;
  const guestCount = Math.min(Math.max(options.guestCount ?? 2, 1), 100);
  const durationMinutes = DEFAULT_RESERVATION_DURATION_MINUTES;
  const selectedStartsAt =
    options.startsAt && !Number.isNaN(new Date(options.startsAt).getTime())
      ? options.startsAt
      : null;

  const candidateTables = organization.restaurantTables.filter(
    (table) =>
      table.capacity >= guestCount &&
      (!branch || table.branchId === null || table.branchId === branch.id),
  );

  if (!branch) {
    return buildPageData({
      organization,
      branch: null,
      selectedDate,
      selectedStartsAt,
      guestCount,
      durationMinutes,
      slots: [],
      availableTables: [],
      unavailableReason:
        organization.branches.length > 0 ? "NO_BRANCH_SELECTED" : "NO_BRANCH",
    });
  }

  const dayOfWeek = new Date(
    Date.UTC(parsedDate.year, parsedDate.month, parsedDate.day),
  ).getUTCDay();
  const businessHours = branch.businessHours.find(
    (hours) => hours.dayOfWeek === dayOfWeek && hours.isOpen,
  );

  if (candidateTables.length === 0) {
    return buildPageData({
      organization,
      branch,
      selectedDate,
      selectedStartsAt,
      guestCount,
      durationMinutes,
      slots: [],
      availableTables: [],
      unavailableReason: "NO_TABLES",
    });
  }

  if (!businessHours) {
    return buildPageData({
      organization,
      branch,
      selectedDate,
      selectedStartsAt,
      guestCount,
      durationMinutes,
      slots: [],
      availableTables: [],
      unavailableReason: "NO_HOURS",
    });
  }

  const businessStart = atLocalTime(parsedDate, businessHours.openTime, timezone);
  const businessEnd = atLocalTime(parsedDate, businessHours.closeTime, timezone);
  const now = new Date();
  const dayStart = atLocalTime(parsedDate, "00:00", timezone);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
  const occupiedBookings = await prisma.booking.findMany({
    where: {
      status: { in: [...ACTIVE_RESTAURANT_RESERVATION_STATUSES] },
      startsAt: { lt: dayEnd },
      endsAt: { gt: dayStart },
      restaurantReservation: {
        tableId: { in: candidateTables.map((table) => table.id) },
      },
    },
    select: {
      startsAt: true,
      endsAt: true,
      restaurantReservation: { select: { tableId: true } },
    },
  });

  const slots: RestaurantReservationSlot[] = [];
  for (
    let start = businessStart;
    start.getTime() + durationMinutes * 60_000 <= businessEnd.getTime();
    start = new Date(start.getTime() + SLOT_INTERVAL_MINUTES * 60_000)
  ) {
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    if (start <= now || overlaps(start, end, branch.blockedTimes)) continue;

    const hasAvailableTable = candidateTables.some(
      (table) =>
        !occupiedBookings.some(
          (booking) =>
            booking.restaurantReservation?.tableId === table.id &&
            start < booking.endsAt &&
            end > booking.startsAt,
        ),
    );
    if (hasAvailableTable) {
      slots.push({ startsAt: start.toISOString(), endsAt: end.toISOString() });
    }
  }

  const selectedStartDate = selectedStartsAt ? new Date(selectedStartsAt) : null;
  const selectedEndDate = selectedStartDate
    ? new Date(selectedStartDate.getTime() + durationMinutes * 60_000)
    : null;
  const availableTables =
    selectedStartDate && selectedEndDate
      ? candidateTables.filter(
          (table) =>
            !occupiedBookings.some(
              (booking) =>
                booking.restaurantReservation?.tableId === table.id &&
                selectedStartDate < booking.endsAt &&
                selectedEndDate > booking.startsAt,
            ),
        )
      : [];

  return buildPageData({
    organization,
    branch,
    selectedDate,
    selectedStartsAt,
    guestCount,
    durationMinutes,
    slots,
    availableTables,
    unavailableReason: slots.length > 0 ? null : "NO_SLOTS",
  });
}

function buildPageData({
  organization,
  branch,
  selectedDate,
  selectedStartsAt,
  guestCount,
  durationMinutes,
  slots,
  availableTables,
  unavailableReason,
}: {
  organization: Awaited<
    ReturnType<typeof prisma.organization.findFirst>
  > & {
    vertical: BusinessVertical;
    profile: {
      logoUrl: string | null;
      coverImageUrl: string | null;
      businessPhone: string | null;
    } | null;
    branches: Array<{
      id: string;
      name: string;
      timezone: string;
      addressLine1: string | null;
      addressLine2: string | null;
      city: string | null;
    }>;
    restaurantTables: Array<{ area: string | null }>;
    menuCategories: Array<{
      id: string;
      name: string;
      description: string | null;
      items: Array<{
        id: string;
        name: string;
        description: string | null;
        price: Prisma.Decimal;
        currency: string;
        imageUrl: string | null;
        preparationMinutes: number | null;
      }>;
    }>;
  };
  branch: {
    id: string;
    name: string;
    timezone: string;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
  } | null;
  selectedDate: string;
  selectedStartsAt: string | null;
  guestCount: number;
  durationMinutes: number;
  slots: RestaurantReservationSlot[];
  availableTables: RestaurantReservationTableOption[];
  unavailableReason: RestaurantReservationPageData["unavailableReason"];
}): RestaurantReservationPageData {
  return {
    business: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      vertical: organization.vertical,
      logoUrl: organization.profile?.logoUrl ?? null,
      coverImageUrl: organization.profile?.coverImageUrl ?? null,
      city: organization.branches.find((item) => item.city)?.city ?? null,
      phone: organization.profile?.businessPhone ?? null,
    },
    branch: branch
      ? {
          id: branch.id,
          name: branch.name,
          timezone: branch.timezone,
          address: addressLine(branch),
          city: branch.city,
        }
      : null,
    branches: organization.branches.map((item) => ({
      id: item.id,
      name: item.name,
      timezone: item.timezone,
      address: addressLine(item),
      city: item.city,
    })),
    selectedDate,
    selectedStartsAt,
    guestCount,
    durationMinutes,
    slots,
    availableTables: availableTables.map((table) => ({
      id: table.id,
      name: table.name,
      code: table.code,
      capacity: table.capacity,
      area: table.area,
      floor: table.floor,
      positionLabel: table.positionLabel,
    })),
    seatingAreas: Array.from(
      new Set(organization.restaurantTables.flatMap((table) => (table.area ? [table.area] : []))),
    ),
    menuCategories: organization.menuCategories.map((category) => ({
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
    })),
    unavailableReason,
  };
}

export async function hasRestaurantTableConflict(
  tx: Prisma.TransactionClient,
  tableId: string,
  startsAt: Date,
  endsAt: Date,
) {
  const conflict = await tx.booking.findFirst({
    where: {
      status: { in: [...ACTIVE_RESTAURANT_RESERVATION_STATUSES] },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      restaurantReservation: { tableId },
    },
    select: { id: true },
  });
  return Boolean(conflict);
}

export async function ensureRestaurantReservationOffering(
  tx: Prisma.TransactionClient,
  organizationId: string,
  branchId: string,
) {
  const category = await tx.category.upsert({
    where: { slug: RESERVATION_CATEGORY_SLUG },
    update: {},
    create: {
      name: "Restaurant reservations",
      slug: RESERVATION_CATEGORY_SLUG,
      icon: "utensils",
    },
  });

  const service =
    (await tx.service.findFirst({
      where: {
        organizationId,
        categoryId: category.id,
        name: "حجز طاولة",
      },
      select: { id: true },
    })) ??
    (await tx.service.create({
      data: {
        organizationId,
        categoryId: category.id,
        name: "حجز طاولة",
        description: "خدمة داخلية لحجوزات طاولات المطاعم والمقاهي.",
        staffSelectionMode: "NONE",
        status: "ACTIVE",
      },
      select: { id: true },
    }));

  return tx.branchService.upsert({
    where: { branchId_serviceId: { branchId, serviceId: service.id } },
    update: {
      durationMinutes: DEFAULT_RESERVATION_DURATION_MINUTES,
      isAvailable: false,
      price: 0,
    },
    create: {
      branchId,
      serviceId: service.id,
      price: 0,
      durationMinutes: DEFAULT_RESERVATION_DURATION_MINUTES,
      isAvailable: false,
    },
  });
}
