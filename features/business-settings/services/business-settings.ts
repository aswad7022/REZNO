import "server-only";

import { canManageOrganization } from "@/features/business/policies/access";
import { requireBusinessIdentity } from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";
import type { BusinessSettingsDetails } from "@/features/business-settings/types";

export async function getCurrentBusinessSettings(): Promise<BusinessSettingsDetails> {
  const { membership } = await requireBusinessIdentity();
  const [settings, organization] = await Promise.all([
    prisma.organizationSettings.findUnique({
      where: { organizationId: membership.organizationId },
    }),
    prisma.organization.findUnique({
      where: { id: membership.organizationId },
      select: { vertical: true },
    }),
  ]);

  return {
    vertical: organization?.vertical ?? "OTHER",
    bookingEnabled: settings?.bookingEnabled ?? true,
    marketplaceVisible: settings?.marketplaceVisible ?? true,
    staffSelectionMode: settings?.staffSelectionMode ?? "OPTIONAL",
    cancellationWindowHours: settings?.cancellationWindowHours ?? 24,
    canEdit: canManageOrganization(membership.role.systemRole),
  };
}
