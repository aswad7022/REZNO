import "server-only";

import { cache } from "react";

import { getCurrentIdentity, requireCustomerIdentity } from "@/features/identity/server";
import type { MarketplaceBusiness } from "@/features/marketplace/types";
import { prisma } from "@/lib/db/prisma";

const favoriteBusinessWhere = {
  deletedAt: null,
  isActive: true,
  status: "ACTIVE" as const,
  settings: {
    bookingEnabled: true,
    marketplaceVisible: true,
  },
};

export interface FavoriteServiceItem {
  id: string;
  serviceName: string;
  description: string | null;
  imageUrl: string | null;
  businessId: string;
  businessName: string;
  businessSlug: string;
  categoryName: string;
  branchName: string;
  city: string | null;
  locationLabel: string | null;
  nearbyLandmark: string | null;
  price: string;
  durationMinutes: number;
  averageRating: number | null;
  reviewCount: number;
  isFavorited: true;
}

export async function getCurrentCustomerFavoriteBusinessIds(
  organizationIds: string[],
) {
  const uniqueOrganizationIds = [...new Set(organizationIds)].filter(Boolean);
  if (uniqueOrganizationIds.length === 0) {
    return { isAuthenticated: false, favoriteOrganizationIds: new Set<string>() };
  }

  const identity = await getCurrentIdentity();
  if (
    !identity ||
    identity.person.deletedAt ||
    identity.person.status !== "ACTIVE" ||
    !identity.person.isOnboarded
  ) {
    return { isAuthenticated: Boolean(identity), favoriteOrganizationIds: new Set<string>() };
  }

  const favorites = await prisma.customerFavoriteBusiness.findMany({
    where: {
      customerId: identity.person.id,
      organizationId: { in: uniqueOrganizationIds },
      organization: favoriteBusinessWhere,
    },
    select: { organizationId: true },
  });

  return {
    isAuthenticated: true,
    favoriteOrganizationIds: new Set(
      favorites.map((favorite) => favorite.organizationId),
    ),
  };
}

export async function getCurrentCustomerFavoriteServiceIds(
  branchServiceIds: string[],
) {
  const uniqueBranchServiceIds = [...new Set(branchServiceIds)].filter(Boolean);
  if (uniqueBranchServiceIds.length === 0) {
    return { isAuthenticated: false, favoriteBranchServiceIds: new Set<string>() };
  }

  const identity = await getCurrentIdentity();
  if (
    !identity ||
    identity.person.deletedAt ||
    identity.person.status !== "ACTIVE" ||
    !identity.person.isOnboarded
  ) {
    return { isAuthenticated: Boolean(identity), favoriteBranchServiceIds: new Set<string>() };
  }

  const favorites = await prisma.customerFavoriteService.findMany({
    where: {
      customerId: identity.person.id,
      branchServiceId: { in: uniqueBranchServiceIds },
      branchService: {
        isAvailable: true,
        service: { status: "ACTIVE" },
        branch: {
          deletedAt: null,
          status: "ACTIVE",
          organization: favoriteBusinessWhere,
        },
      },
    },
    select: { branchServiceId: true },
  });

  return {
    isAuthenticated: true,
    favoriteBranchServiceIds: new Set(
      favorites.map((favorite) => favorite.branchServiceId),
    ),
  };
}

