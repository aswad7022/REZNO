import "server-only";

import { resolveBusinessOperationActor, type BusinessOperationActorReference } from "@/features/business-operations/services/context";
import { prisma } from "@/lib/db/prisma";

export async function readBusinessAudit(reference: BusinessOperationActorReference) {
  const actor = await resolveBusinessOperationActor(reference, "AUDIT_READ");
  const records = await prisma.businessAuditLog.findMany({
    where: { organizationId: actor.organizationId },
    select: {
      action: true,
      actorMembershipId: true,
      createdAt: true,
      id: true,
      targetId: true,
      targetType: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
  });
  return {
    organizationId: actor.organizationId,
    organizationName: actor.organizationName,
    records: records.map((record) => ({ ...record, createdAt: record.createdAt.toISOString() })),
  };
}
