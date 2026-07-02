"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { canManageOrganization } from "@/features/business/policies/access";
import { requireBusinessIdentity } from "@/features/identity/server";
import { provisionPerson } from "@/features/identity/services/provision-person";
import {
  createTeamMemberSchema,
  createTeamMemberUpdateSchema,
} from "@/features/team/schemas/team-member";
import type {
  AssignableSystemRole,
  TeamMemberActionState,
} from "@/features/team/types";
import { prisma } from "@/lib/db/prisma";
import { logServerError } from "@/lib/logging/server";

const roleNames: Record<AssignableSystemRole, string> = {
  MANAGER: "Manager",
  RECEPTIONIST: "Receptionist",
  STAFF: "Staff",
};

async function getTeamActionContext() {
  const [identity, tMessages, tValidation] = await Promise.all([
    requireBusinessIdentity(),
    getTranslations("Team.messages"),
    getTranslations("Validation"),
  ]);

  return {
    identity,
    canEdit: canManageOrganization(identity.membership.role.systemRole),
    tMessages,
    tValidation,
  };
}

async function branchesBelongToOrganization(
  branchIds: string[],
  organizationId: string,
): Promise<boolean> {
  if (branchIds.length === 0) {
    return true;
  }

  const count = await prisma.branch.count({
    where: {
      id: { in: branchIds },
      organizationId,
      deletedAt: null,
      status: "ACTIVE",
    },
  });

  return count === branchIds.length;
}

export async function addTeamMember(
  _previousState: TeamMemberActionState,
  formData: FormData,
): Promise<TeamMemberActionState> {
  const context = await getTeamActionContext();

  if (!context.canEdit) {
    return { status: "error", message: context.tMessages("forbidden") };
  }

  const schema = createTeamMemberSchema((key) => context.tValidation(key));
  const parsed = schema.safeParse({
    email: formData.get("email"),
    systemRole: formData.get("systemRole"),
    branchIds: formData.getAll("branchIds"),
    photoUrl: formData.get("photoUrl") ?? "",
    bio: formData.get("bio") ?? "",
    specialties: formData.get("specialties") ?? "",
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      status: "error",
      message: context.tMessages("invalid"),
      fieldErrors: {
        email: errors.email?.[0],
        systemRole: errors.systemRole?.[0],
        branchIds: errors.branchIds?.[0],
        photoUrl: errors.photoUrl?.[0],
        bio: errors.bio?.[0],
        specialties: errors.specialties?.[0],
      },
    };
  }

  const { email, systemRole, branchIds, photoUrl, bio, specialties } = parsed.data;
  const organizationId = context.identity.membership.organizationId;
  const [user, validBranches] = await Promise.all([
    prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    }),
    branchesBelongToOrganization(branchIds, organizationId),
  ]);

  if (!user) {
    return { status: "error", message: context.tMessages("userNotFound") };
  }

  if (!validBranches) {
    return { status: "error", message: context.tMessages("invalidBranches") };
  }

  const person = await provisionPerson({
    authUserId: user.id,
    name: user.name,
    image: user.image,
  });

  try {
    await prisma.$transaction(async (transaction) => {
      const existing = await transaction.organizationMember.findUnique({
        where: {
          personId_organizationId: {
            personId: person.id,
            organizationId,
          },
        },
        select: { id: true },
      });

      if (existing) {
        throw new Error("MEMBER_EXISTS");
      }

      const roleName = roleNames[systemRole];
      const role = await transaction.role.upsert({
        where: {
          organizationId_name: { organizationId, name: roleName },
        },
        create: {
          organizationId,
          name: roleName,
          systemRole,
          isSystem: true,
        },
        update: {
          systemRole,
          isSystem: true,
        },
      });

      await transaction.organizationMember.create({
        data: {
          personId: person.id,
          organizationId,
          roleId: role.id,
          photoUrl,
          bio,
          specialties,
          assignments: {
            create: branchIds.map((branchId) => ({ branchId })),
          },
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "MEMBER_EXISTS") {
      return { status: "error", message: context.tMessages("alreadyMember") };
    }

    logServerError("team.addMember", error, { organizationId });
    return { status: "error", message: context.tMessages("failure") };
  }

  revalidatePath("/business/team");
  return { status: "success", message: context.tMessages("added") };
}

export async function updateTeamMember(
  memberId: string,
  _previousState: TeamMemberActionState,
  formData: FormData,
): Promise<TeamMemberActionState> {
  const context = await getTeamActionContext();

  if (!context.canEdit) {
    return { status: "error", message: context.tMessages("forbidden") };
  }

  const schema = createTeamMemberUpdateSchema((key) =>
    context.tValidation(key),
  );
  const parsed = schema.safeParse({
    systemRole: formData.get("systemRole"),
    branchIds: formData.getAll("branchIds"),
    photoUrl: formData.get("photoUrl") ?? "",
    bio: formData.get("bio") ?? "",
    specialties: formData.get("specialties") ?? "",
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      status: "error",
      message: context.tMessages("invalid"),
      fieldErrors: {
        systemRole: errors.systemRole?.[0],
        branchIds: errors.branchIds?.[0],
        photoUrl: errors.photoUrl?.[0],
        bio: errors.bio?.[0],
        specialties: errors.specialties?.[0],
      },
    };
  }

  const { systemRole, branchIds, photoUrl, bio, specialties } = parsed.data;
  const organizationId = context.identity.membership.organizationId;
  const [member, validBranches] = await Promise.all([
    prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
      include: { role: true },
    }),
    branchesBelongToOrganization(branchIds, organizationId),
  ]);

  if (!member) {
    return { status: "error", message: context.tMessages("notFound") };
  }

  if (member.role.systemRole === "OWNER") {
    return { status: "error", message: context.tMessages("ownerProtected") };
  }

  if (!validBranches) {
    return { status: "error", message: context.tMessages("invalidBranches") };
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const roleName = roleNames[systemRole];
      const role = await transaction.role.upsert({
        where: {
          organizationId_name: { organizationId, name: roleName },
        },
        create: {
          organizationId,
          name: roleName,
          systemRole,
          isSystem: true,
        },
        update: {
          systemRole,
          isSystem: true,
        },
      });

      await transaction.organizationMember.update({
        where: { id: member.id },
        data: { roleId: role.id, photoUrl, bio, specialties },
      });
      await transaction.branchAssignment.deleteMany({
        where: { memberId: member.id },
      });
      if (branchIds.length > 0) {
        await transaction.branchAssignment.createMany({
          data: branchIds.map((branchId) => ({
            memberId: member.id,
            branchId,
          })),
        });
      }
    });
  } catch (error) {
    logServerError("team.updateMember", error, {
      memberId: member.id,
      organizationId,
    });
    return { status: "error", message: context.tMessages("failure") };
  }

  revalidatePath("/business/team");
  return { status: "success", message: context.tMessages("updated") };
}
