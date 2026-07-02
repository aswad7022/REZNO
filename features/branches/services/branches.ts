import "server-only";

import { canManageOrganization } from "@/features/business/policies/access";
import { requireBusinessIdentity } from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";
import type { BranchDetails } from "@/features/branches/types";

export async function getCurrentOrganizationBranches(): Promise<{
  branches: BranchDetails[];
  canEdit: boolean;
}> {
  const { membership } = await requireBusinessIdentity();
  const branches = await prisma.branch.findMany({
    where: {
      organizationId: membership.organizationId,
      deletedAt: null,
    },
    include: {
      businessHours: {
        where: { isOpen: true },
        select: { dayOfWeek: true },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  return {
    canEdit: canManageOrganization(membership.role.systemRole),
    branches: branches.map((branch) => {
      const today = new Date().getDay();
      const nextWorkingDay =
        branch.businessHours
          .map((hours) => hours.dayOfWeek)
          .sort(
            (left, right) =>
              ((left - today + 7) % 7) - ((right - today + 7) % 7),
          )[0] ?? null;

      return {
      id: branch.id,
      name: branch.name,
      slug: branch.slug,
      phone: branch.phone ?? "",
      email: branch.email ?? "",
      timezone: branch.timezone,
      addressLine1: branch.addressLine1 ?? "",
      addressLine2: branch.addressLine2 ?? "",
      city: branch.city ?? "",
      country: branch.country ?? "",
      latitude: branch.latitude?.toString() ?? "",
      longitude: branch.longitude?.toString() ?? "",
      locationLabel: branch.locationLabel ?? "",
      nearbyLandmark: branch.nearbyLandmark ?? "",
      locationInstructions: branch.locationInstructions ?? "",
      status: branch.status,
      hasWorkingHours: branch.businessHours.length > 0,
      nextWorkingDay,
      };
    }),
  };
}
