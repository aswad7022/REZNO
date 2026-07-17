import type { Prisma } from "@prisma/client";

import { commerceError } from "@/features/commerce/domain/errors";
import { sanitizeAuditValue } from "@/features/business-operations/domain/validation";
import type { MerchantCommerceContext } from "@/features/commerce/services/authorization";

function json(value: unknown): Prisma.InputJsonValue {
  return sanitizeAuditValue(value) as Prisma.InputJsonValue;
}

export async function resolveMerchantMutationReplay(
  transaction: Prisma.TransactionClient,
  input: {
    actor: MerchantCommerceContext;
    idempotencyKey: string;
    requestHash: string;
  },
) {
  const existing = await transaction.businessOperationMutation.findUnique({
    where: {
      organizationId_idempotencyKey: {
        idempotencyKey: input.idempotencyKey,
        organizationId: input.actor.organizationId,
      },
    },
  });
  if (!existing) return null;
  if (
    existing.actorMembershipId !== input.actor.membershipId ||
    existing.requestHash !== input.requestHash
  ) {
    commerceError(
      "IDEMPOTENCY_CONFLICT",
      "The idempotency key was already used for another Commerce operation.",
    );
  }
  return existing;
}

export async function recordMerchantMutation(
  transaction: Prisma.TransactionClient,
  input: {
    action: string;
    actor: MerchantCommerceContext;
    after?: unknown;
    before?: unknown;
    idempotencyKey: string;
    requestHash: string;
    result: unknown;
    resultVersion: Date;
    targetId: string;
    targetType: string;
  },
) {
  await transaction.businessAuditLog.create({
    data: {
      action: input.action,
      actorMembershipId: input.actor.membershipId,
      actorPersonId: input.actor.personId,
      after: input.after === undefined ? undefined : json(input.after),
      before: input.before === undefined ? undefined : json(input.before),
      organizationId: input.actor.organizationId,
      targetId: input.targetId,
      targetType: input.targetType,
    },
  });
  await transaction.businessOperationMutation.create({
    data: {
      action: input.action,
      actorMembershipId: input.actor.membershipId,
      idempotencyKey: input.idempotencyKey,
      organizationId: input.actor.organizationId,
      requestHash: input.requestHash,
      result: json(input.result),
      resultVersion: input.resultVersion,
      targetId: input.targetId,
      targetType: input.targetType,
    },
  });
}

export function assertCommerceExpectedVersion(actual: Date, expected: string) {
  if (actual.toISOString() !== expected) {
    commerceError("STALE_VERSION", "The Commerce record changed. Refresh and retry.");
  }
}

export function mutationReplayTarget(existing: { targetId: string | null }, targetId?: string) {
  if (!existing.targetId || (targetId && existing.targetId !== targetId)) {
    commerceError("IDEMPOTENCY_CONFLICT", "The replay target no longer matches this operation.");
  }
  return existing.targetId;
}
