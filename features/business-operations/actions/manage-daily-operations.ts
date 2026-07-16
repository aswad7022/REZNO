"use server";

import { randomUUID } from "node:crypto";
import type { BookingStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { BusinessOperationsError } from "@/features/business-operations/domain/errors";
import { operationEnvelopeSchema } from "@/features/business-operations/domain/validation";
import {
  proposeOperationalBookingChange,
  respondToOperationalCustomerChangeRequest,
  transitionOperationalBooking,
} from "@/features/business-operations/services/booking-operations";
import { rescheduleOperationalRestaurantReservation } from "@/features/business-operations/services/restaurant-operations";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import { logServerError } from "@/lib/logging/server";

export interface DailyOperationActionState {
  code?: BusinessOperationsError["code"];
  message?: string;
  nextIdempotencyKey?: string;
  replayed?: boolean;
  status: "error" | "idle" | "success";
  version?: string;
  reservationVersion?: string;
}

const transitionSchema = z.enum(["CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"]);

function hasUnknownFields(formData: FormData, allowed: readonly string[]) {
  const fields = new Set(allowed);
  return [...formData.keys()].some(
    (key) => !key.startsWith("$ACTION_") && !fields.has(key),
  );
}

function actionError(error: unknown, operation: string): DailyOperationActionState {
  if (error instanceof BusinessOperationsError) {
    return { code: error.code, message: error.message, status: "error" };
  }
  logServerError(`businessOperations.daily.${operation}`, error);
  return { message: "تعذر حفظ العملية. حدّث الصفحة وحاول مرة أخرى.", status: "error" };
}

function revalidateBooking(bookingId: string) {
  revalidatePath("/business/calendar");
  revalidatePath("/business/bookings");
  revalidatePath(`/business/bookings/${bookingId}`);
  revalidatePath("/business/reservations");
  revalidatePath(`/business/reservations/${bookingId}`);
  revalidatePath("/customer/bookings");
  revalidatePath(`/customer/bookings/${bookingId}`);
  revalidatePath("/customer/notifications");
}

export async function transitionBookingAction(
  bookingId: string,
  _previous: DailyOperationActionState,
  formData: FormData,
): Promise<DailyOperationActionState> {
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  const nextStatus = transitionSchema.safeParse(formData.get("nextStatus"));
  const reason = formData.get("cancellationReason");
  if (
    !envelope.success ||
    !nextStatus.success ||
    hasUnknownFields(formData, [
      "cancellationReason",
      "contextOrganizationId",
      "expectedVersion",
      "idempotencyKey",
      "nextStatus",
    ])
  ) {
    return { code: "INVALID_REQUEST", message: "بيانات العملية غير صالحة.", status: "error" };
  }
  try {
    const result = await transitionOperationalBooking({
      actor: await currentBusinessOperationReference(),
      bookingId,
      cancellationReason:
        typeof reason === "string" && reason.trim() ? reason : null,
      ...envelope.data,
      nextStatus: nextStatus.data as BookingStatus,
    });
    revalidateBooking(bookingId);
    return {
      message: result.replayed ? "تم تأكيد النتيجة المحفوظة." : "تم تحديث الحجز.",
      nextIdempotencyKey: randomUUID(),
      replayed: result.replayed,
      status: "success",
      version: result.version,
    };
  } catch (error) {
    return actionError(error, "transition");
  }
}

export async function respondCustomerChangeRequestAction(
  requestId: string,
  _previous: DailyOperationActionState,
  formData: FormData,
): Promise<DailyOperationActionState> {
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedBookingVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  const decision = z.enum(["accept", "reject"]).safeParse(formData.get("decision"));
  const expectedRequestCreatedAt = z.string().datetime({ offset: true }).safeParse(
    formData.get("expectedRequestCreatedAt"),
  );
  if (
    !envelope.success ||
    !decision.success ||
    !expectedRequestCreatedAt.success ||
    hasUnknownFields(formData, [
      "contextOrganizationId",
      "decision",
      "expectedBookingVersion",
      "expectedRequestCreatedAt",
      "idempotencyKey",
    ])
  ) {
    return { code: "INVALID_REQUEST", message: "بيانات الطلب غير صالحة.", status: "error" };
  }
  try {
    const result = await respondToOperationalCustomerChangeRequest({
      actor: await currentBusinessOperationReference(),
      contextOrganizationId: envelope.data.contextOrganizationId,
      decision: decision.data,
      expectedBookingVersion: envelope.data.expectedVersion,
      expectedRequestCreatedAt: expectedRequestCreatedAt.data,
      idempotencyKey: envelope.data.idempotencyKey,
      requestId,
    });
    revalidateBooking(result.bookingId);
    return {
      message: result.replayed ? "تم تأكيد الرد المحفوظ." : "تم حفظ الرد على الطلب.",
      nextIdempotencyKey: randomUUID(),
      replayed: result.replayed,
      status: "success",
    };
  } catch (error) {
    return actionError(error, "change-request-response");
  }
}

export async function proposeBookingChangeAction(
  bookingId: string,
  _previous: DailyOperationActionState,
  formData: FormData,
): Promise<DailyOperationActionState> {
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedBookingVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(formData.get("date"));
  const startsAt = z.string().datetime({ offset: true }).safeParse(formData.get("startsAt"));
  const memberValue = formData.get("memberId");
  const memberId = memberValue === "" ? null : z.string().uuid().safeParse(memberValue);
  if (
    !envelope.success ||
    !date.success ||
    !startsAt.success ||
    (memberId !== null && !memberId.success) ||
    hasUnknownFields(formData, [
      "contextOrganizationId",
      "date",
      "expectedBookingVersion",
      "idempotencyKey",
      "memberId",
      "startsAt",
      "supersedeExistingBusinessProposal",
    ])
  ) {
    return { code: "INVALID_REQUEST", message: "بيانات الاقتراح غير صالحة.", status: "error" };
  }
  try {
    const result = await proposeOperationalBookingChange({
      actor: await currentBusinessOperationReference(),
      bookingId,
      contextOrganizationId: envelope.data.contextOrganizationId,
      date: date.data,
      expectedBookingVersion: envelope.data.expectedVersion,
      idempotencyKey: envelope.data.idempotencyKey,
      memberId: memberId === null ? null : memberId.data,
      startsAt: startsAt.data,
      supersedeExistingBusinessProposal:
        formData.get("supersedeExistingBusinessProposal") === "on",
    });
    revalidateBooking(bookingId);
    return {
      message: result.replayed ? "تم تأكيد الاقتراح المحفوظ." : "أُرسل الاقتراح إلى العميل.",
      nextIdempotencyKey: randomUUID(),
      replayed: result.replayed,
      status: "success",
    };
  } catch (error) {
    return actionError(error, "change-proposal");
  }
}

export async function rescheduleRestaurantReservationAction(
  bookingId: string,
  _previous: DailyOperationActionState,
  formData: FormData,
): Promise<DailyOperationActionState> {
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedBookingVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  const expectedReservationVersion = z.string().datetime({ offset: true }).safeParse(
    formData.get("expectedReservationVersion"),
  );
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(formData.get("date"));
  const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).safeParse(formData.get("time"));
  const guestCount = z.coerce.number().int().min(1).max(100).safeParse(
    formData.get("guestCount"),
  );
  const tableValue = formData.get("tableId");
  const tableId = tableValue === "" ? null : z.string().uuid().safeParse(tableValue);
  if (
    !envelope.success ||
    !expectedReservationVersion.success ||
    !date.success ||
    !time.success ||
    !guestCount.success ||
    (tableId !== null && !tableId.success) ||
    hasUnknownFields(formData, [
      "contextOrganizationId",
      "customerNote",
      "date",
      "expectedBookingVersion",
      "expectedReservationVersion",
      "guestCount",
      "idempotencyKey",
      "seatingArea",
      "time",
      "tableId",
    ])
  ) {
    return { code: "INVALID_REQUEST", message: "بيانات تعديل الحجز غير صالحة.", status: "error" };
  }
  try {
    const result = await rescheduleOperationalRestaurantReservation({
      actor: await currentBusinessOperationReference(),
      bookingId,
      contextOrganizationId: envelope.data.contextOrganizationId,
      expectedBookingVersion: envelope.data.expectedVersion,
      expectedReservationVersion: expectedReservationVersion.data,
      idempotencyKey: envelope.data.idempotencyKey,
      reservation: {
        customerNote: formData.get("customerNote"),
        date: date.data,
        guestCount: guestCount.data,
        seatingArea: formData.get("seatingArea"),
        time: time.data,
        tableId: tableId === null ? null : tableId.data,
      },
    });
    revalidateBooking(bookingId);
    return {
      message: result.replayed ? "تم تأكيد التعديل المحفوظ." : "تم تحديث حجز المطعم.",
      nextIdempotencyKey: randomUUID(),
      replayed: result.replayed,
      reservationVersion: result.reservationVersion,
      status: "success",
      version: result.bookingVersion,
    };
  } catch (error) {
    return actionError(error, "restaurant-reschedule");
  }
}