export const getCustomerFavoriteBusinesses = cache(async () => {
  const { person } = await requireCustomerIdentity();

  const favorites = await prisma.customerFavoriteBusiness.findMany({
    where: {
      customerId: person.id,
      organization: favoriteBusinessWhere,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      organization: {
        include: {
          profile: true,
          branches: {
            where: { deletedAt: null, status: "ACTIVE" },
            include: {
              branchServices: {
                where: { isAvailable: true },
                select: { price: true },
              },
            },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
          services: {
            where: { status: "ACTIVE" },
            include: { category: true },
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
      },
    },
  });

  const organizationIds = favorites.map((favorite) => favorite.organizationId);
  const reviewAggregates =
    organizationIds.length > 0
      ? await prisma.review.groupBy({
          by: ["organizationId"],
          where: {
            organizationId: { in: organizationIds },
            status: "VISIBLE",
          },
          _avg: { rating: true },
          _count: { _all: true },
        })
      : [];
  const reviewsByOrganizationId = new Map(
    reviewAggregates.map((aggregate) => [
      aggregate.organizationId,
      {
        averageRating: aggregate._avg.rating ?? null,
        reviewCount: aggregate._count._all,
      },
    ]),
  );

  return favorites.map((favorite): MarketplaceBusiness => {
    const organization = favorite.organization;
    const branch = organization.branches[0] ?? null;
    const servicePrices =
      branch?.branchServices.map((branchService) => Number(branchService.price)) ??
      [];
    const reviewStats = reviewsByOrganizationId.get(organization.id);
    return {
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      description: organization.profile?.description ?? null,
      logoUrl: organization.profile?.logoUrl ?? null,
      coverImageUrl: organization.profile?.coverImageUrl ?? null,
      city: branch?.city ?? null,
      categoryName:
        organization.profile?.businessCategory ??
        organization.services[0]?.category.name ??
        null,
      matchingServiceName: null,
      matchingServicePrice: null,
      serviceCount: organization.services.length,
      startingPrice:
        servicePrices.length > 0 ? Math.min(...servicePrices).toString() : null,
      vertical: organization.vertical,
      hasMenu: organization.menuItems.length > 0,
      hasTables: organization.restaurantTables.length > 0,
      isFavorited: true,
      averageRating: reviewStats?.averageRating ?? null,
      reviewCount: reviewStats?.reviewCount ?? 0,
      distanceKm: null,
      branchLatitude: branch?.latitude ? Number(branch.latitude) : null,
      branchLongitude: branch?.longitude ? Number(branch.longitude) : null,
      branchLocationLabel: branch?.locationLabel ?? null,
      branchNearbyLandmark: branch?.nearbyLandmark ?? null,
      createdAt: organization.createdAt,
    };
  });
});

export const getCustomerFavoriteServices = cache(async () => {
  const { person } = await requireCustomerIdentity();

  const favorites = await prisma.customerFavoriteService.findMany({
    where: {
      customerId: person.id,
      branchService: {
        isAvailable: true,
        service: { status: "ACTIVE" },
        branch: {
          deletedAt: null,
          status: "ACTIVE",
          organization: favoriteBusinessWhere,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      branchService: {
        include: {
          service: { include: { category: true } },
          branch: {
            include: {
              organization: { include: { profile: true } },
            },
          },
        },
      },
    },
  });

  const organizationIds = [
    ...new Set(
      favorites.map(
        (favorite) => favorite.branchService.branch.organizationId,
      ),
    ),
  ];
  const reviewAggregates =
    organizationIds.length > 0
      ? await prisma.review.groupBy({
          by: ["organizationId"],
          where: {
            organizationId: { in: organizationIds },
            status: "VISIBLE",
          },
          _avg: { rating: true },
          _count: { _all: true },
        })
      : [];
  const reviewsByOrganizationId = new Map(
    reviewAggregates.map((aggregate) => [
      aggregate.organizationId,
      {
        averageRating: aggregate._avg.rating ?? null,
        reviewCount: aggregate._count._all,
      },
    ]),
  );

  return favorites.map((favorite): FavoriteServiceItem => {
    const branchService = favorite.branchService;
    const organization = branchService.branch.organization;
    const reviewStats = reviewsByOrganizationId.get(organization.id);

    return {
      id: branchService.id,
      serviceName: branchService.service.name,
      description: branchService.service.description,
      imageUrl: branchService.service.imageUrl,
      businessId: organization.id,
      businessName: organization.name,
      businessSlug: organization.slug,
      categoryName: branchService.service.category.name,
      branchName: branchService.branch.name,
      city: branchService.branch.city,
      locationLabel: branchService.branch.locationLabel,
      nearbyLandmark: branchService.branch.nearbyLandmark,
      price: branchService.price.toString(),
      durationMinutes: branchService.durationMinutes,
      averageRating: reviewStats?.averageRating ?? null,
      reviewCount: reviewStats?.reviewCount ?? 0,
      isFavorited: true,
    };
  });
});

export async function getCustomerFavoriteCount() {
  const identity = await getCurrentIdentity();
  if (
    !identity ||
    identity.person.deletedAt ||
    identity.person.status !== "ACTIVE" ||
    !identity.person.isOnboarded
  ) {
    return 0;
  }

  return prisma.customerFavoriteBusiness.count({
    where: {
      customerId: identity.person.id,
      organization: favoriteBusinessWhere,
    },
  });
}

export { favoriteBusinessWhere };
