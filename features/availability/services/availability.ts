import "server-only";

import { notFound } from "next/navigation";

import { canManageOrganization } from "@/features/business/policies/access";
import { requireBusinessIdentity } from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";
import type { MemberAvailabilityData } from "@/features/availability/types";

const defaultDays = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  isOpen: false,
  openTime: "09:00",
  closeTime: "17:00",
}));

export async function getMemberAvailability(
  memberId: string,
): Promise<MemberAvailabilityData> {
  const { membership: currentMembership } = await requireBusinessIdentity();
  const organizationId = currentMembership.organizationId;
  const member = await prisma.organizationMember.findFirst({
    where: { id: memberId, organizationId },
    include: {
      person: true,
      assignments: {
        include: { branch: true },
        orderBy: { branch: { name: "asc" } },
      },
      availabilities: {
        where: { isActive: true },
        orderBy: [{ branchId: "asc" }, { dayOfWeek: "asc" }],
      },
      blockedTimes: {
        where: { endsAt: { gte: new Date() } },
        include: { branch: true },
        orderBy: { startsAt: "asc" },
      },
    },
  });

  if (!member) {
    notFound();
  }

  return {
    memberId: member.id,
    memberName:
      member.person.displayName ||
      [member.person.firstName, member.person.lastName]
        .filter(Boolean)
        .join(" "),
    canEdit:
      canManageOrganization(currentMembership.role.systemRole) ||
      (currentMembership.role.systemRole === "STAFF" &&
        currentMembership.id === member.id),
    branches: member.assignments.map(({ branch }) => {
      const byDay = new Map(
        member.availabilities
          .filter((availability) => availability.branchId === branch.id)
          .map((availability) => [availability.dayOfWeek, availability]),
      );
      return {
        id: branch.id,
        name: branch.name,
        timezone: branch.timezone,
        days: defaultDays.map((fallback) => {
          const saved = byDay.get(fallback.dayOfWeek);
          return saved
            ? {
                dayOfWeek: saved.dayOfWeek,
                isOpen: true,
                openTime: saved.startTime,
                closeTime: saved.endTime,
              }
            : fallback;
        }),
      };
    }),
    blockedTimes: member.blockedTimes.map((blocked) => ({
      id: blocked.id,
      branchName: blocked.branch.name,
      startsAt: blocked.startsAt,
      endsAt: blocked.endsAt,
      reason: blocked.reason ?? "",
    })),
  };
}
