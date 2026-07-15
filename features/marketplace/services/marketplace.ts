import "server-only";

import { cache } from "react";
import type { BusinessVertical, Prisma } from "@prisma/client";

import type {
  MarketplaceBusiness,
  PublicBusinessProfile,
  PublicProfessionalProfile,
} from "@/features/marketplace/types";
import type { NormalizedSearchQuery } from "@/features/search/types";
import {
  getSearchTermVariants,
  normalizeSearchQuery,
  scoreSearchResult,
} from "@/features/search/services/search-normalization";
import { calculateDistanceKm } from "@/features/location/services/distance";
import {
  getNearbyBranchWhere,
  normalizeNearbyInput,
} from "@/features/location/services/nearby-businesses";
import { prisma } from "@/lib/db/prisma";
import {
  getPublicMemberReviewAggregate,
  getPublicOrganizationReviewAggregates,
  listPublicBusinessReviews,
} from "@/features/reviews/services/review-lifecycle";

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
  const searchQuery = normalizeSearchQuery(options?.query);
  const query = searchQuery?.raw;
  const searchTerms = searchQuery ? getSearchTermVariants(searchQuery) : [];
  const city = normalizeShortFilter(options?.city);
  const category = normalizeShortFilter(options?.category);
  const nearbyInput = normalizeNearbyInput({
    latitude: options?.latitude,
    longitude: options?.longitude,
    radiusKm: options?.radiusKm,
    query,
    category,
    vertical: options?.vertical,
    take: options?.take,
  });
  const nearbyBranchWhere = nearbyInput
    ? getNearbyBranchWhere(nearbyInput)
    : null;
  const candidateIds = searchQuery
    ? await findMarketplaceSearchCandidateIds(searchQuery, searchTerms)
    : null;

  if (searchQuery && candidateIds?.length === 0) return [];

  const organizations = await prisma.organization.findMany({
    where: {
      ...publicOrganizationWhere,
      ...(candidateIds ? { id: { in: candidateIds } } : {}),
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
      ...(category
        ? {
            services: {
              some: {
                status: "ACTIVE" as const,
                category: { slug: category },
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
                deletedAt: null,
                status: "ACTIVE",
                ...(category
                  ? { category: { slug: category } }
                  : {}),
              },
            },
            include: { service: { include: { category: true } } },
          },
        },
      },
      services: {
        where: { deletedAt: null, status: "ACTIVE" },
        include: { category: true },
      },
      restaurantTables: {
        where: { isActive: true },
        select: { id: true },
      },
      menuItems: {
        where: { isAvailable: true },
        select: { id: true, name: true, description: true },
      },
    },
    orderBy: [{ isVerified: "desc" }, { name: "asc" }],
    take: nearbyInput?.take ?? options?.take ?? 24,
  });
  const reviewStatsByOrganizationId = await getPublicOrganizationReviewAggregates(
    organizations.map((organization) => organization.id),
  );

  return organizations
    .map((organization) => {
      const offerings = organization.branches.flatMap(
        (branch) => branch.branchServices,
      );
      const prices = offerings.map((offering) => Number(offering.price));
      const matchingOffering = searchQuery
        ? offerings.find((offering) => {
            const serviceName = offering.service.name.toLocaleLowerCase();
            return searchQuery.terms.some((term) => serviceName.includes(term));
          })
        : undefined;
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
      const reviewStats = reviewStatsByOrganizationId.get(organization.id);
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
        isFavorited: false,
        averageRating: reviewStats?.averageRating ?? null,
        reviewCount: reviewStats?.reviewCount ?? 0,
        hasActiveBranch: organization.branches.length > 0,
        distanceKm,
        branchLatitude: displayBranch?.latitude
          ? Number(displayBranch.latitude)
          : null,
        branchLongitude: displayBranch?.longitude
          ? Number(displayBranch.longitude)
          : null,
        branchLocationLabel: displayBranch?.locationLabel ?? null,
        branchNearbyLandmark: displayBranch?.nearbyLandmark ?? null,
        createdAt: organization.createdAt,
        matchingServiceName: matchingOffering?.service.name ?? null,
        matchingServicePrice: matchingOffering?.price.toString() ?? null,
        serviceCount: new Set(
          offerings.map((offering) => offering.serviceId),
        ).size,
        startingPrice:
          prices.length > 0 ? Math.min(...prices).toString() : null,
        relevance: scoreSearchResult(searchQuery, {
          name: organization.name,
          slug: organization.slug,
          description: organization.profile?.description ?? null,
          categoryName:
            organization.profile?.businessCategory ??
            offerings[0]?.service.category.name ??
            null,
          vertical: organization.vertical,
          branches: organization.branches.map((branch) => ({
            name: branch.name,
            addressLine1: branch.addressLine1,
            addressLine2: branch.addressLine2,
            city: branch.city,
            locationLabel: branch.locationLabel,
            nearbyLandmark: branch.nearbyLandmark,
            locationInstructions: branch.locationInstructions,
          })),
          services: organization.services.map((service) => ({
            name: service.name,
            description: service.description,
            categoryName: service.category.name,
          })),
          menuItems: organization.menuItems.map((item) => ({
            name: item.name,
            description: item.description,
          })),
        }),
        updatedAt: organization.updatedAt,
      };
    })
    .filter((business) =>
      !business.hasActiveBranch || (nearbyInput && business.distanceKm === null)
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
        (left.distanceKm !== null ? -10 : 0) -
          (right.distanceKm !== null ? -10 : 0) ||
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
      isFavorited: false,
      averageRating: business.averageRating,
      reviewCount: business.reviewCount,
      distanceKm: business.distanceKm,
      branchLatitude: business.branchLatitude,
      branchLongitude: business.branchLongitude,
      branchLocationLabel: business.branchLocationLabel,
      branchNearbyLandmark: business.branchNearbyLandmark,
      createdAt: business.createdAt,
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
        organizationMembers: {
          where: {
            isPublicProfessional: true,
            publicSlug: { not: null },
            deletedAt: null,
            status: "ACTIVE",
            person: { status: "ACTIVE", deletedAt: null },
          },
          include: {
            person: true,
            serviceAssignments: {
              where: {
                service: {
                  status: "ACTIVE",
                  branchServices: {
                    some: {
                      isAvailable: true,
                      branch: {
                        status: "ACTIVE",
                        deletedAt: null,
                      },
                    },
                  },
                },
              },
              select: { id: true },
              take: 1,
            },
          },
          orderBy: { createdAt: "asc" },
        },
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
              where: { isAvailable: true, service: { deletedAt: null, status: "ACTIVE" } },
              include: {
                service: {
                  include: {
                    category: true,
                    staffAssignments: {
                      where: {
                        member: {
                          isPublicProfessional: true,
                          publicSlug: { not: null },
                          person: { status: "ACTIVE", deletedAt: null },
                        },
                      },
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
    const genericServiceBusiness =
      organization.vertical !== "RESTAURANT" && organization.vertical !== "CAFE";
    const [organizationAggregates, publicReviewPage] = await Promise.all([
      getPublicOrganizationReviewAggregates([organization.id]),
      genericServiceBusiness
        ? listPublicBusinessReviews({ slug: organization.slug, limit: 6 })
        : Promise.resolve(null),
    ]);
    const ratingAggregate = organizationAggregates.get(organization.id);
    const averageRating = ratingAggregate?.averageRating ?? null;
    const reviewCount = ratingAggregate?.reviewCount ?? 0;
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
      isFavorited: false,
      averageRating,
      reviewCount,
      distanceKm: null,
      branchLatitude: organization.branches[0]?.latitude
        ? Number(organization.branches[0].latitude)
        : null,
      branchLongitude: organization.branches[0]?.longitude
        ? Number(organization.branches[0].longitude)
        : null,
      branchLocationLabel: organization.branches[0]?.locationLabel ?? null,
      branchNearbyLandmark: organization.branches[0]?.nearbyLandmark ?? null,
      createdAt: organization.createdAt,
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
      recentReviews: (publicReviewPage?.reviews ?? [])
        .filter((review) => review.comment)
        .map((review) => ({
          id: review.id,
          rating: review.rating,
          comment: review.comment ?? "",
          customerName: review.customerName,
          createdAt: review.createdAt,
          serviceName: review.serviceName,
          businessReply: review.businessReply,
          businessRepliedAt: review.businessRepliedAt,
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
            isFavorited: false,
          })),
        })),
      team: organization.organizationMembers
        .filter(
          (member) =>
            member.publicSlug &&
            member.isPublicProfessional &&
            member.serviceAssignments.length > 0,
        )
        .map((member) => ({
          id: member.id,
          name:
            member.person.displayName ??
            [member.person.firstName, member.person.lastName]
              .filter(Boolean)
              .join(" "),
          publicSlug: member.publicSlug ?? "",
          photoUrl: member.photoUrl ?? member.person.avatarUrl,
          bio: member.bio,
          specialties: member.specialties,
        })),
    };
  },
);

