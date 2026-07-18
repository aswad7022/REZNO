"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { MessageDomainError } from "@/features/messages/domain/errors";
import { resolveMessageActor } from "@/features/messages/services/web-actor";
import { markConversationReadForActor } from "@/features/messages/services/conversation-read";
import {
  openBookingConversationForActor,
  sendMessage,
  startAdminConversation as startAdminConversationCanonical,
  startCustomerBusinessConversation as startCustomerBusinessConversationCanonical,
} from "@/features/messages/services/delivery-service";
import type { MessageActionState } from "@/features/messages/types";
import { logServerError } from "@/lib/logging/server";
import type { DashboardRole } from "@/types/dashboard";

export async function openBookingConversation(
  role: "business" | "customer",
  bookingId: string,
) {
  const actor = await resolveMessageActor(role);
  if (actor.kind === "admin") return;
  let conversationId: string;
  try {
    const conversation = await openBookingConversationForActor(actor, bookingId);
    conversationId = conversation.id;
    revalidateMessaging(role);
  } catch (error) {
    if (error instanceof MessageDomainError) return;
    logServerError("messages.openBooking", error, { bookingId, role });
    return;
  }
  redirect(`/${role}/messages?conversationId=${conversationId}`);
}

export async function startCustomerBusinessConversation(
  _state: MessageActionState,
  formData: FormData,
): Promise<MessageActionState> {
  const actor = await resolveMessageActor("customer");
  if (actor.kind !== "customer") return failure("FORBIDDEN");
  try {
    const result = await startCustomerBusinessConversationCanonical(actor, {
      body: formData.get("body"),
      businessId: stringField(formData, "businessId"),
      idempotencyKey: stringField(formData, "idempotencyKey"),
    });
    revalidateMessaging("customer");
    revalidateMessaging("business");
    return {
      conversationId: result.conversationId,
      message: "تم إرسال الرسالة.",
      status: "success",
    };
  } catch (error) {
    return actionFailure("messages.startCustomer", error);
  }
}

export async function sendConversationMessage(
  role: DashboardRole | "admin",
  conversationId: string,
  _state: MessageActionState,
  formData: FormData,
): Promise<MessageActionState> {
  const actor = await resolveMessageActor(
    role,
    role === "admin" ? "MESSAGES_SEND" : "MESSAGES_VIEW",
  );
  try {
    const result = await sendMessage(actor, {
      body: formData.get("body"),
      conversationId,
      idempotencyKey: stringField(formData, "idempotencyKey"),
    });
    revalidateMessaging(role);
    revalidatePath("/customer/notifications");
    revalidatePath("/business/notifications");
    return {
      message: result.replayed ? "تم تأكيد الرسالة السابقة." : "تم الإرسال.",
      status: "success",
    };
  } catch (error) {
    return actionFailure("messages.send", error, { conversationId, role });
  }
}

export async function startAdminConversation(
  _state: MessageActionState,
  formData: FormData,
): Promise<MessageActionState> {
  const actor = await resolveMessageActor("admin", "MESSAGES_SEND");
  if (actor.kind !== "admin") return failure("FORBIDDEN");
  const [targetType, targetId] = stringField(formData, "target").split(":", 2);
  if (targetType !== "USER" && targetType !== "BUSINESS") {
    return failure("VALIDATION_ERROR");
  }
  try {
    const result = await startAdminConversationCanonical(actor, {
      body: formData.get("body"),
      idempotencyKey: stringField(formData, "idempotencyKey"),
      targetId: targetId ?? "",
      targetType,
    });
    revalidateMessaging("admin");
    revalidateMessaging("customer");
    revalidateMessaging("business");
    return {
      conversationId: result.conversationId,
      message: "تم إرسال الرسالة.",
      status: "success",
    };
  } catch (error) {
    return actionFailure("messages.startAdmin", error);
  }
}

export async function markConversationRead(
  role: DashboardRole | "admin",
  conversationId: string,
  throughMessageId?: string,
) {
  const actor = await resolveMessageActor(role);
  const result = await markConversationReadForActor({
    actor,
    conversationId,
    throughMessageId,
  });
  if (!result.authorized) return { ok: false as const };
  revalidateMessaging(role);
  revalidatePath("/customer/notifications");
  revalidatePath("/business/notifications");
  return { ok: true as const, ...result };
}

function stringField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function actionFailure(
  label: string,
  error: unknown,
  metadata?: Record<string, string | number | boolean | null | undefined>,
): MessageActionState {
  if (error instanceof MessageDomainError) return failure(error.code);
  logServerError(label, error, metadata);
  return {
    code: "INTERNAL_ERROR",
    message: "تعذر تنفيذ عملية الرسائل الآن. حاول مرة أخرى.",
    status: "error",
  };
}

function failure(code: string): MessageActionState {
  const messages: Record<string, string> = {
    FORBIDDEN: "لا تملك صلاحية تنفيذ هذه العملية.",
    IDEMPOTENCY_CONFLICT: "تعذر إعادة استخدام مفتاح الإرسال لهذه الرسالة.",
    INVALID_CURSOR: "رابط صفحة الرسائل غير صالح.",
    NOT_FOUND: "المحادثة أو المستلم غير متاح.",
    RATE_LIMITED: "تم إرسال رسائل كثيرة خلال وقت قصير. انتظر قليلًا.",
    VALIDATION_ERROR: "تحقق من الرسالة والبيانات المطلوبة.",
  };
  return {
    code,
    message: messages[code] ?? "تعذر تنفيذ عملية الرسائل.",
    status: "error",
  };
}

function revalidateMessaging(role: DashboardRole | "admin") {
  revalidatePath(`/${role}/messages`);
  revalidatePath(`/${role}`);
}
