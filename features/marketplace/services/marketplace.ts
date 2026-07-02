import "server-only";

import { cache } from "react";
import type { BusinessVertical } from "@prisma/client";

import type {
  MarketplaceBusiness,
  PublicBusinessProfile,
} from "@/features/marketplace/types";
import { calculateDistanceKm } from "@/features/location/services/distance";
import {
  getNearbyBranchWhere,
  normalizeNearbyInput,
} from "@/features/location/services/nearby-businesses";
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

function parseFaqItems(
  value: unknown,
): Array<{ question: string; answer: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      typeof item === "object" &&
      item !== null &&
      "question" in item &&
      "answer" in item &&
      typeof item.question === "string" &&
      typeof item.answer === "string"
    ) {
      return [{ question: item.question, answer: item.answer }];
    }
    return [];
  });
}

export async function searchMarketplace(options?: {
  query?: string;
  category?: string;
  city?: string;
  vertical?: BusinessVertical;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  take?: number;
}): Promise<MarketplaceBusiness[]> {
  const query = options?.query?.trim();
  const city = options?.city?.trim();
  const nearbyInput = normalizeNearbyInput({
    latitude: options?.latitude,
    longitude: options?.longitude,
    radiusKm: options?.radiusKm,
    query,
    category: options?.category,
    vertical: options?.vertical,
    take: options?.take,
  });
  const nearbyBranchWhere = nearbyInput
    ? getNearbyBranchWhere(nearbyInput)
    : null;
  const organizations = await prisma.organization.findMany({
    where: {
      ...publicOrganizationWhere,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              {
                profile: {
                  description: {
                    contains: query,
                    mode: "insensitive" as const,
                  },
                },
              },
              {
                services: {
                  some: {
                    status: "ACTIVE" as const,
                    name: {
                      contains: query,
                      mode: "insensitive" as const,
                    },
                  },
                },
              },
            ],
          }
        : {}),
      ...(city
        ? {
            branches: {
              some: {
                city: { contains: city, mode: "insensitive" as const },
                deletedAt: null,
                status: "ACTIVE" as const,
              },
            },
          }
        : {}),
      ...(nearbyBranchWhere
        ? {
            branches: {
              some: nearbyBranchWhere,
            },
          }
        : {}),
      ...(options?.category
        ? {
            services: {
              some: {
                status: "ACTIVE" as const,
                category: { slug: options.category },
              },
            },
          }
        : {}),
      ...(options?.vertical ? { vertical: options.vertical } : {}),
    },
    include: {
      profile: true,
      branches: {
        where: {
          deletedAt: null,
          status: "ACTIVE",
          ...(nearbyBranchWhere ?? {}),
          ...(city
            ? { city: { contains: city, mode: "insensitive" as const } }
            : {}),
        },
        include: {
          branchServices: {
            where: {
              isAvailable: true,
              service: {
                status: "ACTIVE",
                ...(options?.category
                  ? { category: { slug: options.category } }
                  : {}),
              },
            },
            include: { service: { include: { category: true } } },
          },
        },
      },
      restaurantTables: {
        where: { isActive: true },
        select: { id: true },
      },
      menuItems: {
        where: { isAvailable: true },
        select: { id: true },
      },
    },
    orderBy: [{ isVerified: "desc" }, { name: "asc" }],
    take: nearbyInput?.take ?? options?.take ?? 24,
  });

  return organizations
    .map((organization) => {
      const offerings = organization.branches.flatMap(
        (branch) => branch.branchServices,
      );
      const prices = offerings.map((offering) => Number(offering.price));
      const matchingOffering = query
        ? offerings.find((offering) =>
            offering.service.name.toLocaleLowerCase().includes(
              query.toLocaleLowerCase(),
            ),
          )
        : undefined;
      const normalizedQuery = query?.toLocaleLowerCase();
      const normalizedName = organization.name.toLocaleLowerCase();
      const branchesWithDistance = nearbyInput
        ? organization.branches
            .filter((branch) => branch.latitude && branch.longitude)
            .map((branch) => ({
              branch,
              distanceKm: calculateDistanceKm(nearbyInput, {
                latitude: Number(branch.latitude),
                longitude: Number(branch.longitude),
              }),
            }))
            .filter((item) => item.distanceKm <= nearbyInput.radiusKm)
            .sort((left, right) => left.distanceKm - right.distanceKm)
        : [];
      const closestBranch = branchesWithDistance[0]?.branch;
      const distanceKm =
        branchesWithDistance[0]?.distanceKm ??
        (options?.latitude !== undefined &&
        options.longitude !== undefined &&
        organization.branches[0]?.latitude &&
        organization.branches[0]?.longitude
          ? calculateDistanceKm(
              {
                latitude: options.latitude,
                longitude: options.longitude,
              },
              {
                latitude: Number(organization.branches[0].latitude),
                longitude: Number(organization.branches[0].longitude),
              },
            )
          : null);
      const displayBranch = closestBranch ?? organization.branches[0] ?? null;
      return {
        id: organization.id,
        slug: organization.slug,
        name: organization.name,
        description: organization.profile?.description ?? null,
        logoUrl: organization.profile?.logoUrl ?? null,
        coverImageUrl: organization.profile?.coverImageUrl ?? null,
        city:
          displayBranch?.city ??
          organization.branches.find((branch) => branch.city)?.city ??
          null,
        categoryName:
          organization.profile?.businessCategory ??
          offerings[0]?.service.category.name ??
          null,
        vertical: organization.vertical,
        hasMenu: organization.menuItems.length > 0,
        hasTables: organization.restaurantTables.length > 0,
        distanceKm,
        branchLatitude: displayBranch?.latitude
          ? Number(displayBranch.latitude)
          : null,
        branchLongitude: displayBranch?.longitude
          ? Number(displayBranch.longitude)
          : null,
        branchLocationLabel: displayBranch?.locationLabel ?? null,
        branchNearbyLandmark: displayBranch?.nearbyLandmark ?? null,
        matchingServiceName: matchingOffering?.service.name ?? null,
        matchingServicePrice: matchingOffering?.price.toString() ?? null,
        serviceCount: new Set(
          offerings.map((offering) => offering.serviceId),
        ).size,
        startingPrice:
          prices.length > 0 ? Math.min(...prices).toString() : null,
        relevance:
          normalizedQuery && normalizedName === normalizedQuery
            ? 3
            : normalizedQuery &&
                offerings.some(
                  (offering) =>
                    offering.service.name.toLocaleLowerCase() ===
                    normalizedQuery,
                )
              ? 2
              : normalizedQuery
                ? 1
                : 0,
        updatedAt: organization.updatedAt,
      };
    })
    .filter((business) =>
      nearbyInput && business.distanceKm === null
        ? false
        : business.vertical === "RESTAURANT" || business.vertical === "CAFE"
          ? business.hasMenu || business.hasTables
          : business.serviceCount > 0,
    )
    .sort(
      (left, right) =>
        right.relevance - left.relevance ||
        (left.distanceKm ?? Number.POSITIVE_INFINITY) -
          (right.distanceKm ?? Number.POSITIVE_INFINITY) ||
        right.updatedAt.getTime() - left.updatedAt.getTime(),
    )
    .map((business) => ({
      id: business.id,
      slug: business.slug,
      name: business.name,
      description: business.description,
      logoUrl: business.logoUrl,
      coverImageUrl: business.coverImageUrl,
      city: business.city,
      categoryName: business.categoryName,
      matchingServiceName: business.matchingServiceName,
      matchingServicePrice: business.matchingServicePrice,
      serviceCount: business.serviceCount,
      startingPrice: business.startingPrice,
      vertical: business.vertical,
      hasMenu: business.hasMenu,
      hasTables: business.hasTables,
      distanceKm: business.distanceKm,
      branchLatitude: business.branchLatitude,
      branchLongitude: business.branchLongitude,
      branchLocationLabel: business.branchLocationLabel,
      branchNearbyLandmark: business.branchNearbyLandmark,
    }));
}

