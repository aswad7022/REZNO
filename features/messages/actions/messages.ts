"use server";

import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { requireAdminPermission } from "@/features/admin/services/admin-auth";
import { logAdminAuditEvent } from "@/features/admin/services/admin-audit";
import {
  requireBusinessIdentity,
  requireCustomerIdentity,
} from "@/features/identity/server";
import { canAccessOrganizationConversations } from "@/features/identity/policies/authorization";
import {
  canAccessConversation,
  type ConversationActor,
} from "@/features/messages/policies/conversation-access";
import { markConversationReadForActor } from "@/features/messages/services/conversation-read";
import { prisma } from "@/lib/db/prisma";
import { logServerError } from "@/lib/logging/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import type { DashboardRole } from "@/types/dashboard";
import type { MessageActionState } from "@/features/messages/types";
import { createCanonicalNotifications } from "@/features/notifications/services/producer";

const bodySchema = z.string().trim().min(1).max(1000);

async function findOrCreateBookingConversation({
  bookingId,
  businessId,
  customerId,
}: {
  bookingId: string;
  businessId: string;
  customerId: string;
}) {
  const existing = await prisma.conversation.findFirst({
    where: { bookingId, businessId, customerId, type: "CUSTOMER_BUSINESS" },
    select: { id: true },
  });
  if (existing) return existing;

  try {
    return await prisma.conversation.create({
      data: {
        type: "CUSTOMER_BUSINESS",
        businessId,
        customerId,
        bookingId,
      },
      select: { id: true },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const duplicate = await prisma.conversation.findFirst({
        where: { bookingId, businessId, customerId, type: "CUSTOMER_BUSINESS" },
        select: { id: true },
      });
      if (duplicate) return duplicate;
    }
    throw error;
  }
}

export async function openBookingConversation(
  role: "business" | "customer",
  bookingId: string,
) {
  if (role === "customer") {
    const { person } = await requireCustomerIdentity();
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        customerId: person.id,
        organization: { deletedAt: null, isActive: true, status: "ACTIVE" },
      },
      select: { id: true, organizationId: true, customerId: true },
    });
    if (!booking) return;

    try {
      await findOrCreateBookingConversation({
        bookingId: booking.id,
        businessId: booking.organizationId,
        customerId: booking.customerId,
      });
    } catch (error) {
      logServerError("messages.openBookingCustomer", error, {
        bookingId,
        customerId: person.id,
      });
    }
    revalidatePath("/customer/messages");
    redirect("/customer/messages");
  }

  const { membership } = await requireBusinessIdentity();
  if (!canAccessOrganizationConversations(membership.role.systemRole)) {
    forbidden();
  }
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      organizationId: membership.organizationId,
    },
    select: { id: true, organizationId: true, customerId: true },
  });
  if (!booking) return;

  try {
    await findOrCreateBookingConversation({
      bookingId: booking.id,
      businessId: booking.organizationId,
      customerId: booking.customerId,
    });
  } catch (error) {
    logServerError("messages.openBookingBusiness", error, {
      bookingId,
      organizationId: membership.organizationId,
    });
  }
  revalidatePath("/business/messages");
  redirect("/business/messages");
}

export async function startCustomerBusinessConversation(
  _state: MessageActionState,
  formData: FormData,
): Promise<MessageActionState> {
  const { person, session } = await requireCustomerIdentity();
  const rateLimit = consumeRateLimit("message:start", person.id, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.success) {
    return {
      status: "error",
      message:
        "تم إرسال رسائل كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.",
    };
  }
  const parsed = z
    .object({
      businessId: z.string().uuid(),
      body: bodySchema,
    })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { status: "error", message: "تحقق من الرسالة." };

  const business = await prisma.organization.findFirst({
    where: {
      id: parsed.data.businessId,
      deletedAt: null,
      isActive: true,
      status: "ACTIVE",
      bookings: { some: { customerId: person.id } },
    },
    select: { id: true },
  });
  if (!business) return { status: "error", message: "النشاط غير متاح." };

  try {
    await prisma.$transaction(async (transaction) => {
      const conversation = await transaction.conversation.create({
        data: {
          type: "CUSTOMER_BUSINESS",
          businessId: business.id,
          customerId: person.id,
        },
        select: { id: true },
      });
      const message = await transaction.message.create({
        data: {
          body: parsed.data.body,
          conversationId: conversation.id,
          senderUserId: session.user.id,
        },
        select: { id: true },
      });
      const recipients = await businessMessageRecipients(transaction, business.id);
      await createCanonicalNotifications(transaction, recipients.map((recipientPersonId) => ({
        audience: "USER" as const,
        body: "A customer sent a new message. Open the conversation to read it.",
        bodyKey: "notifications.message.customer.body",
        businessId: business.id,
        category: "MESSAGES" as const,
        destinationKind: "BUSINESS_MESSAGES" as const,
        destinationTargetId: conversation.id,
        eventKey: `message:${message.id}:business:${recipientPersonId}`,
        eventType: "message.received",
        mandatory: false,
        priority: "NORMAL" as const,
        recipientPersonId,
        sourceId: conversation.id,
        sourceType: "CONVERSATION" as const,
        title: "New customer message",
        titleKey: "notifications.message.customer.title",
      })));
    });
  } catch (error) {
    logServerError("messages.startCustomerBusiness", error, {
      customerId: person.id,
      businessId: business.id,
    });
    return {
      status: "error",
      message: "تعذر إرسال الرسالة الآن. حاول مرة أخرى بعد قليل.",
    };
  }

  revalidatePath("/customer/messages");
  revalidatePath("/business/messages");
  revalidatePath("/business/notifications");
  return { status: "success", message: "تم إرسال الرسالة." };
}

