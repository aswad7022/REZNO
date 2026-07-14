import type { Prisma } from "@prisma/client";

import { OWNER_DEFAULT_COMMERCE_PERMISSIONS } from "@/features/identity/policies/authorization";
import { prisma } from "@/lib/db/prisma";

const eligibleOwnerRoleWhere = {
  systemRole: "OWNER",
  commercePermissions: { isEmpty: true },
  organization: {
    deletedAt: null,
    isActive: true,
    status: "ACTIVE",
  },
  organizationMembers: {
    some: {
      deletedAt: null,
      status: "ACTIVE",
      person: { deletedAt: null, status: "ACTIVE" },
    },
  },
} as const satisfies Prisma.RoleWhereInput;

export type OwnerCommerceBackfillCandidate = {
  organizationId: string;
  organizationName: string;
  roleId: string;
};

export async function listOwnerCommerceBackfillCandidates(): Promise<
  OwnerCommerceBackfillCandidate[]
> {
  const roles = await prisma.role.findMany({
    where: eligibleOwnerRoleWhere,
    select: {
      id: true,
      organizationId: true,
      organization: { select: { name: true } },
      organizationMembers: {
        where: {
          deletedAt: null,
          status: "ACTIVE",
          person: { deletedAt: null, status: "ACTIVE" },
        },
        select: { organizationId: true },
      },
    },
    orderBy: [{ organizationId: "asc" }, { id: "asc" }],
  });

  return roles
    .filter((role) =>
      role.organizationMembers.some(
        (membership) => membership.organizationId === role.organizationId,
      ),
    )
    .map((role) => ({
      organizationId: role.organizationId,
      organizationName: role.organization.name,
      roleId: role.id,
    }));
}

export async function applyOwnerCommerceBackfill(expectedRoleIds: string[]) {
  const uniqueExpectedRoleIds = [...new Set(expectedRoleIds)].sort();
  const current = await listOwnerCommerceBackfillCandidates();
  const currentRoleIds = current.map((candidate) => candidate.roleId).sort();

  if (
    currentRoleIds.length !== uniqueExpectedRoleIds.length ||
    currentRoleIds.some((roleId, index) => roleId !== uniqueExpectedRoleIds[index])
  ) {
    throw new Error(
      "Owner Commerce backfill candidates changed after review; run dry-run again.",
    );
  }

  if (currentRoleIds.length === 0) return { updatedCount: 0 };

  return prisma.$transaction(
    async (transaction) => {
      let updatedCount = 0;
      for (const roleId of currentRoleIds) {
        const eligibleRole = await transaction.role.findFirst({
          where: { ...eligibleOwnerRoleWhere, id: roleId },
          select: {
            organizationId: true,
            organizationMembers: {
              where: {
                deletedAt: null,
                status: "ACTIVE",
                person: { deletedAt: null, status: "ACTIVE" },
              },
              select: { organizationId: true },
            },
          },
        });
        if (
          !eligibleRole?.organizationMembers.some(
            (membership) =>
              membership.organizationId === eligibleRole.organizationId,
          )
        ) {
          throw new Error(
            "Owner Commerce backfill eligibility changed during the transaction.",
          );
        }

        const result = await transaction.role.updateMany({
          where: { ...eligibleOwnerRoleWhere, id: roleId },
          data: {
            commercePermissions: [...OWNER_DEFAULT_COMMERCE_PERMISSIONS],
          },
        });
        updatedCount += result.count;
      }

      if (updatedCount !== currentRoleIds.length) {
        throw new Error(
          "Owner Commerce backfill eligibility changed during the transaction.",
        );
      }

      return { updatedCount };
    },
    { isolationLevel: "Serializable" },
  );
}
