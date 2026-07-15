import "server-only";

import { listOperationalWorkforce } from "@/features/business-operations/services/workforce";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import { prisma } from "@/lib/db/prisma";
import type { TeamManagementData } from "@/features/team/types";

export async function getCurrentOrganizationTeam(): Promise<TeamManagementData> {
  const reference = await currentBusinessOperationReference("WORKFORCE_READ");
  const workforce = await listOperationalWorkforce(reference);
  const [branches, services] = workforce.canWrite
    ? await Promise.all([
      prisma.branch.findMany({
        where: { deletedAt: null, organizationId: workforce.organizationId, status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.service.findMany({
        where: { deletedAt: null, organizationId: workforce.organizationId, status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ])
    : [[], []];

  return {
    actorRole: workforce.role,
    branches,
    canEdit: workforce.canWrite,
    organizationId: workforce.organizationId,
    organizationName: workforce.organizationName,
    services,
    invitations: workforce.invitations.map((invitation) => ({
      createdAt: new Date(invitation.createdAt),
      email: invitation.email,
      expiresAt: invitation.expiresAt ? new Date(invitation.expiresAt) : null,
      id: invitation.id,
      roleName: invitation.role ?? "",
      status: invitation.status,
      systemRole: invitation.role,
      version: invitation.version,
    })),
    members: workforce.members.map((member) => ({
      assignments: member.assignments.map((assignment) => ({
        branchId: assignment.branchId,
        id: assignment.id,
        version: assignment.version,
      })),
      avatarUrl: member.avatarUrl,
      bio: member.bio ?? "",
      branchIds: member.assignments.map((assignment) => assignment.branchId),
      branchNames: member.assignments.map((assignment) => assignment.branchName),
      canManage: member.canManage,
      email: member.email ?? "",
      id: member.id,
      isPublicProfessional: member.isPublicProfessional,
      joinedAt: new Date(member.createdAt),
      name: member.name,
      photoUrl: member.photoUrl ?? "",
      publicSlug: member.publicSlug ?? "",
      roleName: member.role ?? "CUSTOM",
      serviceAssignments: member.serviceAssignments,
      specialties: member.specialties,
      status: member.status,
      systemRole: member.role,
      version: member.version,
    })),
  };
}
