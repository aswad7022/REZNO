import "server-only";

import { canManageOrganization } from "@/features/business/policies/access";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import { requireBusinessIdentity } from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";
import { safePublicImageUrlOrNull } from "@/lib/security/public-image-url";
import type { BusinessProfileDetails } from "@/features/business/types";
import { resolvePublicMediaBatch } from "@/features/media/services/media-query";

export async function getCurrentBusinessProfile(): Promise<BusinessProfileDetails> {
  await currentBusinessOperationReference("SETTINGS_READ");
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
  const media = await resolvePublicMediaBatch([
    { id: membership.organizationId, kind: "BUSINESS_PROFILE", legacyValues: [profile?.logoUrl], slot: "BUSINESS_LOGO" },
    { id: membership.organizationId, kind: "BUSINESS_PROFILE", legacyValues: [profile?.coverImageUrl], slot: "BUSINESS_COVER" },
    { id: membership.organizationId, kind: "BUSINESS_PROFILE", legacyValues: profile?.galleryUrls ?? [], slot: "BUSINESS_GALLERY" },
  ]);

  return {
    name: membership.organization.name,
    slug: membership.organization.slug,
    businessType: membership.organization.businessType,
    businessCategory: profile?.businessCategory ?? "",
    isVerified: membership.organization.isVerified,
    legalName: profile?.legalName ?? "",
    description: profile?.description ?? "",
    website: profile?.website ?? "",
    logoUrl: media.get(`BUSINESS_PROFILE:${membership.organizationId}:BUSINESS_LOGO`)?.[0]?.stableDeliveryPath ?? "",
    coverImageUrl: media.get(`BUSINESS_PROFILE:${membership.organizationId}:BUSINESS_COVER`)?.[0]?.stableDeliveryPath ?? "",
    businessEmail: profile?.businessEmail ?? "",
    businessPhone: profile?.businessPhone ?? "",
    whatsappPhone: profile?.whatsappPhone ?? "",
    googleMapsUrl: profile?.googleMapsUrl ?? "",
    bookingPolicy: profile?.bookingPolicy ?? "",
    galleryUrls: (media.get(`BUSINESS_PROFILE:${membership.organizationId}:BUSINESS_GALLERY`) ?? [])
      .map((reference) => reference.stableDeliveryPath),
    faqItems,
    seoTitle: profile?.seoTitle ?? "",
    seoDescription: profile?.seoDescription ?? "",
    ogImageUrl: safePublicImageUrlOrNull(profile?.ogImageUrl) ?? "",
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
