import "server-only";

import type { Prisma } from "@prisma/client";

import type { CanonicalNotificationEvent } from "@/features/notifications/domain/contracts";
import { createCanonicalNotifications } from "@/features/notifications/services/producer";

export type BusinessBookingEvent =
  | "booking.cancelled-by-customer"
  | "booking.change-requested"
  | "booking.created"
  | "booking.proposal-accepted"
  | "booking.proposal-rejected";

const BUSINESS_COPY: Record<BusinessBookingEvent, { body: string; mandatory: boolean; title: string }> = {
  "booking.cancelled-by-customer": { body: "A customer cancelled a booking. Open the booking for operational details.", mandatory: true, title: "Booking cancelled by customer" },
  "booking.change-requested": { body: "A customer requested a booking change. Review the proposed time.", mandatory: true, title: "Booking change requested" },
  "booking.created": { body: "A customer created a new service booking.", mandatory: true, title: "New booking" },
  "booking.proposal-accepted": { body: "A customer accepted the proposed booking change.", mandatory: true, title: "Booking proposal accepted" },
  "booking.proposal-rejected": { body: "A customer rejected the proposed booking change.", mandatory: false, title: "Booking proposal rejected" },
};

export async function createBusinessBookingNotifications(
  transaction: Prisma.TransactionClient,
  input: { bookingId: string; event: BusinessBookingEvent; eventKey: string },
) {
  const booking = await transaction.booking.findUniqueOrThrow({
    where: { id: input.bookingId },
    select: {
      member: { select: { personId: true, role: { select: { systemRole: true } } } },
      organizationId: true,
    },
  });
  const message = BUSINESS_COPY[input.event];
  const common = {
    body: message.body,
    bodyKey: `notifications.${input.event}.body`,
    businessId: booking.organizationId,
    category: "BOOKINGS" as const,
    destinationKind: "BUSINESS_BOOKING" as const,
    destinationTargetId: input.bookingId,
    eventType: input.event,
    mandatory: message.mandatory,
    priority: message.mandatory ? "IMPORTANT" as const : "NORMAL" as const,
    sourceId: input.bookingId,
    sourceType: "BOOKING" as const,
    title: message.title,
    titleKey: `notifications.${input.event}.title`,
  };
  const events: CanonicalNotificationEvent[] = [{
    ...common,
    audience: "BUSINESS" as const,
    eventKey: `${input.eventKey}:business`,
  }];
  if (booking.member?.role.systemRole === "STAFF") {
    events.push({
      ...common,
      audience: "USER" as const,
      eventKey: `${input.eventKey}:staff:${booking.member.personId}`,
      recipientPersonId: booking.member.personId,
    });
  }
  return createCanonicalNotifications(transaction, events);
}
