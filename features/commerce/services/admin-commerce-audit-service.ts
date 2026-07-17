import "server-only";

import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { sanitizeAuditValue } from "@/features/business-operations/domain/validation";
import {
  adminActorScope,
  adminFilterFingerprint,
  assertDateRange,
  assertAdminPageLimit,
  decodeAdminCursor,
  encodeAdminCursor,
} from "@/features/commerce/domain/admin-commerce";
import { commerceError } from "@/features/commerce/domain/errors";
import { assertAdminPermission, assertCommerceAdminCurrent, type CommerceAdminContext } from "@/features/commerce/services/authorization";
import { prisma } from "@/lib/db/prisma";

const uuid = z.string().uuid();

export interface AdminCommerceAuditQuery {
  action?: string;
  adminUserId?: string;
  cursor?: string;
  from?: Date;
  limit: number;
  targetId?: string;
  targetType?: string;
  to?: Date;
}

export async function listAdminCommerceAudit(context: CommerceAdminContext, query: AdminCommerceAuditQuery) {
  assertAdminPermission(context, "AUDIT_LOG_VIEW");
  assertAdminPageLimit(query.limit);
  assertDateRange(query.from, query.to);
  if (query.adminUserId && query.adminUserId.length > 200) commerceError("VALIDATION_ERROR", "Admin User filter is too long.");
  if (query.targetId && !uuid.safeParse(query.targetId).success) commerceError("VALIDATION_ERROR", "Audit target ID must be a UUID.");
  const action = query.action?.trim().slice(0, 120) || undefined;
  const targetType = query.targetType?.trim().slice(0, 80) || undefined;
  const filter = adminFilterFingerprint({
    action, adminUserId: query.adminUserId, from: query.from?.toISOString(),
    targetId: query.targetId, targetType, to: query.to?.toISOString(),
  });
  const actor = adminActorScope(context);
  const cursor = query.cursor ? decodeAdminCursor(query.cursor, {
    actor, filter, kind: "commerce-audit", permission: "AUDIT_LOG_VIEW", target: "commerce",
  }) : null;
  const snapshot = cursor?.snapshotDate ?? new Date();
  const where: Prisma.AdminAuditLogWhereInput = {
    action: action ? { startsWith: action } : { startsWith: "commerce." },
    adminUserId: query.adminUserId,
    createdAt: { gte: query.from, lte: query.to && query.to < snapshot ? query.to : snapshot },
    targetId: query.targetId,
    targetType,
    ...(cursor ? { OR: [
      { createdAt: { lt: cursor.sortDate } },
      { createdAt: cursor.sortDate, id: { lt: cursor.id } },
    ] } : {}),
  };
  return prisma.$transaction(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "AUDIT_LOG_VIEW");
    const rows = await transaction.adminAuditLog.findMany({
      where,
      select: {
        action: true, adminUser: { select: { id: true, name: true } }, createdAt: true,
        id: true, metadata: true, targetId: true, targetType: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });
    const visible = rows.slice(0, query.limit);
    const last = visible.at(-1);
    return {
      data: visible.map((entry) => ({
        action: entry.action,
        admin: entry.adminUser,
        createdAt: entry.createdAt.toISOString(),
        id: entry.id,
        metadata: sanitizeAuditValue(entry.metadata),
        targetId: entry.targetId,
        targetType: entry.targetType,
      })),
      pageInfo: {
        hasNextPage: rows.length > query.limit,
        nextCursor: rows.length > query.limit && last ? encodeAdminCursor({
          actor, filter, id: last.id, kind: "commerce-audit", permission: "AUDIT_LOG_VIEW",
          snapshot: snapshot.toISOString(), sortValue: last.createdAt.toISOString(), target: "commerce",
        }) : null,
      },
    };
  });
}
