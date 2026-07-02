import "server-only";

import { canManageOrganization } from "@/features/business/policies/access";
import { requireBusinessIdentity } from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";
import type { BusinessProfileDetails } from "@/features/business/types";

export async function getCurrentBusinessProfile(): Promise<BusinessProfileDetails> {
  const { membership } = await requireBusinessIdentity();
  const [profile, settings] = await Promise.all([
    prisma.businessProfile.findUnique({
    where: { organizationId: membership.organizationId },
    }),
    prisma.organizationSettings.findUnique({
      where: { organizationId: membership.organizationId },
    }),
  ]);
  const faqItems = Array.isArray(profile?.faqItems)
    ? profile.faqItems.flatMap((item) => {
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
      })
    : [];

  return {
    name: membership.organization.name,
    slug: membership.organization.slug,
    businessType: membership.organization.businessType,
    businessCategory: profile?.businessCategory ?? "",
    isVerified: membership.organization.isVerified,
    legalName: profile?.legalName ?? "",
    description: profile?.description ?? "",
    website: profile?.website ?? "",
    logoUrl: profile?.logoUrl ?? "",
    coverImageUrl: profile?.coverImageUrl ?? "",
    businessEmail: profile?.businessEmail ?? "",
    businessPhone: profile?.businessPhone ?? "",
    whatsappPhone: profile?.whatsappPhone ?? "",
    googleMapsUrl: profile?.googleMapsUrl ?? "",
    bookingPolicy: profile?.bookingPolicy ?? "",
    galleryUrls: profile?.galleryUrls ?? [],
    faqItems,
    seoTitle: profile?.seoTitle ?? "",
    seoDescription: profile?.seoDescription ?? "",
    ogImageUrl: profile?.ogImageUrl ?? "",
    visibility: settings?.marketplaceVisible ? "PUBLISHED" : "HIDDEN",
    facebookUrl: profile?.facebookUrl ?? "",
    instagramUrl: profile?.instagramUrl ?? "",
    tiktokUrl: profile?.tiktokUrl ?? "",
    youtubeUrl: profile?.youtubeUrl ?? "",
    roleName: membership.role.name,
    canEdit: canManageOrganization(membership.role.systemRole),
  };
}

export async function getBusinessProfileWriteContext() {
  const context = await requireBusinessIdentity();

  return {
    ...context,
    canEdit: canManageOrganization(context.membership.role.systemRole),
  };
}
