import "server-only";

import { bookingDomainError } from "@/features/bookings/domain/errors";
import {
  activeServiceStaffAssignmentMemberIds,
  activeServiceStaffAssignmentWhere,
  serviceStaffAssignmentPolicySelect,
  serviceStaffPolicyAllowsMember,
} from "@/features/bookings/domain/staff-assignment-policy";
import type {
  PublicBookingBranch,
  PublicBookingBusiness,
  PublicBookingService,
  PublicBookingStaffMember,
} from "@/features/bookings/types";
import { prisma } from "@/lib/db/prisma";

const publicOrganizationWhere = {
  deletedAt: null,
  isActive: true,
  status: "ACTIVE" as const,
  settings: {
    bookingEnabled: true,
    marketplaceVisible: true,
  },
};

const activeBranchWhere = {
  deletedAt: null,
  status: "ACTIVE" as const,
};

export async function getPublicBookingBusiness(
  slug: string,
): Promise<PublicBookingBusiness> {
  const organization = await prisma.organization.findFirst({
    where: { slug, ...publicOrganizationWhere },
    include: { profile: true },
  });
  if (!organization) {
    bookingDomainError("NOT_FOUND", "Business was not found.");
  }

  const restaurantFlow =
    organization.vertical === "RESTAURANT" || organization.vertical === "CAFE";
  return {
    id: organization.id,
    slug: organization.slug,
    name: organization.name,
    description: organization.profile?.description ?? null,
    logoUrl: organization.profile?.logoUrl ?? null,
    coverImageUrl: organization.profile?.coverImageUrl ?? null,
    categoryName: organization.profile?.businessCategory ?? null,
    vertical: organization.vertical,
    supportsServiceBooking: !restaurantFlow,
  };
}

export async function getPublicBookingServices(
  businessSlug: string,
): Promise<PublicBookingService[]> {
  const business = await getPublicBookingBusiness(businessSlug);
  if (!business.supportsServiceBooking) {
    bookingDomainError(
      "RESTAURANT_FLOW_REQUIRED",
      "Restaurant reservations use a separate booking flow.",
    );
  }

  const services = await prisma.service.findMany({
    where: {
      organizationId: business.id,
      status: "ACTIVE",
      branchServices: {
        some: {
          isAvailable: true,
          branch: activeBranchWhere,
        },
      },
    },
    include: {
      category: true,
      branchServices: {
        where: { isAvailable: true, branch: activeBranchWhere },
        include: { branch: { select: { organizationId: true } } },
        orderBy: [{ price: "asc" }, { durationMinutes: "asc" }],
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  return services.flatMap((service) => {
    const offerings = service.branchServices.filter(
      (offering) => offering.branch.organizationId === business.id,
    );
    if (offerings.length === 0) return [];
    return [{
      id: service.id,
      name: service.name,
      description: service.description,
      imageUrl: service.imageUrl,
      categoryName: service.category.name,
      staffSelectionMode: service.staffSelectionMode,
      branchCount: offerings.length,
      startingPrice: offerings[0]!.price.toString(),
      durationMinutes: offerings[0]!.durationMinutes,
    }];
  });
}

export async function getPublicServiceBranches(
  businessSlug: string,
  serviceId: string,
): Promise<PublicBookingBranch[]> {
  const business = await getPublicBookingBusiness(businessSlug);
  if (!business.supportsServiceBooking) {
    bookingDomainError(
      "RESTAURANT_FLOW_REQUIRED",
      "Restaurant reservations use a separate booking flow.",
    );
  }

  const offerings = await prisma.branchService.findMany({
    where: {
      isAvailable: true,
      service: {
        id: serviceId,
        organizationId: business.id,
        status: "ACTIVE",
      },
      branch: {
        ...activeBranchWhere,
        organizationId: business.id,
      },
    },
    include: { branch: true, service: true },
    orderBy: [{ branch: { name: "asc" } }, { id: "asc" }],
  });

  return offerings.map((offering) => ({
    branchServiceId: offering.id,
    branchId: offering.branchId,
    name: offering.branch.name,
    city: offering.branch.city,
    address:
      [offering.branch.addressLine1, offering.branch.addressLine2]
        .filter(Boolean)
        .join(" ") || null,
    locationLabel: offering.branch.locationLabel,
    timezone: offering.branch.timezone,
    price: offering.price.toString(),
    pricingType: offering.pricingType,
    durationMinutes: offering.durationMinutes,
    staffSelectionMode: offering.service.staffSelectionMode,
  }));
}

export async function getPublicOfferingStaff(
  branchServiceId: string,
): Promise<{
  staffSelectionMode: "NONE" | "OPTIONAL" | "REQUIRED";
  staff: PublicBookingStaffMember[];
}> {
  const offering = await prisma.branchService.findFirst({
    where: {
      id: branchServiceId,
      isAvailable: true,
      service: { status: "ACTIVE" },
      branch: {
        ...activeBranchWhere,
        organization: publicOrganizationWhere,
      },
    },
    include: {
      service: {
        include: {
          staffAssignments: {
            where: activeServiceStaffAssignmentWhere,
            select: serviceStaffAssignmentPolicySelect,
          },
        },
      },
      branch: {
        include: {
          assignments: {
            where: {
              member: {
                deletedAt: null,
                status: "ACTIVE",
                person: { deletedAt: null, status: "ACTIVE" },
              },
            },
            include: { member: { include: { person: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
  if (!offering) {
    bookingDomainError("NOT_FOUND", "Service offering was not found.");
  }
  if (offering.branch.organizationId !== offering.service.organizationId) {
    bookingDomainError(
      "SERVICE_UNAVAILABLE",
      "Service and branch do not belong to the same business.",
    );
  }

  const assignedIds = activeServiceStaffAssignmentMemberIds({
    assignments: offering.service.staffAssignments,
    organizationId: offering.service.organizationId,
    serviceId: offering.service.id,
  });
  const candidates = offering.branch.assignments
    .map((assignment) => assignment.member)
    .filter(
      (member) =>
        member.organizationId === offering.service.organizationId &&
        serviceStaffPolicyAllowsMember(assignedIds, member.id),
    );

  return {
    staffSelectionMode: offering.service.staffSelectionMode,
    staff:
      offering.service.staffSelectionMode === "NONE"
        ? []
        : candidates.map((member) => ({
            id: member.id,
            name:
              member.person.displayName ??
              [member.person.firstName, member.person.lastName]
                .filter(Boolean)
                .join(" "),
            photoUrl: member.isPublicProfessional
              ? member.photoUrl ?? member.person.avatarUrl
              : null,
            specialties: member.isPublicProfessional ? member.specialties : [],
          })),
  };
}
