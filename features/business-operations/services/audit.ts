import "server-only";

import type { Prisma } from "@prisma/client";

import { sanitizeAuditValue } from "@/features/business-operations/domain/validation";
import type { BusinessOperationActor } from "@/features/business-operations/services/context";

function json(value: unknown): Prisma.InputJsonValue {
  return sanitizeAuditValue(value) as Prisma.InputJsonValue;
}

export async function recordBusinessOperation(
  transaction: Prisma.TransactionClient,
  input: {
    action: string;
    actor: BusinessOperationActor;
    after?: unknown;
    before?: unknown;
    idempotencyKey: string;
    requestHash: string;
    result?: unknown;
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
      result: input.result === undefined ? undefined : json(input.result),
      resultVersion: input.resultVersion,
      targetId: input.targetId,
      targetType: input.targetType,
    },
  });
}

export async function listBusinessAuditRecords(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  take = 40,
) {
  return transaction.businessAuditLog.findMany({
    where: { organizationId },
    select: {
      action: true,
      createdAt: true,
      id: true,
      targetId: true,
      targetType: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(take, 1), 100),
  });
}
