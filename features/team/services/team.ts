import "server-only";

import { canManageOrganization } from "@/features/business/policies/access";
import { requireBusinessIdentity } from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";
import type { TeamManagementData } from "@/features/team/types";

export async function getCurrentOrganizationTeam(): Promise<TeamManagementData> {
  const { membership } = await requireBusinessIdentity();
  const organizationId = membership.organizationId;
  const [members, invitations, branches] = await Promise.all([
    prisma.organizationMember.findMany({
      where: {
        organizationId,
        ...(membership.role.systemRole === "STAFF"
          ? { id: membership.id }
          : {}),
      },
      include: {
        person: true,
        role: true,
        assignments: {
          include: { branch: true },
          orderBy: { branch: { name: "asc" } },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.organizationInvitation.findMany({
      where: {
        organizationId,
        status: "PENDING",
      },
      include: {
        role: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.branch.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const users = await prisma.user.findMany({
    where: {
      id: {
        in: members.map((member) => member.person.authUserId),
      },
    },
    select: { id: true, email: true },
  });
  const emailByUserId = new Map(users.map((user) => [user.id, user.email]));

  return {
    canEdit: canManageOrganization(membership.role.systemRole),
    branches,
    members: members.map((member) => ({
      id: member.id,
      name:
        member.person.displayName ||
        [member.person.firstName, member.person.lastName]
          .filter(Boolean)
          .join(" "),
      email: emailByUserId.get(member.person.authUserId) ?? "",
      avatarUrl: member.person.avatarUrl,
      roleName: member.role.name,
      systemRole: member.role.systemRole,
      branchIds: member.assignments.map((assignment) => assignment.branchId),
      branchNames: member.assignments.map(
        (assignment) => assignment.branch.name,
      ),
      joinedAt: member.createdAt,
      photoUrl: member.photoUrl ?? "",
      bio: member.bio ?? "",
      specialties: member.specialties,
    })),
    invitations: invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      roleName: invitation.role?.name ?? "",
      systemRole: invitation.role?.systemRole ?? null,
      status: invitation.status,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
    })),
  };
}
