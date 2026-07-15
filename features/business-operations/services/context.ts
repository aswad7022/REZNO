import "server-only";

import type { Prisma, SystemRole } from "@prisma/client";

import {
  businessOperationsError,
} from "@/features/business-operations/domain/errors";
import {
  canPerformBusinessOperation,
  type BusinessOperationCapability,
} from "@/features/business-operations/domain/policy";
import { prisma } from "@/lib/db/prisma";
import { consumeRateLimit } from "@/lib/security/rate-limit-core";

export interface BusinessOperationActorReference {
  contextOrganizationId: string;
  membershipId: string;
  personId: string;
}

export interface BusinessOperationActor {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  personId: string;
  role: SystemRole;
}

export async function resolveBusinessOperationActor(
  reference: BusinessOperationActorReference,
  capability: BusinessOperationCapability,
): Promise<BusinessOperationActor> {
  const membership = await prisma.organizationMember.findFirst({
    where: {
      id: reference.membershipId,
      personId: reference.personId,
      organizationId: reference.contextOrganizationId,
      deletedAt: null,
      status: "ACTIVE",
      person: { deletedAt: null, status: "ACTIVE" },
      organization: {
        deletedAt: null,
        isActive: true,
        status: "ACTIVE",
      },
      role: { organizationId: reference.contextOrganizationId },
    },
    include: { organization: true, role: true },
  });
  if (!membership?.role.systemRole) {
    businessOperationsError("MEMBERSHIP_UNAVAILABLE", "Business membership is unavailable.");
  }
  if (!canPerformBusinessOperation(membership.role.systemRole, capability)) {
    businessOperationsError("FORBIDDEN", "This role cannot perform the requested operation.");
  }
  return {
    membershipId: membership.id,
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    organizationSlug: membership.organization.slug,
    personId: membership.personId,
    role: membership.role.systemRole,
  };
}

export async function assertBusinessOperationActorCurrent(
  transaction: Prisma.TransactionClient,
  actor: BusinessOperationActor,
  capability: BusinessOperationCapability,
) {
  const membership = await transaction.organizationMember.findFirst({
    where: {
      id: actor.membershipId,
      personId: actor.personId,
      organizationId: actor.organizationId,
      deletedAt: null,
      status: "ACTIVE",
      person: { deletedAt: null, status: "ACTIVE" },
      organization: { deletedAt: null, isActive: true, status: "ACTIVE" },
      role: { organizationId: actor.organizationId },
    },
    select: { role: { select: { systemRole: true } } },
  });
  if (!membership?.role.systemRole || membership.role.systemRole !== actor.role) {
    businessOperationsError("MEMBERSHIP_UNAVAILABLE", "Business membership changed before the operation completed.");
  }
  if (!canPerformBusinessOperation(membership.role.systemRole, capability)) {
    businessOperationsError("FORBIDDEN", "This role cannot perform the requested operation.");
  }
}

export function assertRenderedOrganization(
  actor: BusinessOperationActor,
  renderedOrganizationId: string,
) {
  if (actor.organizationId !== renderedOrganizationId) {
    businessOperationsError(
      "ACTIVE_ORGANIZATION_CHANGED",
      "The active business changed after this form was rendered.",
    );
  }
}

export function assertBusinessOperationMutationRate(
  actor: BusinessOperationActor,
  action: string,
) {
  const result = consumeRateLimit(
    `businessOperations:${action}`,
    `membership:${actor.membershipId}`,
    { limit: 120, windowMs: 60_000 },
  );
  if (!result.success) {
    businessOperationsError(
      "RATE_LIMITED",
      "Too many operational changes were attempted. Retry shortly.",
    );
  }
}
