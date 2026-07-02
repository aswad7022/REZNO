"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireCustomerIdentity } from "@/features/identity/server";
import {
  ensureRestaurantReservationOffering,
  hasRestaurantTableConflict,
} from "@/features/restaurants/services/reservations";
import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import { prisma } from "@/lib/db/prisma";
import { logServerError } from "@/lib/logging/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";

const reservationSchema = z.object({
  slug: z.string().trim().min(1),
  branchId: z.string().uuid(),
  tableId: z.string().uuid(),
  startsAt: z.string().datetime(),
  guestCount: z.coerce.number().int().min(1).max(100),
  durationMinutes: z.coerce.number().int().min(30).max(360).default(90),
  customerNote: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value.length > 0 ? value : null)),
});

function parseMenuItems(formData: FormData) {
  return Array.from(formData.entries()).flatMap(([key, value]) => {
    if (!key.startsWith("menuItem:")) return [];
    const menuItemId = key.replace("menuItem:", "");
    const quantity = Number(value);
    if (!menuItemId || !Number.isInteger(quantity) || quantity <= 0) return [];
    return [{ menuItemId, quantity: Math.min(quantity, 20) }];
  });
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function getLocalParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function isWithinWorkingHours({
  startsAt,
  endsAt,
  timezone,
  businessHours,
}: {
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  businessHours: Array<{
    dayOfWeek: number;
    isOpen: boolean;
    openTime: string;
    closeTime: string;
  }>;
}) {
  const start = getLocalParts(startsAt, timezone);
  const end = getLocalParts(endsAt, timezone);
  const dayOfWeek = new Date(
    Date.UTC(start.year, start.month - 1, start.day),
  ).getUTCDay();
  const hours = businessHours.find(
    (item) => item.dayOfWeek === dayOfWeek && item.isOpen,
  );
  if (!hours) return false;
  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;
  return (
    start.year === end.year &&
    start.month === end.month &&
    start.day === end.day &&
    startMinutes >= timeToMinutes(hours.openTime) &&
    endMinutes <= timeToMinutes(hours.closeTime)
  );
}

export async function createRestaurantReservation(formData: FormData) {
  const { person } = await requireCustomerIdentity();
  const rateLimit = consumeRateLimit(
    "restaurantReservation:create",
    person.id,
    {
      limit: 6,
      windowMs: 60_000,
    },
  );
  const parsed = reservationSchema.safeParse(Object.fromEntries(formData));
  const fallbackSlug = String(formData.get("slug") ?? "");
  const fallbackDate = String(formData.get("date") ?? "");
  const fallbackGuests = String(formData.get("guestCount") ?? "2");
  const fallbackStartsAt = String(formData.get("startsAt") ?? "");

  if (!rateLimit.success) {
    redirect(
      `/${fallbackSlug}/reserve?date=${fallbackDate}&guests=${fallbackGuests}&startsAt=${encodeURIComponent(fallbackStartsAt)}&error=rateLimited`,
    );
  }

  if (!parsed.success) {
    redirect(
      `/${fallbackSlug}/reserve?date=${fallbackDate}&guests=${fallbackGuests}&error=invalid`,
    );
  }

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(
    startsAt.getTime() + parsed.data.durationMinutes * 60_000,
  );
  const selectedMenuItems = parseMenuItems(formData);

  const result = await prisma
    .$transaction(
      async (tx) => {
        const organization = await tx.organization.findFirst({
      where: {
        slug: parsed.data.slug,
        deletedAt: null,
        isActive: true,
        status: "ACTIVE",
        settings: { bookingEnabled: true, marketplaceVisible: true },
      },
      include: { profile: true },
    });
    if (!organization || !isRestaurantVertical(organization.vertical)) {
      return { ok: false as const, reason: "not-found" };
    }

    const table = await tx.restaurantTable.findFirst({
      where: {
        id: parsed.data.tableId,
        businessId: organization.id,
        isActive: true,
        capacity: { gte: parsed.data.guestCount },
        OR: [{ branchId: null }, { branchId: parsed.data.branchId }],
      },
    });
    if (!table) return { ok: false as const, reason: "table" };

    const branch = await tx.branch.findFirst({
      where: {
        id: parsed.data.branchId,
        organizationId: organization.id,
        deletedAt: null,
        status: "ACTIVE",
      },
      include: { businessHours: true, blockedTimes: true },
    });
    if (!branch) return { ok: false as const, reason: "branch" };
    if (
      !isWithinWorkingHours({
        startsAt,
        endsAt,
        timezone: branch.timezone,
        businessHours: branch.businessHours,
      })
    ) {
      return { ok: false as const, reason: "hours" };
    }
    const blocked = branch.blockedTimes.some(
      (block) =>
        block.memberId === null && startsAt < block.endsAt && endsAt > block.startsAt,
    );
    if (blocked) return { ok: false as const, reason: "blocked" };

    const conflict = await hasRestaurantTableConflict(
      tx,
      table.id,
      startsAt,
      endsAt,
    );
    if (conflict) return { ok: false as const, reason: "conflict" };

    const menuItems =
      selectedMenuItems.length > 0
        ? await tx.menuItem.findMany({
            where: {
              businessId: organization.id,
              isAvailable: true,
              id: { in: selectedMenuItems.map((item) => item.menuItemId) },
            },
            select: { id: true, price: true, name: true },
          })
        : [];
    const menuItemMap = new Map(menuItems.map((item) => [item.id, item]));
    const reservationItems = selectedMenuItems.flatMap((item) => {
      const menuItem = menuItemMap.get(item.menuItemId);
      return menuItem
        ? [
            {
              menuItemId: item.menuItemId,
              quantity: item.quantity,
              unitPrice: menuItem.price,
            },
          ]
        : [];
    });
    const preorderTotal = reservationItems.reduce(
      (total, item) => total + Number(item.unitPrice) * item.quantity,
      0,
    );
    const branchService = await ensureRestaurantReservationOffering(
      tx,
      organization.id,
      branch.id,
    );
    const customerName =
      person.displayName ??
      [person.firstName, person.lastName].filter(Boolean).join(" ");
    const booking = await tx.booking.create({
      data: {
        organizationId: organization.id,
        branchId: branch.id,
        branchServiceId: branchService.id,
        customerId: person.id,
        memberId: null,
        status: "CONFIRMED",
        startsAt,
        endsAt,
        serviceNameSnapshot: "حجز طاولة",
        customerNameSnapshot: customerName,
        priceSnapshot: preorderTotal,
        notes: parsed.data.customerNote,
        statusHistory: {
          create: {
            toStatus: "CONFIRMED",
            changedByPersonId: person.id,
            note: "Restaurant table reservation created by customer.",
          },
        },
        restaurantReservation: {
          create: {
            businessId: organization.id,
            branchId: branch.id,
            tableId: table.id,
            guestCount: parsed.data.guestCount,
            reservationDateTime: startsAt,
            durationMinutes: parsed.data.durationMinutes,
            seatingArea: table.area,
            customerNote: parsed.data.customerNote,
            items:
              reservationItems.length > 0
                ? { create: reservationItems }
                : undefined,
          },
        },
      },
      select: { id: true },
    });

    await tx.notification.createMany({
      data: [
        {
          audience: "BUSINESS",
          businessId: organization.id,
          priority: "IMPORTANT",
          title: "حجز طاولة جديد",
          body: `${customerName} حجز ${table.name} لعدد ${parsed.data.guestCount} ضيوف.`,
        },
        {
          audience: "USER",
          recipientPersonId: person.id,
          priority: "NORMAL",
          title: "تم تأكيد حجز الطاولة",
          body: `تم تأكيد حجزك لدى ${organization.name}.`,
        },
      ],
    });

        return { ok: true as const, bookingId: booking.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
    .catch((error) => {
      logServerError("restaurantReservation.create", error, {
        slug: parsed.data.slug,
        branchId: parsed.data.branchId,
        tableId: parsed.data.tableId,
        customerId: person.id,
      });
      return { ok: false as const, reason: "unexpected" as const };
    });

  if (!result.ok) {
    const error =
      result.reason === "conflict"
        ? "table-unavailable"
        : result.reason === "table"
          ? "table"
          : result.reason === "hours" || result.reason === "blocked"
            ? "time"
          : result.reason === "unexpected"
            ? "failed"
          : "invalid";
    redirect(
      `/${parsed.data.slug}/reserve?date=${fallbackDate}&guests=${parsed.data.guestCount}&startsAt=${encodeURIComponent(parsed.data.startsAt)}&error=${error}`,
    );
  }

  revalidatePath("/customer/bookings");
  revalidatePath("/business/reservations");
  revalidatePath(`/${parsed.data.slug}`);
  redirect(`/customer/bookings?reserved=${result.bookingId}`);
}
