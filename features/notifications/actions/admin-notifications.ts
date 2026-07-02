"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminPermission } from "@/features/admin/services/admin-auth";
import { logAdminAuditEvent } from "@/features/admin/services/admin-audit";
import { prisma } from "@/lib/db/prisma";
import { logServerError } from "@/lib/logging/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import type { AdminNotificationActionState } from "@/features/notifications/types";

const adminNotificationSchema = z.object({
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(2000),
  audience: z.enum([
    "ALL",
    "CUSTOMERS",
    "BUSINESS_OWNERS",
    "RESTAURANTS",
    "BUSINESS",
    "USER",
  ]),
  priority: z.enum(["NORMAL", "IMPORTANT"]),
  businessId: z.string().uuid().optional().or(z.literal("")),
  recipientPersonId: z.string().uuid().optional().or(z.literal("")),
});

export async function createAdminNotification(
  _state: AdminNotificationActionState,
  formData: FormData,
): Promise<AdminNotificationActionState> {
  const { identity } = await requireAdminPermission("NOTIFICATIONS_SEND");
  const { session } = identity;
  const rateLimit = consumeRateLimit(
    "adminNotification:create",
    session.user.id,
    {
      limit: 10,
      windowMs: 60_000,
    },
  );
  if (!rateLimit.success) {
    return {
      status: "error",
      message:
        "تم إرسال إشعارات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.",
    };
  }
  const parsed = adminNotificationSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { status: "error", message: "تحقق من بيانات الإشعار." };
  }

  const data = parsed.data;
  if (data.audience === "BUSINESS") {
    if (!data.businessId) {
      return { status: "error", message: "حدد النشاط المستلم." };
    }
    const business = await prisma.organization.findFirst({
      where: { id: data.businessId, deletedAt: null },
      select: { id: true },
    });
    if (!business) {
      return { status: "error", message: "النشاط غير متاح." };
    }
  }
  if (data.audience === "USER") {
    if (!data.recipientPersonId) {
      return { status: "error", message: "حدد المستخدم المستلم." };
    }
    const person = await prisma.person.findFirst({
      where: { id: data.recipientPersonId, deletedAt: null },
      select: { id: true },
    });
    if (!person) {
      return { status: "error", message: "المستخدم غير متاح." };
    }
  }

  let notificationId: string;
  try {
    const notification = await prisma.notification.create({
      data: {
        title: data.title,
        body: data.body,
        audience: data.audience,
        priority: data.priority,
        businessId:
          data.audience === "BUSINESS" ? data.businessId || null : null,
        recipientPersonId:
          data.audience === "USER" ? data.recipientPersonId || null : null,
        createdByUserId: session.user.id,
      },
      select: { id: true },
    });
    notificationId = notification.id;
  } catch (error) {
    logServerError("adminNotification.create", error, {
      adminUserId: session.user.id,
      audience: data.audience,
    });
    return {
      status: "error",
      message: "تعذر إرسال الإشعار الآن. حاول مرة أخرى بعد قليل.",
    };
  }

  await logAdminAuditEvent({
    adminUserId: session.user.id,
    action: "admin.notification.create",
    targetType: data.audience,
    targetId:
      data.audience === "BUSINESS"
        ? data.businessId || undefined
        : data.audience === "USER"
          ? data.recipientPersonId || undefined
          : undefined,
    metadata: {
      notificationId,
      priority: data.priority,
    },
  });

  revalidatePath("/admin/notifications");
  revalidatePath("/customer/notifications");
  revalidatePath("/business/notifications");

  return { status: "success", message: "تم إرسال الإشعار." };
}
