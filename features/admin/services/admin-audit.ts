import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { logServerError } from "@/lib/logging/server";

export async function logAdminAuditEvent({
  adminUserId,
  action,
  targetType,
  targetId,
  metadata,
}: {
  adminUserId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminUserId,
        action,
        targetType,
        targetId,
        metadata,
      },
    });
  } catch (error) {
    logServerError("adminAudit.create", error, {
      adminUserId,
      action,
      targetType,
      targetId,
    });
  }
}
