"use server";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCustomerIdentity } from "@/features/identity/server";
import { canCustomerRequestBookingChange } from "@/features/bookings/policies/booking-lifecycle";
import { createBookingSchema } from "@/features/bookings/schemas/booking";
import { BookingDomainError } from "@/features/bookings/domain/errors";
import { createCustomerBooking } from "@/features/bookings/services/booking-creation";
import {
  cancelCustomerBookingPersisted,
  respondToBusinessBookingProposal,
} from "@/features/bookings/services/booking-management";
import { generateBookingSlots } from "@/features/bookings/services/slots";
import { prisma } from "@/lib/db/prisma";
import { logServerError } from "@/lib/logging/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";

const ACTIVE_STATUSES = ["PENDING", "CONFIRMED"] as const;

function bookingErrorUrl(
  error: "failed" | "invalid" | "unavailable" | "rateLimited",
  branchServiceId?: string,
  date?: string,
): string {
  const query = new URLSearchParams({ error });
  if (branchServiceId) query.set("offeringId", branchServiceId);
  if (date) query.set("date", date);
  return `/customer/bookings/new?${query.toString()}`;
}

export async function createBooking(formData: FormData): Promise<void> {
  const identity = await requireCustomerIdentity();
  const rateLimit = consumeRateLimit("booking:create", identity.person.id, {
    limit: 6,
    windowMs: 60_000,
  });
  const rawBranchServiceId = formData.get("branchServiceId");
  const rawDate = formData.get("date");
  const branchServiceId =
    typeof rawBranchServiceId === "string" ? rawBranchServiceId : undefined;
  const date = typeof rawDate === "string" ? rawDate : undefined;
  if (!rateLimit.success) {
    redirect(bookingErrorUrl("rateLimited", branchServiceId, date));
  }
  const parsed = createBookingSchema.safeParse({
    branchServiceId: rawBranchServiceId,
    date: rawDate,
    startsAt: formData.get("startsAt"),
    memberId: formData.get("memberId") ?? "",
  });

  if (!parsed.success) {
    redirect(bookingErrorUrl("invalid", branchServiceId, date));
  }

  let createdBookingId: string | null = null;
  let failure: "failed" | "unavailable" = "unavailable";

  try {
    const result = await createCustomerBooking({
      ...parsed.data,
      customerId: identity.person.id,
      idempotencyKey: randomUUID(),
    });
    createdBookingId = result.booking.id;
  } catch (error) {
    if (!(error instanceof BookingDomainError)) {
      failure = "failed";
      logServerError("booking.create", error, {
        branchServiceId: parsed.data.branchServiceId,
        customerId: identity.person.id,
      });
    }
  }

  if (!createdBookingId) {
    redirect(
      bookingErrorUrl(
        failure,
        parsed.data.branchServiceId,
        parsed.data.date,
      ),
    );
  }

  revalidatePath("/customer/bookings");
  revalidatePath(`/customer/bookings/${createdBookingId}`);
  revalidatePath("/business/bookings");
  revalidatePath("/business/calendar");
  redirect(`/customer/bookings/${createdBookingId}?created=1`);
}

export async function cancelCustomerBooking(
  bookingId: string,
  formData: FormData,
): Promise<void> {
  const identity = await requireCustomerIdentity();
  const reasonValue = formData.get("reason");
  const reason =
    typeof reasonValue === "string" ? reasonValue.trim().slice(0, 500) : "";

  try {
    await cancelCustomerBookingPersisted({
      bookingId,
      customerId: identity.person.id,
      idempotencyKey: randomUUID(),
      reason: reason || null,
    });
  } catch (error) {
    if (!(error instanceof BookingDomainError)) {
      logServerError("booking.cancelCustomer", error, {
        bookingId,
        customerId: identity.person.id,
      });
    }
    return;
  }

  revalidatePath("/customer/bookings");
  revalidatePath("/business/bookings");
  revalidatePath("/business/calendar");
}

