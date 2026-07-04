import "server-only";

import type { SystemRole } from "@prisma/client";

import { requireCustomerIdentity } from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface WorkInvitationListItem {
  id: string;
  businessName: string;
  systemRole: SystemRole | null;
  createdAt: Date;
  expiresAt: Date | null;
}

export async function getCurrentUserWorkInvitations(): Promise<
  WorkInvitationListItem[]
> {
  const { person, session } = await requireCustomerIdentity();
  const normalizedEmail = normalizeEmail(session.user.email);

  const invitations = await prisma.organizationInvitation.findMany({
    where: {
      status: "PENDING",
      OR: [{ recipientPersonId: person.id }, { normalizedEmail }],
      organization: {
        deletedAt: null,
        status: "ACTIVE",
        isActive: true,
      },
    },
    include: {
      organization: { select: { name: true } },
      role: { select: { systemRole: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return invitations.map((invitation) => ({
    id: invitation.id,
    businessName: invitation.organization.name,
    systemRole: invitation.role?.systemRole ?? null,
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
  }));
}
