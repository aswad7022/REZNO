import "server-only";

import { canManageOrganization } from "@/features/business/policies/access";
import { requireBusinessIdentity } from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";
import type { ServiceCatalogData } from "@/features/services/types";

export async function getCurrentServiceCatalog(): Promise<ServiceCatalogData> {
  const { membership } = await requireBusinessIdentity();
  const organizationId = membership.organizationId;
  const [services, branches, categories, members] = await Promise.all([
    prisma.service.findMany({
      where: { organizationId },
      include: {
        category: true,
        staffAssignments: true,
        branchServices: {
          include: {
            branch: {
              include: {
                businessHours: true,
                assignments: {
                  include: {
                    member: {
                      include: {
                        availabilities: {
                          where: { isActive: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { branch: { name: "asc" } },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.branch.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        businessHours: {
          where: { isOpen: true },
          select: { id: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      select: { id: true, slug: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.organizationMember.findMany({
      where: { organizationId, deletedAt: null, status: "ACTIVE" },
      include: { person: true },
      orderBy: { person: { firstName: "asc" } },
    }),
  ]);

  return {
    canEdit: canManageOrganization(membership.role.systemRole),
    branches: branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      hasWorkingHours: branch.businessHours.length > 0,
    })),
    categories,
    members: members.map((member) => ({
      id: member.id,
      name:
        member.person.displayName ??
        [member.person.firstName, member.person.lastName]
          .filter(Boolean)
          .join(" "),
    })),
    services: services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description ?? "",
      imageUrl: service.imageUrl ?? "",
      categoryId: service.categoryId,
      categorySlug: service.category.slug,
      status: service.status,
      staffSelectionMode: service.staffSelectionMode,
      assignedMemberIds: service.staffAssignments.map(
        (assignment) => assignment.memberId,
      ),
      offerings: service.branchServices.map((offering) => ({
        branchId: offering.branchId,
        branchName: offering.branch.name,
        price: offering.price.toString(),
        durationMinutes: offering.durationMinutes,
        pricingType: offering.pricingType,
        isAvailable: offering.isAvailable,
        readinessIssue:
          service.status !== "ACTIVE" || !offering.isAvailable
            ? null
            : !offering.branch.businessHours.some((hours) => hours.isOpen)
              ? "HOURS"
              : service.staffSelectionMode === "REQUIRED" &&
                  !offering.branch.assignments.some((assignment) =>
                    assignment.member.availabilities.some(
                      (availability) =>
                        availability.branchId === offering.branchId,
                    ),
                  )
                ? "STAFF"
                : null,
      })),
    })),
  };
}
