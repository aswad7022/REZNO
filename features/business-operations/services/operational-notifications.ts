import "server-only";

import type { Prisma } from "@prisma/client";

import { createCanonicalNotifications } from "@/features/notifications/services/producer";

export type CustomerOperationalNotificationEvent =
  | "booking.cancelled"
  | "booking.change-proposed"
  | "booking.change-request-accepted"
  | "booking.change-request-rejected"
  | "booking.completed"
  | "booking.confirmed"
  | "booking.no-show"
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
  "booking.completed": {
    title: "اكتمل حجزك",
    body: "اكتملت الخدمة. يمكنك فتح الحجز وإضافة تقييمك.",
    priority: "NORMAL",
  },
  "booking.confirmed": {
    title: "تم تأكيد حجزك",
    body: "أكد النشاط حجزك. افتح التفاصيل لمراجعة الموعد.",
    priority: "IMPORTANT",
  },
  "booking.no-show": {
    title: "تم تحديث حالة الحجز",
    body: "سجّل النشاط الحجز كعدم حضور. افتح التفاصيل إذا كنت بحاجة للمساعدة.",
    priority: "IMPORTANT",
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
  return createCanonicalNotifications(transaction, [{
      audience: "USER",
      body: message.body,
      bodyKey: `notifications.${input.event}.body`,
      businessId: input.businessId,
      category: input.event === "restaurant.rescheduled" ? "RESTAURANT" : "BOOKINGS",
      destinationKind: input.event === "restaurant.rescheduled" ? "CUSTOMER_RESTAURANT" : "CUSTOMER_BOOKING",
      destinationTargetId: input.bookingId,
      eventKey: input.eventKey,
      eventType: input.event,
      mandatory: message.priority === "IMPORTANT",
      priority: message.priority,
      recipientPersonId: input.customerId,
      sourceId: input.bookingId,
      sourceType: input.event === "restaurant.rescheduled" ? "RESTAURANT_RESERVATION" : "BOOKING",
      title: message.title,
      titleKey: `notifications.${input.event}.title`,
  }]);
}
