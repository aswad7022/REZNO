import "server-only";

import { canManageWorkforceRole } from "@/features/business-operations/domain/services-workforce";
import { listOperationalServices } from "@/features/business-operations/services/service-catalog";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import { prisma } from "@/lib/db/prisma";
import type { ServiceCatalogData } from "@/features/services/types";

export async function getCurrentServiceCatalog(): Promise<ServiceCatalogData> {
  const reference = await currentBusinessOperationReference("SERVICE_READ");
  const catalog = await listOperationalServices(reference);
  const { canWrite, organizationId } = catalog;
  const [branches, categories, members] = canWrite ? await Promise.all([
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
      include: {
        assignments: { where: { branch: { deletedAt: null, status: "ACTIVE" } } },
        person: true,
        role: true,
      },
      orderBy: { person: { firstName: "asc" } },
    }),
  ]) : [[], [], []];

  return {
    canEdit: canWrite,
    organizationId,
    organizationName: catalog.organizationName,
    branches: branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      hasWorkingHours: branch.businessHours.length > 0,
    })),
    categories,
    members: members.filter((member) =>
      member.assignments.length > 0 && canManageWorkforceRole(catalog.role, member.role.systemRole)
    ).map((member) => ({
      id: member.id,
      name:
        member.person.displayName ??
        [member.person.firstName, member.person.lastName]
          .filter(Boolean)
          .join(" "),
    })),
    services: catalog.services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description ?? "",
      imageUrl: service.imageUrl ?? "",
      categoryId: service.categoryId,
      categorySlug: service.category.slug,
      status: service.status,
      staffSelectionMode: service.staffSelectionMode,
      assignedMemberIds: service.assignedMemberIds,
      staffAssignments: service.staffAssignments,
      version: service.version,
      offerings: service.offerings.map((offering) => ({
        id: offering.id,
        branchId: offering.branchId,
        branchName: offering.branchName,
        price: offering.price.toString(),
        durationMinutes: offering.durationMinutes,
        pricingType: offering.pricingType,
        isAvailable: offering.isAvailable,
        version: offering.version,
        readinessIssue:
          service.status !== "ACTIVE" || !offering.isAvailable
            ? null
            : offering.branchStatus !== "ACTIVE"
              ? "HOURS"
              : service.staffSelectionMode !== "NONE" && service.assignedMemberIds.length === 0
                ? "STAFF"
                : null,
      })),
    })),
  };
}