export const getMarketplaceFilters = cache(async () => {
  const [categories, cities] = await Promise.all([
    prisma.category.findMany({
      where: {
        services: {
          some: {
            status: "ACTIVE",
            organization: publicOrganizationWhere,
          },
        },
      },
      select: { name: true, slug: true },
      orderBy: { name: "asc" },
    }),
    prisma.branch.findMany({
      where: {
        deletedAt: null,
        status: "ACTIVE",
        city: { not: null },
        organization: publicOrganizationWhere,
      },
      distinct: ["city"],
      select: { city: true },
      orderBy: { city: "asc" },
    }),
  ]);
  return {
    categories,
    cities: cities.flatMap((item) => (item.city ? [item.city] : [])),
  };
});

export const getPublicBusiness = cache(
  async (slug: string): Promise<PublicBusinessProfile | null> => {
    const organization = await prisma.organization.findFirst({
      where: { slug, ...publicOrganizationWhere },
      include: {
        profile: true,
        reviews: {
          where: { comment: { not: null } },
          include: { customer: true },
          orderBy: { createdAt: "desc" },
          take: 6,
        },
        organizationMembers: {
          where: {
            OR: [
              { photoUrl: { not: null } },
              { bio: { not: null } },
              { specialties: { isEmpty: false } },
            ],
          },
          include: { person: true },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { reviews: true } },
        restaurantTables: {
          where: { isActive: true },
          orderBy: [{ area: "asc" }, { name: "asc" }],
        },
        menuCategories: {
          where: { isActive: true },
          include: {
            items: {
              where: { isAvailable: true },
              orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            },
          },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        },
        branches: {
          where: { deletedAt: null, status: "ACTIVE" },
          include: {
            businessHours: {
              where: { isOpen: true },
              orderBy: { dayOfWeek: "asc" },
            },
            blockedTimes: {
              where: {
                memberId: null,
                endsAt: { gte: new Date() },
              },
              orderBy: { startsAt: "asc" },
              take: 12,
            },
            branchServices: {
              where: { isAvailable: true, service: { status: "ACTIVE" } },
              include: {
                service: {
                  include: {
                    category: true,
                    staffAssignments: {
                      include: { member: { include: { person: true } } },
                    },
                  },
                },
              },
              orderBy: { service: { name: "asc" } },
            },
          },
          orderBy: { name: "asc" },
        },
      },
    });
    if (!organization) return null;

    const offerings = organization.branches.flatMap(
      (branch) => branch.branchServices,
    );
    const prices = offerings.map((offering) => Number(offering.price));
    const ratingAggregate =
      organization._count.reviews > 0
        ? await prisma.review.aggregate({
            where: { organizationId: organization.id },
            _avg: { rating: true },
          })
        : null;
    const averageRating = ratingAggregate?._avg.rating ?? null;
    return {
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      description: organization.profile?.description ?? null,
      logoUrl: organization.profile?.logoUrl ?? null,
      coverImageUrl: organization.profile?.coverImageUrl ?? null,
      businessType: organization.businessType,
      vertical: organization.vertical,
      categoryName:
        organization.profile?.businessCategory ??
        offerings.find((offering) => offering.service.category)?.service
          .category.name ??
        null,
      city: organization.branches.find((branch) => branch.city)?.city ?? null,
      matchingServiceName: null,
      matchingServicePrice: null,
      serviceCount: new Set(
        offerings.map((offering) => offering.serviceId),
      ).size,
      hasMenu: organization.menuCategories.some(
        (category) => category.items.length > 0,
      ),
      hasTables: organization.restaurantTables.length > 0,
      distanceKm: null,
      branchLatitude: organization.branches[0]?.latitude
        ? Number(organization.branches[0].latitude)
        : null,
      branchLongitude: organization.branches[0]?.longitude
        ? Number(organization.branches[0].longitude)
        : null,
      branchLocationLabel: organization.branches[0]?.locationLabel ?? null,
      branchNearbyLandmark: organization.branches[0]?.nearbyLandmark ?? null,
      startingPrice:
        prices.length > 0 ? Math.min(...prices).toString() : null,
      website: organization.profile?.website ?? null,
      businessPhone:
        organization.profile?.businessPhone ??
        organization.branches.find((branch) => branch.phone)?.phone ??
        null,
      businessEmail: organization.profile?.businessEmail ?? null,
      whatsappPhone:
        organization.profile?.whatsappPhone ??
        organization.profile?.businessPhone ??
        null,
      googleMapsUrl: organization.profile?.googleMapsUrl ?? null,
      bookingPolicy: organization.profile?.bookingPolicy ?? null,
      galleryUrls: organization.profile?.galleryUrls ?? [],
      faqItems: parseFaqItems(organization.profile?.faqItems),
      facebookUrl: organization.profile?.facebookUrl ?? null,
      instagramUrl: organization.profile?.instagramUrl ?? null,
      seoTitle: organization.profile?.seoTitle ?? null,
      seoDescription: organization.profile?.seoDescription ?? null,
      ogImageUrl: organization.profile?.ogImageUrl ?? null,
      averageRating,
      reviewCount: organization._count.reviews,
      menuCategories: organization.menuCategories.map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description,
        items: category.items.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price.toString(),
          currency: item.currency,
          imageUrl: item.imageUrl,
          isAvailable: item.isAvailable,
          preparationMinutes: item.preparationMinutes,
        })),
      })),
      seatingAreas: Array.from(
        new Set(
          organization.restaurantTables.flatMap((table) =>
            table.area ? [table.area] : [],
          ),
        ),
      ),
      recentReviews: organization.reviews
        .filter((review) => review.comment)
        .map((review) => ({
          id: review.id,
          rating: review.rating,
          comment: review.comment ?? "",
          customerName:
            review.customer.displayName ?? review.customer.firstName,
        })),
      branches: organization.branches
        .filter(
          (branch) =>
            organization.vertical === "RESTAURANT" ||
            organization.vertical === "CAFE" ||
            branch.branchServices.length > 0,
        )
        .map((branch) => ({
          id: branch.id,
          name: branch.name,
          city: branch.city,
          address:
            [branch.addressLine1, branch.addressLine2]
              .filter(Boolean)
              .join(" ") || null,
          latitude: branch.latitude ? Number(branch.latitude) : null,
          longitude: branch.longitude ? Number(branch.longitude) : null,
          locationLabel: branch.locationLabel,
          nearbyLandmark: branch.nearbyLandmark,
          locationInstructions: branch.locationInstructions,
          workingHours: branch.businessHours.map((hours) => ({
            dayOfWeek: hours.dayOfWeek,
            openTime: hours.openTime,
            closeTime: hours.closeTime,
          })),
          specialClosures: branch.blockedTimes.map((closure) => ({
            id: closure.id,
            startsAt: closure.startsAt,
            endsAt: closure.endsAt,
            reason: closure.reason,
          })),
          offerings: branch.branchServices.map((offering) => ({
            id: offering.id,
            serviceName: offering.service.name,
            description: offering.service.description,
            imageUrl: offering.service.imageUrl,
            categoryName: offering.service.category.name,
            branchName: branch.name,
            price: offering.price.toString(),
            durationMinutes: offering.durationMinutes,
            staffSelectionMode: offering.service.staffSelectionMode,
            assignedEmployees: offering.service.staffAssignments.map(
              (assignment) =>
                assignment.member.person.displayName ??
                assignment.member.person.firstName,
            ),
          })),
        })),
      team: organization.organizationMembers
        .filter(
          (member) =>
            member.photoUrl ||
            member.bio ||
            member.specialties.length > 0,
        )
        .map((member) => ({
          id: member.id,
          name:
            member.person.displayName ??
            [member.person.firstName, member.person.lastName]
              .filter(Boolean)
              .join(" "),
          photoUrl: member.photoUrl ?? member.person.avatarUrl,
          bio: member.bio,
          specialties: member.specialties,
        })),
    };
  },
);