export async function sendConversationMessage(
  role: DashboardRole | "admin",
  conversationId: string,
  _state: MessageActionState,
  formData: FormData,
): Promise<MessageActionState> {
  const parsed = bodySchema.safeParse(formData.get("body"));

  if (!parsed.success) return { status: "error", message: "اكتب رسالة صالحة." };

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      businessId: true,
      customerId: true,
      adminUserId: true,
      bookingId: true,
      type: true,
      business: { select: { name: true } },
      customer: { select: { firstName: true, displayName: true } },
    },
  });
  if (!conversation) return { status: "error", message: "المحادثة غير موجودة." };

  let senderUserId: string;
  let actor: ConversationActor;

  if (role === "business") {
    const identity = await requireBusinessIdentity();
    senderUserId = identity.session.user.id;
    actor = {
      kind: "business",
      organizationId: identity.membership.organizationId,
      systemRole: identity.membership.role.systemRole,
    };
  } else if (role === "customer") {
    const identity = await requireCustomerIdentity();
    senderUserId = identity.session.user.id;
    actor = { kind: "customer", personId: identity.person.id };
  } else {
    const { identity } = await requireAdminPermission("MESSAGES_SEND");
    senderUserId = identity.session.user.id;
    actor = { kind: "admin", userId: senderUserId };
  }

  if (!canAccessConversation(conversation, actor)) {
    return { status: "error", message: "لا تملك صلاحية الرد." };
  }
  const rateLimit = consumeRateLimit("message:send", senderUserId, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.success) {
    return {
      status: "error",
      message:
        "تم إرسال رسائل كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.",
    };
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const message = await transaction.message.create({
        data: {
          conversationId,
          senderUserId,
          body: parsed.data,
        },
        select: { id: true },
      });
      await transaction.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      if (role === "customer" && conversation.businessId) {
        const recipients = await businessMessageRecipients(transaction, conversation.businessId);
        await createCanonicalNotifications(transaction, recipients.map((recipientPersonId) => ({
          audience: "USER" as const,
          body: "A customer sent a new message. Open the conversation to read it.",
          bodyKey: "notifications.message.customer.body",
          businessId: conversation.businessId!,
          category: "MESSAGES" as const,
          destinationKind: "BUSINESS_MESSAGES" as const,
          destinationTargetId: conversationId,
          eventKey: `message:${message.id}:business:${recipientPersonId}`,
          eventType: "message.received",
          mandatory: false,
          priority: "NORMAL" as const,
          recipientPersonId,
          sourceId: conversationId,
          sourceType: "CONVERSATION" as const,
          title: "New customer message",
          titleKey: "notifications.message.customer.title",
        })));
      } else if (role === "business" && conversation.customerId) {
        await createCanonicalNotifications(transaction, [{
          audience: "USER",
          body: "A business sent a new message. Open the conversation to read it.",
          bodyKey: "notifications.message.business.body",
          businessId: conversation.businessId ?? undefined,
          category: "MESSAGES",
          destinationKind: "CUSTOMER_MESSAGES",
          destinationTargetId: conversationId,
          eventKey: `message:${message.id}:customer:${conversation.customerId}`,
          eventType: "message.received",
          mandatory: false,
          priority: "NORMAL",
          recipientPersonId: conversation.customerId,
          sourceId: conversationId,
          sourceType: "CONVERSATION",
          title: "New business message",
          titleKey: "notifications.message.business.title",
        }]);
      }
    });
  } catch (error) {
    logServerError("messages.send", error, { conversationId, role });
    return {
      status: "error",
      message: "تعذر إرسال الرسالة الآن. حاول مرة أخرى بعد قليل.",
    };
  }

  if (role === "admin") {
    await logAdminAuditEvent({
      adminUserId: senderUserId,
      action: "admin.message.send",
      targetType: conversation.type,
      targetId: conversationId,
      metadata: {
        businessId: conversation.businessId,
        customerId: conversation.customerId,
        bookingId: conversation.bookingId,
      },
    });
  }

  revalidatePath(`/${role === "admin" ? "admin" : role}/messages`);
  if (role === "business") revalidatePath("/customer/notifications");
  if (role === "customer") revalidatePath("/business/notifications");
  return { status: "success", message: "تم الإرسال." };
}

