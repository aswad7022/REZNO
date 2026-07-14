"use server";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireBusinessIdentity, requireCustomerIdentity } from "@/features/identity/server";
import {
  canOperateBookings,
  canTransitionBooking,
} from "@/features/bookings/policies/booking-lifecycle";
import {
  bookingStatusSchema,
  createBookingSchema,
} from "@/features/bookings/schemas/booking";
import { BookingDomainError } from "@/features/bookings/domain/errors";
import { createCustomerBooking } from "@/features/bookings/services/booking-creation";
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

  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      customerId: identity.person.id,
      status: { in: [...ACTIVE_STATUSES] },
    },
    include: {
      organization: { include: { settings: true } },
    },
  });
  if (!booking) return;

  const cancellationWindowHours =
    booking.organization.settings?.cancellationWindowHours ?? 24;
  const cancellationDeadline = new Date(
    booking.startsAt.getTime() - cancellationWindowHours * 3_600_000,
  );
  if (new Date() >= cancellationDeadline) return;

  await prisma.$transaction(async (transaction) => {
    const result = await transaction.booking.updateMany({
      where: {
        id: booking.id,
        customerId: identity.person.id,
        status: booking.status,
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: reason || null,
      },
    });
    if (result.count === 0) return;

    await transaction.bookingStatusHistory.create({
      data: {
        bookingId: booking.id,
        fromStatus: booking.status,
        toStatus: "CANCELLED",
        changedByPersonId: identity.person.id,
        note: reason || null,
      },
    });
  });

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

  const windowHours =
    booking.organization.settings?.cancellationWindowHours ?? 24;
  if (Date.now() >= booking.startsAt.getTime() - windowHours * 3_600_000) {
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

export async function transitionBusinessBooking(
  bookingId: string,
  formData: FormData,
): Promise<void> {
  const identity = await requireBusinessIdentity();
  if (!canOperateBookings(identity.membership.role.systemRole)) return;

  const parsed = bookingStatusSchema.safeParse(formData.get("status"));
  if (!parsed.success) return;

  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      organizationId: identity.membership.organizationId,
    },
  });
  if (!booking || !canTransitionBooking(booking.status, parsed.data)) return;

  const cancellationData =
    parsed.data === "CANCELLED"
      ? { cancelledAt: new Date() }
      : { cancelledAt: null, cancellationReason: null };

  await prisma.$transaction(async (transaction) => {
    const result = await transaction.booking.updateMany({
      where: {
        id: booking.id,
        organizationId: identity.membership.organizationId,
        status: booking.status,
      },
      data: { status: parsed.data, ...cancellationData },
    });
    if (result.count === 0) return;

    await transaction.bookingStatusHistory.create({
      data: {
        bookingId: booking.id,
        fromStatus: booking.status,
        toStatus: parsed.data,
        changedByPersonId: identity.person.id,
      },
    });
  });

  revalidatePath("/customer/bookings");
  revalidatePath("/business/bookings");
  revalidatePath("/business/calendar");
}

