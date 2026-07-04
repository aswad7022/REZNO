"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { canManageOrganization } from "@/features/business/policies/access";
import { requireBusinessIdentity } from "@/features/identity/server";
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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

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
    publicSlug: "",
    isPublicProfessional: false,
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
        publicSlug: errors.publicSlug?.[0],
        isPublicProfessional: errors.isPublicProfessional?.[0],
      },
    };
  }

  const { email, systemRole } = parsed.data;
  const normalizedEmail = normalizeEmail(email);
  const organizationId = context.identity.membership.organizationId;

  if (normalizedEmail === normalizeEmail(context.identity.session.user.email)) {
    return { status: "error", message: context.tMessages("selfInvite") };
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  const recipientPerson = user
    ? await prisma.person.findUnique({
        where: { authUserId: user.id },
        select: { id: true, deletedAt: true, status: true },
      })
    : null;

  const [existingMember, existingPendingInvitation] = await Promise.all([
    recipientPerson
      ? prisma.organizationMember.findUnique({
          where: {
            personId_organizationId: {
              personId: recipientPerson.id,
              organizationId,
            },
          },
          select: { id: true },
        })
      : Promise.resolve(null),
    prisma.organizationInvitation.findFirst({
      where: {
        organizationId,
        normalizedEmail,
        status: "PENDING",
      },
      select: { id: true },
    }),
  ]);

  if (
    recipientPerson &&
    (recipientPerson.deletedAt || recipientPerson.status !== "ACTIVE")
  ) {
    return { status: "error", message: context.tMessages("recipientInactive") };
  }

  if (existingMember) {
    return { status: "error", message: context.tMessages("alreadyMember") };
  }

  if (existingPendingInvitation) {
    return { status: "error", message: context.tMessages("alreadyInvited") };
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

      await transaction.organizationInvitation.create({
        data: {
          organizationId,
          email,
          normalizedEmail,
          roleId: role.id,
          invitedByPersonId: context.identity.person.id,
          recipientPersonId: recipientPerson?.id,
        },
      });

      if (recipientPerson) {
        await transaction.notification.create({
          data: {
            title: context.tMessages("workInviteNotificationTitle"),
            body: context.tMessages("workInviteNotificationBody", {
              business: context.identity.membership.organization.name,
            }),
            audience: "USER",
            priority: "IMPORTANT",
            recipientPersonId: recipientPerson.id,
            businessId: organizationId,
            createdByUserId: context.identity.session.user.id,
          },
        });
      }
    });
  } catch (error) {
    logServerError("team.inviteMember", error, { organizationId });
    return { status: "error", message: context.tMessages("failure") };
  }

  revalidatePath("/business/team");
  return { status: "success", message: context.tMessages("invited") };
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
    publicSlug: formData.get("publicSlug") ?? "",
    isPublicProfessional: formData.get("isPublicProfessional") ?? false,
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
        publicSlug: errors.publicSlug?.[0],
        isPublicProfessional: errors.isPublicProfessional?.[0],
      },
    };
  }

  const {
    systemRole,
    branchIds,
    photoUrl,
    bio,
    specialties,
    publicSlug,
    isPublicProfessional,
  } = parsed.data;
  const organizationId = context.identity.membership.organizationId;
  const [member, validBranches] = await Promise.all([
    prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
      include: {
        role: true,
        person: { select: { deletedAt: true, status: true } },
        organization: { select: { slug: true } },
      },
    }),
    branchesBelongToOrganization(branchIds, organizationId),
  ]);

  if (!member) {
    return { status: "error", message: context.tMessages("notFound") };
  }

  if (member.role.systemRole === "OWNER") {
    return { status: "error", message: context.tMessages("ownerProtected") };
  }

  if (
    isPublicProfessional &&
    (member.person.deletedAt || member.person.status !== "ACTIVE")
  ) {
    return { status: "error", message: context.tMessages("recipientInactive") };
  }

  if (isPublicProfessional && !publicSlug) {
    return {
      status: "error",
      message: context.tMessages("invalid"),
      fieldErrors: { publicSlug: context.tMessages("publicSlugRequired") },
    };
  }

  if (!validBranches) {
    return { status: "error", message: context.tMessages("invalidBranches") };
  }

  const normalizedPublicSlug = isPublicProfessional ? publicSlug : null;
  if (normalizedPublicSlug) {
    const slugOwner = await prisma.organizationMember.findFirst({
      where: {
        organizationId,
        publicSlug: normalizedPublicSlug,
        id: { not: member.id },
      },
      select: { id: true },
    });

    if (slugOwner) {
      return {
        status: "error",
        message: context.tMessages("invalid"),
        fieldErrors: { publicSlug: context.tMessages("publicSlugTaken") },
      };
    }
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
        data: {
          roleId: role.id,
          photoUrl,
          bio,
          specialties,
          publicSlug: normalizedPublicSlug,
          isPublicProfessional,
        },
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
  revalidatePath(`/${member.organization.slug}`);
  if (member.publicSlug) {
    revalidatePath(`/${member.organization.slug}/staff/${member.publicSlug}`);
  }
  if (normalizedPublicSlug) {
    revalidatePath(`/${member.organization.slug}/staff/${normalizedPublicSlug}`);
  }
  return { status: "success", message: context.tMessages("updated") };
}
