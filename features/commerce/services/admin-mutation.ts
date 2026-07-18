import "server-only";

import type { AdminPermission } from "@/features/admin/config/permissions";
import { sanitizeAuditValue } from "@/features/business-operations/domain/validation";
import { commerceError } from "@/features/commerce/domain/errors";
import { hashCheckoutRequest, type CanonicalValue } from "@/features/commerce/domain/idempotency";
import {
  assertCommerceAdminCurrent,
  type CommerceAdminContext,
} from "@/features/commerce/services/authorization";
import type { Prisma } from "@prisma/client";

type Transaction = Prisma.TransactionClient;

export function adminMutationHash(value: CanonicalValue) {
  return hashCheckoutRequest(value);
}

export function assertAdminExpectedDateVersion(current: Date, expected: string) {
  if (current.toISOString() !== expected) {
    commerceError("STALE_VERSION", "The Admin target changed. Refresh and retry.");
  }
}

export async function resolveAdminMutationReplay<T>(
  transaction: Transaction,
  input: {
    action: string;
    context: CommerceAdminContext;
    idempotencyKey: string;
    permission: AdminPermission;
    requestHash: string;
    targetId: string;
    targetType: string;
    validateResult: (value: Prisma.JsonValue | null) => T | null;
  },
): Promise<T | null> {
  await assertCommerceAdminCurrent(transaction, input.context, input.permission);
  const existing = await transaction.adminAuditLog.findUnique({
    where: {
      adminUserId_idempotencyKey: {
        adminUserId: input.context.userId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (!existing) return null;
  const metadata = jsonObject(existing.metadata);
  if (
    existing.action !== input.action ||
    existing.requestHash !== input.requestHash ||
    existing.targetId !== input.targetId ||
    existing.targetType !== input.targetType ||
    metadata.adminAccessId !== input.context.adminAccessId ||
    metadata.actorSource !== input.context.source ||
    metadata.permission !== input.permission
  ) {
    commerceError("IDEMPOTENCY_CONFLICT", "The Admin idempotency key was already used in another scope.");
  }
  const result = input.validateResult(existing.result);
  if (!result || !existing.resultVersion || metadata.resultVersion !== existing.resultVersion.toISOString()) {
    commerceError("CONFLICT", "The exact Admin replay result is unavailable.");
  }
  return result;
}

export async function recordAdminMutation(
  transaction: Transaction,
  input: {
    action: string;
    after?: unknown;
    before?: unknown;
    context: CommerceAdminContext;
    idempotencyKey: string;
    permission: AdminPermission;
    reason?: string | null;
    requestHash: string;
    result: Prisma.InputJsonValue;
    resultVersion: Date;
    targetId: string;
    targetType: string;
  },
) {
  await transaction.adminAuditLog.create({
    data: {
      action: input.action,
      adminUserId: input.context.userId,
      idempotencyKey: input.idempotencyKey,
      metadata: sanitizeAuditValue({
        adminAccessId: input.context.adminAccessId,
        actorSource: input.context.source,
        after: input.after,
        before: input.before,
        permission: input.permission,
        reason: input.reason ?? null,
        resultVersion: input.resultVersion.toISOString(),
      }) as Prisma.InputJsonValue,
      requestHash: input.requestHash,
      result: input.result,
      resultVersion: input.resultVersion,
      targetId: input.targetId,
      targetType: input.targetType,
    },
  });
}

export function objectReplay<T extends object>(value: Prisma.JsonValue | null): T | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as unknown as T
    : null;
}

function jsonObject(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}
