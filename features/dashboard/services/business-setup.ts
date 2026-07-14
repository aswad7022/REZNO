import "server-only";

import { getBusinessVerticalCapabilities } from "@/features/businesses/config/verticals";
import { requireBusinessIdentity } from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";

export type BusinessSetupCheckKey =
  | "businessInfo"
  | "coverImage"
  | "logo"
  | "branch"
  | "hours"
  | "service"
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
}

export async function getBusinessSetupStatus(): Promise<BusinessSetupStatus> {
  const { membership } = await requireBusinessIdentity();
  const organization = await prisma.organization.findUnique({
    where: { id: membership.organizationId },
    include: {
      profile: true,
      settings: true,
      branches: {
        where: { deletedAt: null, status: "ACTIVE" },
        include: { businessHours: { where: { isOpen: true } } },
      },
      services: {
        where: { status: "ACTIVE" },
        select: { staffSelectionMode: true },
      },
      restaurantTables: {
        where: { isActive: true },
        select: { id: true },
      },
      menuItems: {
        where: { isAvailable: true },
        select: { id: true },
      },
      menuCategories: {
        where: { isActive: true },
        select: { id: true },
      },
      organizationMembers: {
        where: {
          deletedAt: null,
          status: "ACTIVE",
          role: {
            systemRole: { in: ["STAFF", "MANAGER", "RECEPTIONIST"] },
          },
        },
        select: { id: true },
      },
    },
  });
  if (!organization) {
    return {
      checks: {
        businessInfo: false,
        coverImage: false,
        logo: false,
        branch: false,
        hours: false,
        service: false,
        employee: false,
        table: false,
        menuCategory: false,
        menuItem: false,
        published: false,
      },
      requiredChecks: [
        "businessInfo",
        "coverImage",
        "logo",
        "branch",
        "hours",
        "service",
        "published",
      ],
      status: "notReady",
      score: 0,
      slug: membership.organization.slug,
    };
  }

  const requiresEmployee = organization.services.some(
    (service) => service.staffSelectionMode === "REQUIRED",
  );
  const capabilities = getBusinessVerticalCapabilities(organization.vertical);
  const checks = {
    businessInfo: Boolean(
      organization.name &&
        organization.profile?.description &&
        organization.profile.businessPhone &&
        organization.profile.businessCategory,
    ),
    coverImage: Boolean(organization.profile?.coverImageUrl),
    logo: Boolean(organization.profile?.logoUrl),
    branch: organization.branches.length > 0,
    hours: organization.branches.some(
      (branch) => branch.businessHours.length > 0,
    ),
    service: organization.services.length > 0,
    employee: !requiresEmployee || organization.organizationMembers.length > 0,
    table: organization.restaurantTables.length > 0,
    menuCategory: organization.menuCategories.length > 0,
    menuItem: organization.menuItems.length > 0,
    published: Boolean(organization.settings?.marketplaceVisible),
  } satisfies Record<BusinessSetupCheckKey, boolean>;
  const requiredChecks = capabilities.restaurantExperience
    ? ([
        "businessInfo",
        "coverImage",
        "logo",
        "branch",
        "hours",
        "table",
        "menuCategory",
        "menuItem",
        "published",
      ] satisfies BusinessSetupCheckKey[])
    : ([
        "businessInfo",
        "coverImage",
        "logo",
        "branch",
        "hours",
        "service",
        ...(requiresEmployee ? (["employee"] as const) : []),
        "published",
      ] satisfies BusinessSetupCheckKey[]);
  const completed = requiredChecks.filter((key) => checks[key]).length;
  const score = Math.round((completed / requiredChecks.length) * 100);
  const status: BusinessReadinessState =
    score === 100 ? "ready" : score >= 70 ? "almost" : "notReady";

  return {
    checks,
    requiredChecks,
    status,
    score,
    slug: organization.slug,
  };
}
