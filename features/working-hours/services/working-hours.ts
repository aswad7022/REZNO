import "server-only";

import { notFound } from "next/navigation";

import { canManageOrganization } from "@/features/business/policies/access";
import { requireBusinessIdentity } from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";
import type { BranchWorkingHours } from "@/features/working-hours/types";

const defaultDays = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  isOpen: false,
  openTime: "09:00",
  closeTime: "17:00",
}));

export async function getBranchWorkingHours(
  branchId: string,
): Promise<BranchWorkingHours> {
  const { membership } = await requireBusinessIdentity();
  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      organizationId: membership.organizationId,
      deletedAt: null,
    },
    include: {
      businessHours: {
        orderBy: { dayOfWeek: "asc" },
      },
    },
  });

  if (!branch) {
    notFound();
  }

  const hoursByDay = new Map(
    branch.businessHours.map((hours) => [hours.dayOfWeek, hours]),
  );

  return {
    branchId: branch.id,
    branchName: branch.name,
    canEdit: canManageOrganization(membership.role.systemRole),
    days: defaultDays.map((fallback) => {
      const saved = hoursByDay.get(fallback.dayOfWeek);
      return saved
        ? {
            dayOfWeek: saved.dayOfWeek,
            isOpen: saved.isOpen,
            openTime: saved.openTime,
            closeTime: saved.closeTime,
          }
        : fallback;
    }),
  };
}