export async function proposeBookingChange(
  bookingId: string,
  formData: FormData,
): Promise<void> {
  const identity = await requireBusinessIdentity();
  if (!canOperateBookings(identity.membership.role.systemRole)) return;

  const parsed = createBookingSchema.safeParse({
    branchServiceId: formData.get("branchServiceId"),
    date: formData.get("date"),
    startsAt: formData.get("startsAt"),
    memberId: formData.get("memberId") ?? "",
  });
  const baseUrl = `/business/bookings/${bookingId}/reschedule`;
  if (!parsed.success) redirect(`${baseUrl}?error=invalid`);

  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      organizationId: identity.membership.organizationId,
      branchServiceId: parsed.data.branchServiceId,
      status: { in: [...ACTIVE_STATUSES] },
    },
  });
  if (!booking) redirect(`${baseUrl}?error=unavailable`);

  const slot = (await generateBookingSlots(
    parsed.data.branchServiceId,
    parsed.data.date,
  )).find(
    (candidate) =>
      candidate.startsAt === parsed.data.startsAt &&
      candidate.memberId === parsed.data.memberId,
  );
  if (!slot) redirect(`${baseUrl}?error=unavailable`);

  const proposedStartsAt = new Date(slot.startsAt);
  const proposedEndsAt = new Date(slot.endsAt);
  let requested = false;

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
              startsAt: { lt: proposedEndsAt },
              endsAt: { gt: proposedStartsAt },
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
              startsAt: { lt: proposedEndsAt },
              endsAt: { gt: proposedStartsAt },
            },
            select: { id: true },
          }),
        ]);
        if (conflict || blocked) return;

        await transaction.bookingChangeRequest.updateMany({
          where: { bookingId: booking.id, status: "PENDING" },
          data: { status: "CANCELLED", respondedAt: new Date() },
        });
        await transaction.bookingChangeRequest.create({
          data: {
            bookingId: booking.id,
            requestedByPersonId: identity.person.id,
            proposedMemberId: parsed.data.memberId,
            proposedStartsAt,
            proposedEndsAt,
          },
        });
        requested = true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    logServerError("booking.proposeChange", error, {
      bookingId: booking.id,
      organizationId: identity.membership.organizationId,
    });
  }

  if (!requested) redirect(`${baseUrl}?error=unavailable`);

  revalidatePath("/business/bookings");
  revalidatePath("/customer/bookings");
  revalidatePath("/customer/notifications");
  redirect("/business/bookings?changeRequested=1");
}

export async function respondToBookingChange(
  requestId: string,
  formData: FormData,
): Promise<void> {
  const identity = await requireCustomerIdentity();
  const decision = formData.get("decision");
  if (decision !== "accept" && decision !== "reject") return;

  const request = await prisma.bookingChangeRequest.findFirst({
    where: {
      id: requestId,
      status: "PENDING",
      booking: {
        customerId: identity.person.id,
        status: { in: [...ACTIVE_STATUSES] },
      },
    },
    include: {
      booking: { include: { branch: true } },
    },
  });
  if (!request) return;

  if (decision === "reject") {
    await prisma.bookingChangeRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: { status: "REJECTED", respondedAt: new Date() },
    });
  } else {
    let accepted = false;
    try {
      await prisma.$transaction(
        async (transaction) => {
          const [conflict, blocked] = await Promise.all([
            transaction.booking.findFirst({
              where: {
                id: { not: request.bookingId },
                branchId: request.booking.branchId,
                memberId: request.proposedMemberId,
                status: { in: [...ACTIVE_STATUSES] },
                startsAt: { lt: request.proposedEndsAt },
                endsAt: { gt: request.proposedStartsAt },
              },
              select: { id: true },
            }),
            transaction.blockedTime.findFirst({
              where: {
                branchId: request.booking.branchId,
                OR: [
                  { memberId: null },
                  ...(request.proposedMemberId
                    ? [{ memberId: request.proposedMemberId }]
                    : []),
                ],
                startsAt: { lt: request.proposedEndsAt },
                endsAt: { gt: request.proposedStartsAt },
              },
              select: { id: true },
            }),
          ]);
          if (conflict || blocked || request.proposedStartsAt <= new Date()) return;

          const changed = await transaction.bookingChangeRequest.updateMany({
            where: { id: request.id, status: "PENDING" },
            data: { status: "ACCEPTED", respondedAt: new Date() },
          });
          if (changed.count === 0) return;

          await transaction.booking.update({
            where: { id: request.bookingId },
            data: {
              startsAt: request.proposedStartsAt,
              endsAt: request.proposedEndsAt,
              memberId: request.proposedMemberId,
            },
          });
          await transaction.bookingStatusHistory.create({
            data: {
              bookingId: request.bookingId,
              fromStatus: request.booking.status,
              toStatus: request.booking.status,
              changedByPersonId: identity.person.id,
              note: "CHANGE_ACCEPTED",
            },
          });
          accepted = true;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      logServerError("booking.respondToChange", error, {
        requestId: request.id,
        customerId: identity.person.id,
      });
      accepted = false;
    }
    if (!accepted) {
      revalidatePath("/customer/bookings");
      return;
    }
  }

  revalidatePath("/customer/bookings");
  revalidatePath("/business/bookings");
  revalidatePath("/business/calendar");
  revalidatePath("/customer/notifications");
}