export const getPublicProfessionalProfile = cache(
  async (
    businessSlug: string,
    staffSlug: string,
  ): Promise<PublicProfessionalProfile | null> => {
    const member = await prisma.organizationMember.findFirst({
      where: {
        publicSlug: staffSlug,
        isPublicProfessional: true,
        deletedAt: null,
        status: "ACTIVE",
        person: { status: "ACTIVE", deletedAt: null },
        organization: {
          slug: businessSlug,
          ...publicOrganizationWhere,
        },
      },
      include: {
        person: true,
        organization: {
          include: {
            profile: true,
          },
        },
        serviceAssignments: {
          where: {
            service: {
              status: "ACTIVE",
              branchServices: {
                some: {
                  isAvailable: true,
                  branch: {
                    status: "ACTIVE",
                    deletedAt: null,
                  },
                },
              },
            },
          },
          include: {
            service: {
              include: {
                category: true,
                branchServices: {
                  where: {
                    isAvailable: true,
                    branch: {
                      status: "ACTIVE",
                      deletedAt: null,
                    },
                  },
                  include: {
                    branch: true,
                  },
                  orderBy: { branch: { name: "asc" } },
                },
              },
            },
          },
          orderBy: { service: { name: "asc" } },
        },
      },
    });

    if (!member?.publicSlug) return null;

    const services = member.serviceAssignments.flatMap((assignment) =>
      assignment.service.branchServices.map((offering) => ({
        id: offering.id,
        name: assignment.service.name,
        description: assignment.service.description,
        imageUrl: assignment.service.imageUrl,
        categoryName: assignment.service.category.name,
        branchName: offering.branch.name,
        price: offering.price.toString(),
        durationMinutes: offering.durationMinutes,
      })),
    );

    if (services.length === 0) return null;

    const reviewAggregate = await getPublicMemberReviewAggregate(
      member.organizationId,
      member.id,
    );

    return {
      id: member.id,
      publicSlug: member.publicSlug,
      name:
        member.person.displayName ??
        [member.person.firstName, member.person.lastName]
          .filter(Boolean)
          .join(" "),
      photoUrl: member.photoUrl ?? member.person.avatarUrl,
      bio: member.bio,
      specialties: member.specialties,
      averageRating: reviewAggregate.averageRating,
      reviewCount: reviewAggregate.reviewCount,
      business: {
        id: member.organization.id,
        name: member.organization.name,
        slug: member.organization.slug,
        logoUrl: member.organization.profile?.logoUrl ?? null,
        categoryName: member.organization.profile?.businessCategory ?? null,
        vertical: member.organization.vertical,
      },
      services,
    };
  },
);

