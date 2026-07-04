"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  ACTIVE_BUSINESS_COOKIE,
  requireCustomerIdentity,
} from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";
import { logServerError } from "@/lib/logging/server";

export interface WorkInvitationActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

const invitationIdSchema = z.string().uuid();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function getInvitationActionContext(invitationId: string) {
  const [identity, t] = await Promise.all([
    requireCustomerIdentity(),
    getTranslations("WorkInvitations.messages"),
  ]);
  const parsedId = invitationIdSchema.safeParse(invitationId);

  if (!parsedId.success) {
    return { identity, t, invitationId: null };
  }

  return { identity, t, invitationId: parsedId.data };
}

export async function acceptWorkInvitation(
  invitationId: string,
  previousState: WorkInvitationActionState,
): Promise<WorkInvitationActionState> {
  void previousState;

  const context = await getInvitationActionContext(invitationId);

  if (!context.invitationId) {
    return { status: "error", message: context.t("notFound") };
  }

  const normalizedEmail = normalizeEmail(context.identity.session.user.email);

  try {
    const acceptedOrganizationId = await prisma.$transaction(
      async (transaction) => {
        const invitation = await transaction.organizationInvitation.findFirst({
          where: {
            id: context.invitationId,
            status: "PENDING",
            OR: [
              { recipientPersonId: context.identity.person.id },
              { normalizedEmail },
            ],
          },
          include: {
            role: true,
            organization: true,
          },
        });

        if (!invitation) {
          throw new Error("INVITATION_NOT_FOUND");
        }

        if (invitation.expiresAt && invitation.expiresAt < new Date()) {
          await transaction.organizationInvitation.update({
            where: { id: invitation.id },
            data: { status: "EXPIRED" },
          });
          throw new Error("INVITATION_EXPIRED");
        }

        const existingMember = await transaction.organizationMember.findUnique({
          where: {
            personId_organizationId: {
              personId: context.identity.person.id,
              organizationId: invitation.organizationId,
            },
          },
          select: { id: true },
        });

        if (!existingMember) {
          if (!invitation.roleId) {
            throw new Error("INVITATION_ROLE_MISSING");
          }

          await transaction.organizationMember.create({
            data: {
              personId: context.identity.person.id,
              organizationId: invitation.organizationId,
              roleId: invitation.roleId,
            },
          });
        }

        await transaction.organizationInvitation.update({
          where: { id: invitation.id },
          data: {
            status: "ACCEPTED",
            recipientPersonId: context.identity.person.id,
            acceptedAt: new Date(),
          },
        });

        return invitation.organizationId;
      },
    );

    (await cookies()).set(ACTIVE_BUSINESS_COOKIE, acceptedOrganizationId, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 180,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INVITATION_NOT_FOUND") {
        return { status: "error", message: context.t("notFound") };
      }

      if (error.message === "INVITATION_EXPIRED") {
        return { status: "error", message: context.t("expired") };
      }

      if (error.message === "INVITATION_ROLE_MISSING") {
        return { status: "error", message: context.t("roleMissing") };
      }
    }

    logServerError("workInvitation.accept", error, {
      invitationId: context.invitationId,
    });
    return { status: "error", message: context.t("failure") };
  }

  revalidatePath("/customer/work-invitations");
  revalidatePath("/business");
  return { status: "success", message: context.t("accepted") };
}

export async function declineWorkInvitation(
  invitationId: string,
  previousState: WorkInvitationActionState,
): Promise<WorkInvitationActionState> {
  void previousState;

  const context = await getInvitationActionContext(invitationId);

  if (!context.invitationId) {
    return { status: "error", message: context.t("notFound") };
  }

  const normalizedEmail = normalizeEmail(context.identity.session.user.email);

  try {
    const invitation = await prisma.organizationInvitation.findFirst({
      where: {
        id: context.invitationId,
        status: "PENDING",
        OR: [
          { recipientPersonId: context.identity.person.id },
          { normalizedEmail },
        ],
      },
      select: { id: true },
    });

    if (!invitation) {
      return { status: "error", message: context.t("notFound") };
    }

    await prisma.organizationInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "DECLINED",
        recipientPersonId: context.identity.person.id,
        declinedAt: new Date(),
      },
    });
  } catch (error) {
    logServerError("workInvitation.decline", error, {
      invitationId: context.invitationId,
    });
    return { status: "error", message: context.t("failure") };
  }

  revalidatePath("/customer/work-invitations");
  return { status: "success", message: context.t("declined") };
}