export async function rescheduleCustomerBooking(
  bookingId: string,
  formData: FormData,
): Promise<void> {
  const identity = await requireCustomerIdentity();
  const parsed = createBookingSchema.safeParse({
    branchServiceId: formData.get("branchServiceId"),
    date: formData.get("date"),
    startsAt: formData.get("startsAt"),
    memberId: formData.get("memberId") ?? "",
  });
  const baseUrl = `/customer/bookings/${bookingId}/reschedule`;
  if (!parsed.success) redirect(`${baseUrl}?error=invalid`);

  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      customerId: identity.person.id,
      branchServiceId: parsed.data.branchServiceId,
      status: { in: [...ACTIVE_STATUSES] },
    },
    include: { organization: { include: { settings: true } } },
  });
  if (!booking) redirect(`${baseUrl}?error=unavailable`);

  if (
    !canCustomerRequestBookingChange({
      status: booking.status,
      startsAt: booking.startsAt,
      cancellationWindowHours:
        booking.organization.settings?.cancellationWindowHours,
    })
  ) {
    redirect(`${baseUrl}?error=notAllowed`);
  }

  const selectedSlot = (await generateBookingSlots(
    parsed.data.branchServiceId,
    parsed.data.date,
  )).find(
    (slot) =>
      slot.startsAt === parsed.data.startsAt &&
      slot.memberId === parsed.data.memberId,
  );
  if (!selectedSlot) redirect(`${baseUrl}?error=unavailable`);

  const startsAt = new Date(selectedSlot.startsAt);
  const endsAt = new Date(selectedSlot.endsAt);
  let updated = false;

  try {
    await prisma.$transaction(
      async (transaction) => {
        const [conflict, blocked] = await Promise.all([
          transaction.booking.findFirst({
            where: {
              id: { not: booking.id },
              branchId: booking.branchId,
              memberId: parsed.data.memberId,
              status: { in: [...ACTIVE_STATUSES] },
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
            },
            select: { id: true },
          }),
          transaction.blockedTime.findFirst({
            where: {
              branchId: booking.branchId,
              OR: [
                { memberId: null },
                ...(parsed.data.memberId
                  ? [{ memberId: parsed.data.memberId }]
                  : []),
              ],
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
            },
            select: { id: true },
          }),
        ]);
        if (conflict || blocked) return;

        const result = await transaction.booking.updateMany({
          where: {
            id: booking.id,
            customerId: identity.person.id,
            status: booking.status,
          },
          data: { startsAt, endsAt, memberId: parsed.data.memberId },
        });
        if (result.count === 0) return;

        await transaction.bookingStatusHistory.create({
          data: {
            bookingId: booking.id,
            fromStatus: booking.status,
            toStatus: booking.status,
            changedByPersonId: identity.person.id,
            note: "RESCHEDULED",
          },
        });
        updated = true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    logServerError("booking.rescheduleCustomer", error, {
      bookingId: booking.id,
      customerId: identity.person.id,
    });
    updated = false;
  }

  if (!updated) redirect(`${baseUrl}?error=unavailable`);
  revalidatePath("/customer/bookings");
  revalidatePath("/business/bookings");
  revalidatePath("/business/calendar");
  redirect("/customer/bookings?rescheduled=1");
}

export async function respondToBookingChange(
  requestId: string,
  formData: FormData,
): Promise<void> {
  const identity = await requireCustomerIdentity();
  const decision = formData.get("decision");
  if (decision !== "accept" && decision !== "reject") return;
  try {
    await respondToBusinessBookingProposal({
      customerId: identity.person.id,
      decision,
      requestId,
    });
  } catch (error) {
    if (!(error instanceof BookingDomainError)) {
      logServerError("booking.respondToBusinessProposal", error, {
        customerId: identity.person.id,
        requestId,
      });
    }
    return;
  }

  revalidatePath("/customer/bookings");
  revalidatePath("/business/bookings");
  revalidatePath("/business/calendar");
  revalidatePath("/customer/notifications");
}