function normalizeShortFilter(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().slice(0, 80);
  return normalized || undefined;
}

async function findMarketplaceSearchCandidateIds(
  searchQuery: NormalizedSearchQuery,
  searchTerms: string[],
): Promise<string[]> {
  const organizationMatches: Prisma.OrganizationWhereInput[] = [
    ...searchTerms.flatMap((term) => [
      { name: { contains: term, mode: "insensitive" as const } },
      { slug: { contains: term, mode: "insensitive" as const } },
      {
        profile: {
          description: { contains: term, mode: "insensitive" as const },
        },
      },
      {
        profile: {
          businessCategory: { contains: term, mode: "insensitive" as const },
        },
      },
    ]),
    ...searchQuery.inferredVerticals.map((vertical) => ({ vertical })),
  ];
  const branchMatches: Prisma.BranchWhereInput[] = searchTerms.flatMap(
    (term) => [
      { name: { contains: term, mode: "insensitive" as const } },
      { city: { contains: term, mode: "insensitive" as const } },
      { addressLine1: { contains: term, mode: "insensitive" as const } },
      { addressLine2: { contains: term, mode: "insensitive" as const } },
      { locationLabel: { contains: term, mode: "insensitive" as const } },
      { nearbyLandmark: { contains: term, mode: "insensitive" as const } },
      {
        locationInstructions: {
          contains: term,
          mode: "insensitive" as const,
        },
      },
    ],
  );
  const serviceMatches: Prisma.ServiceWhereInput[] = searchTerms.flatMap(
    (term) => [
      { name: { contains: term, mode: "insensitive" as const } },
      { description: { contains: term, mode: "insensitive" as const } },
      { category: { name: { contains: term, mode: "insensitive" as const } } },
    ],
  );
  const menuItemMatches: Prisma.MenuItemWhereInput[] = searchTerms.flatMap(
    (term) => [
      { name: { contains: term, mode: "insensitive" as const } },
      { description: { contains: term, mode: "insensitive" as const } },
    ],
  );

  const [organizations, branches, services, menuItems] = await Promise.all([
    prisma.organization.findMany({
      where: {
        ...publicOrganizationWhere,
        OR: organizationMatches,
      },
      select: { id: true },
      take: 100,
    }),
    prisma.branch.findMany({
      where: {
        deletedAt: null,
        status: "ACTIVE",
        organization: publicOrganizationWhere,
        OR: branchMatches,
      },
      select: { organizationId: true },
      take: 100,
    }),
    prisma.service.findMany({
      where: {
        status: "ACTIVE",
        organization: publicOrganizationWhere,
        OR: serviceMatches,
      },
      select: { organizationId: true },
      take: 100,
    }),
    prisma.menuItem.findMany({
      where: {
        isAvailable: true,
        business: publicOrganizationWhere,
        OR: menuItemMatches,
      },
      select: { businessId: true },
      take: 100,
    }),
  ]);

  return Array.from(
    new Set([
      ...organizations.map((organization) => organization.id),
      ...branches.map((branch) => branch.organizationId),
      ...services.map((service) => service.organizationId),
      ...menuItems.map((item) => item.businessId),
    ]),
  );
}