async function businessMessageRecipients(
  transaction: Prisma.TransactionClient,
  organizationId: string,
) {
  const memberships = await transaction.organizationMember.findMany({
    where: {
      deletedAt: null,
      organizationId,
      status: "ACTIVE",
      organization: { deletedAt: null, isActive: true, status: "ACTIVE" },
      person: { deletedAt: null, isOnboarded: true, status: "ACTIVE" },
      role: { organizationId },
    },
    select: { personId: true, role: { select: { systemRole: true } } },
  });
  return memberships
    .filter((membership) => canAccessOrganizationConversations(membership.role.systemRole))
    .map((membership) => membership.personId);
}

export async function startAdminConversation(
  _state: MessageActionState,
  formData: FormData,
): Promise<MessageActionState> {
  const { identity } = await requireAdminPermission("MESSAGES_SEND");
  const { session } = identity;
  const rateLimit = consumeRateLimit("message:adminStart", session.user.id, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.success) {
    return {
      status: "error",
      message:
        "تم إرسال رسائل كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.",
    };
  }
  const parsed = z
    .object({
      targetType: z.enum(["USER", "BUSINESS"]),
      personId: z.string().uuid().optional().or(z.literal("")),
      businessId: z.string().uuid().optional().or(z.literal("")),
      body: bodySchema,
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "تحقق من الرسالة." };
  const hasValidTarget =
    parsed.data.targetType === "USER"
      ? Boolean(parsed.data.personId)
      : Boolean(parsed.data.businessId);
  if (!hasValidTarget) {
    return { status: "error", message: "حدد المستلم بشكل صحيح." };
  }

  const targetExists =
    parsed.data.targetType === "USER"
      ? await prisma.person.findFirst({
          where: {
            id: parsed.data.personId,
            deletedAt: null,
            status: "ACTIVE",
          },
          select: { id: true },
        })
      : await prisma.organization.findFirst({
          where: {
            id: parsed.data.businessId,
            deletedAt: null,
            isActive: true,
            status: "ACTIVE",
          },
          select: { id: true },
        });
  if (!targetExists) {
    return { status: "error", message: "المستلم غير متاح." };
  }

  let conversationId: string;
  try {
    const conversation = await prisma.conversation.create({
      data: {
        type:
          parsed.data.targetType === "USER" ? "ADMIN_USER" : "ADMIN_BUSINESS",
        adminUserId: session.user.id,
        customerId:
          parsed.data.targetType === "USER" ? parsed.data.personId : null,
        businessId:
          parsed.data.targetType === "BUSINESS" ? parsed.data.businessId : null,
        messages: {
          create: { senderUserId: session.user.id, body: parsed.data.body },
        },
      },
      select: { id: true },
    });
    conversationId = conversation.id;
  } catch (error) {
    logServerError("messages.startAdmin", error, {
      adminUserId: session.user.id,
      targetType: parsed.data.targetType,
    });
    return {
      status: "error",
      message: "تعذر إرسال الرسالة الآن. حاول مرة أخرى بعد قليل.",
    };
  }

  await logAdminAuditEvent({
    adminUserId: session.user.id,
    action: "admin.message.start",
    targetType: parsed.data.targetType,
    targetId:
      parsed.data.targetType === "USER"
        ? parsed.data.personId || undefined
        : parsed.data.businessId || undefined,
    metadata: { conversationId },
  });

  revalidatePath("/admin/messages");
  revalidatePath("/customer/messages");
  revalidatePath("/business/messages");
  return { status: "success", message: "تم إرسال الرسالة." };
}

export async function markConversationRead(
  role: DashboardRole | "admin",
  conversationId: string,
) {
  let actor: ConversationActor;
  let currentUserId: string;

  if (role === "admin") {
    const { identity } = await requireAdminPermission("MESSAGES_VIEW");
    currentUserId = identity.session.user.id;
    actor = { kind: "admin", userId: currentUserId };
  } else if (role === "business") {
    const identity = await requireBusinessIdentity();
    currentUserId = identity.session.user.id;
    actor = {
      kind: "business",
      organizationId: identity.membership.organizationId,
      systemRole: identity.membership.role.systemRole,
    };
  } else {
    const identity = await requireCustomerIdentity();
    currentUserId = identity.session.user.id;
    actor = { kind: "customer", personId: identity.person.id };
  }

  await markConversationReadForActor({
    actor,
    conversationId,
    currentUserId,
  });
}
