import "server-only";

import { getBusinessVerticalCapabilities } from "@/features/businesses/config/verticals";
import { branchHoursAreComplete } from "@/features/business-operations/domain/closure";
import type { BusinessOperationActorReference } from "@/features/business-operations/services/context";
import { resolveBusinessOperationActor } from "@/features/business-operations/services/context";
import { prisma } from "@/lib/db/prisma";

export type BusinessSetupCheckKey =
  | "organization"
  | "businessInfo"
  | "coverImage"
  | "logo"
  | "branch"
  | "hours"
  | "bookingEnabled"
  | "service"
  | "offering"
  | "employee"
  | "table"
  | "menuCategory"
  | "menuItem"
  | "published";

export type BusinessReadinessState = "ready" | "almost" | "notReady";

export interface BusinessSetupStatus {
  checks: Record<BusinessSetupCheckKey, boolean>;
  requiredChecks: BusinessSetupCheckKey[];
  status: BusinessReadinessState;
  score: number;
  slug: string;
  restaurant: boolean;
}

export async function getBusinessReadiness(
  reference: BusinessOperationActorReference,
): Promise<BusinessSetupStatus> {
  const actor = await resolveBusinessOperationActor(
    reference,
    "BUSINESS_READINESS_READ",
  );
  const organization = await prisma.organization.findUnique({
    where: { id: actor.organizationId },
    include: {
      profile: true,
      settings: true,
      branches: {
        where: { deletedAt: null, status: "ACTIVE" },
        include: { businessHours: { orderBy: { dayOfWeek: "asc" } } },
      },
      services: {
        where: { deletedAt: null, status: "ACTIVE" },
        include: {
          branchServices: {
            where: {
              isAvailable: true,
              branch: {
                deletedAt: null,
                organizationId: actor.organizationId,
                status: "ACTIVE",
              },
            },
            select: { branchId: true },
          },
          staffAssignments: {
            where: {
              member: {
                deletedAt: null,
                organizationId: actor.organizationId,
                person: { deletedAt: null, status: "ACTIVE" },
                status: "ACTIVE",
              },
            },
            select: {
              member: {
                select: {
                  assignments: { select: { branchId: true } },
                  availabilities: {
                    where: { isActive: true },
                    select: { branchId: true },
                  },
                },
              },
            },
          },
        },
      },
      restaurantTables: {
        where: {
          isActive: true,
          branch: {
            deletedAt: null,
            organizationId: actor.organizationId,
            status: "ACTIVE",
          },
        },
        select: { id: true },
      },
      menuCategories: {
        where: { isActive: true },
        select: {
          id: true,
          items: { where: { isAvailable: true }, select: { id: true } },
        },
      },
    },
  });

  const restaurant = Boolean(
    organization &&
      getBusinessVerticalCapabilities(organization.vertical).restaurantExperience,
  );
  const activeOfferings =
    organization?.services.flatMap((service) => service.branchServices) ?? [];
  const requiredServices =
    organization?.services.filter(
      (service) => service.staffSelectionMode === "REQUIRED",
    ) ?? [];
  const requiredWorkforceReady = requiredServices.every(
    (service) =>
      service.branchServices.length > 0 &&
      service.branchServices.every((offering) =>
        service.staffAssignments.some((assignment) => {
          const assignedBranches = new Set(
            assignment.member.assignments.map((item) => item.branchId),
          );
          const scheduledBranches = new Set(
            assignment.member.availabilities.map((item) => item.branchId),
          );
          return (
            assignedBranches.has(offering.branchId) &&
            scheduledBranches.has(offering.branchId)
          );
        }),
      ),
  );
  const checks = {
    organization: Boolean(
      organization &&
        organization.deletedAt === null &&
        organization.isActive &&
        organization.status === "ACTIVE",
    ),
    businessInfo: Boolean(
      organization?.name.trim() &&
        organization.profile?.description?.trim() &&
        organization.profile.businessPhone?.trim() &&
        organization.profile.businessCategory?.trim(),
    ),
    coverImage: Boolean(organization?.profile?.coverImageUrl),
    logo: Boolean(organization?.profile?.logoUrl),
    branch: Boolean(organization?.branches.length),
    hours: Boolean(
      organization?.branches.length &&
        organization.branches.every((branch) =>
          branchHoursAreComplete(branch.businessHours),
        ),
    ),
    bookingEnabled: Boolean(organization?.settings?.bookingEnabled),
    service: Boolean(organization?.services.length),
    offering: activeOfferings.length > 0,
    employee: requiredWorkforceReady,
    table: Boolean(organization?.restaurantTables.length),
    menuCategory: Boolean(organization?.menuCategories.length),
    menuItem: Boolean(
      organization?.menuCategories.some((category) => category.items.length > 0),
    ),
    published: Boolean(organization?.settings?.marketplaceVisible),
  } satisfies Record<BusinessSetupCheckKey, boolean>;
  const requiredChecks: BusinessSetupCheckKey[] = restaurant
    ? [
        "organization",
        "businessInfo",
        "coverImage",
        "logo",
        "branch",
        "hours",
        "bookingEnabled",
        "table",
        "menuCategory",
        "menuItem",
        "published",
      ]
    : [
        "organization",
        "businessInfo",
        "coverImage",
        "logo",
        "branch",
        "hours",
        "bookingEnabled",
        "service",
        "offering",
        ...(requiredServices.length ? (["employee"] as const) : []),
        "published",
      ];
  const completed = requiredChecks.filter((key) => checks[key]).length;
  const score = requiredChecks.length
    ? Math.round((completed / requiredChecks.length) * 100)
    : 0;
  const status: BusinessReadinessState =
    score === 100 ? "ready" : score >= 70 ? "almost" : "notReady";

  return {
    checks,
    requiredChecks,
    status,
    score,
    slug: organization?.slug ?? actor.organizationSlug,
    restaurant,
  };
}
