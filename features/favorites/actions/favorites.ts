"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireCustomerIdentity } from "@/features/identity/server";
import { favoriteBusinessWhere } from "@/features/favorites/services/favorites";
import { prisma } from "@/lib/db/prisma";
import { logServerError } from "@/lib/logging/server";

export interface FavoriteActionState {
  status: "idle" | "success" | "error";
  message?: string;
  isFavorited?: boolean;
}

const favoriteBusinessSchema = z.object({
  organizationId: z.string().uuid(),
});

const favoriteServiceSchema = z.object({
  branchServiceId: z.string().uuid(),
});

export async function toggleFavoriteBusinessById(
  organizationId: string,
): Promise<FavoriteActionState> {
  const [identity, t] = await Promise.all([
    requireCustomerIdentity(),
    getTranslations("Favorites"),
  ]);
  const parsed = favoriteBusinessSchema.safeParse({ organizationId });

  if (!parsed.success) {
    return { status: "error", message: t("invalidBusiness") };
  }

  const business = await prisma.organization.findFirst({
    where: {
      id: parsed.data.organizationId,
      ...favoriteBusinessWhere,
    },
    select: { id: true, slug: true },
  });

  if (!business) {
    return { status: "error", message: t("businessUnavailable") };
  }

  try {
    const existing = await prisma.customerFavoriteBusiness.findUnique({
      where: {
        customerId_organizationId: {
          customerId: identity.person.id,
          organizationId: business.id,
        },
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.customerFavoriteBusiness.delete({
        where: { id: existing.id },
      });
      revalidateFavoritePaths(business.slug);
      return {
        status: "success",
        message: t("removed"),
        isFavorited: false,
      };
    }

    await prisma.customerFavoriteBusiness.create({
      data: {
        customerId: identity.person.id,
        organizationId: business.id,
      },
    });
    revalidateFavoritePaths(business.slug);
    return {
      status: "success",
      message: t("added"),
      isFavorited: true,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      revalidateFavoritePaths(business.slug);
      return {
        status: "success",
        message: t("added"),
        isFavorited: true,
      };
    }

    logServerError("favorites.toggle", error, {
      customerId: identity.person.id,
      organizationId: business.id,
    });
    return { status: "error", message: t("couldNotUpdate") };
  }
}

export async function toggleFavoriteBusiness(
  _state: FavoriteActionState,
  formData: FormData,
): Promise<FavoriteActionState> {
  return toggleFavoriteBusinessById(String(formData.get("organizationId") ?? ""));
}

export async function toggleFavoriteServiceById(
  branchServiceId: string,
): Promise<FavoriteActionState> {
  const [identity, t] = await Promise.all([
    requireCustomerIdentity(),
    getTranslations("Favorites"),
  ]);
  const parsed = favoriteServiceSchema.safeParse({ branchServiceId });

  if (!parsed.success) {
    return { status: "error", message: t("invalidService") };
  }

  const offering = await prisma.branchService.findFirst({
    where: {
      id: parsed.data.branchServiceId,
      isAvailable: true,
      service: { deletedAt: null, status: "ACTIVE" },
      branch: {
        deletedAt: null,
        status: "ACTIVE",
        organization: favoriteBusinessWhere,
      },
    },
    select: {
      id: true,
      branch: {
        select: {
          organizationId: true,
          organization: { select: { slug: true } },
        },
      },
    },
  });

  if (!offering) {
    return { status: "error", message: t("serviceUnavailable") };
  }

  try {
    const existing = await prisma.customerFavoriteService.findUnique({
      where: {
        customerId_branchServiceId: {
          customerId: identity.person.id,
          branchServiceId: offering.id,
        },
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.customerFavoriteService.delete({
        where: { id: existing.id },
      });
      revalidateFavoritePaths(offering.branch.organization.slug);
      return {
        status: "success",
        message: t("serviceRemoved"),
        isFavorited: false,
      };
    }

    await prisma.customerFavoriteService.create({
      data: {
        customerId: identity.person.id,
        organizationId: offering.branch.organizationId,
        branchServiceId: offering.id,
      },
    });
    revalidateFavoritePaths(offering.branch.organization.slug);
    return {
      status: "success",
      message: t("serviceAdded"),
      isFavorited: true,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      revalidateFavoritePaths(offering.branch.organization.slug);
      return {
        status: "success",
        message: t("serviceAdded"),
        isFavorited: true,
      };
    }

    logServerError("favorites.service.toggle", error, {
      customerId: identity.person.id,
      branchServiceId: offering.id,
    });
    return { status: "error", message: t("couldNotUpdate") };
  }
}

export async function toggleFavoriteService(
  _state: FavoriteActionState,
  formData: FormData,
): Promise<FavoriteActionState> {
  return toggleFavoriteServiceById(String(formData.get("branchServiceId") ?? ""));
}

function revalidateFavoritePaths(slug: string) {
  revalidatePath("/marketplace");
  revalidatePath("/customer");
  revalidatePath("/customer/favorites");
  revalidatePath(`/${slug}`);
  revalidatePath(`/businesses/${slug}`);
}
