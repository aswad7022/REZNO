import "server-only";

import type { Prisma } from "@prisma/client";

export type CustomerOperationalNotificationEvent =
  | "booking.cancelled"
  | "booking.change-proposed"
  | "booking.change-request-accepted"
  | "booking.change-request-rejected"
  | "restaurant.rescheduled";

const copy: Record<
  CustomerOperationalNotificationEvent,
  { title: string; body: string; priority: "IMPORTANT" | "NORMAL" }
> = {
  "booking.cancelled": {
    title: "تم إلغاء حجزك",
    body: "ألغى النشاط الحجز. افتح تفاصيل الحجز للاطلاع على السبب.",
    priority: "IMPORTANT",
  },
  "booking.change-proposed": {
    title: "اقتراح موعد جديد",
    body: "اقترح النشاط موعداً جديداً لحجزك. راجع الاقتراح للقبول أو الرفض.",
    priority: "IMPORTANT",
  },
  "booking.change-request-accepted": {
    title: "تم قبول طلب تغيير الحجز",
    body: "تم تحديث موعد حجزك وفق الطلب الذي أرسلته.",
    priority: "IMPORTANT",
  },
  "booking.change-request-rejected": {
    title: "تعذر قبول طلب تغيير الحجز",
    body: "رفض النشاط طلب تغيير الموعد. بقي الحجز على موعده الحالي.",
    priority: "NORMAL",
  },
  "restaurant.rescheduled": {
    title: "تم تحديث حجز المطعم",
    body: "حدّث النشاط وقت الحجز أو بيانات الطاولة. راجع التفاصيل المحدثة.",
    priority: "IMPORTANT",
  },
};

export async function createCustomerOperationalNotification(
  transaction: Prisma.TransactionClient,
  input: {
    bookingId: string;
    businessId: string;
    customerId: string;
    event: CustomerOperationalNotificationEvent;
    eventKey: string;
  },
) {
  const message = copy[input.event];
  return transaction.notification.create({
    data: {
      audience: "USER",
      body: message.body,
      businessId: input.businessId,
      eventKey: input.eventKey,
      metadata: { bookingId: input.bookingId, event: input.event },
      priority: message.priority,
      recipientPersonId: input.customerId,
      title: message.title,
    },
  });
}
