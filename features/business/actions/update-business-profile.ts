"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Prisma } from "@prisma/client";

import { createBusinessProfileSchema } from "@/features/business/schemas/business-profile";
import { isReservedBusinessSlug } from "@/features/business/lib/business-slug";
import { getBusinessProfileWriteContext } from "@/features/business/services/business-profile";
import type {
  BusinessProfileActionState,
  BusinessProfileField,
} from "@/features/business/types";
import { prisma } from "@/lib/db/prisma";
import { logServerError } from "@/lib/logging/server";

const businessProfileFields: ReadonlySet<string> = new Set([
  "name",
  "slug",
  "businessType",
  "businessCategory",
  "legalName",
  "description",
  "website",
  "logoUrl",
  "coverImageUrl",
  "businessEmail",
  "businessPhone",
  "whatsappPhone",
  "googleMapsUrl",
  "bookingPolicy",
  "galleryUrls",
  "faqItems",
  "seoTitle",
  "seoDescription",
  "ogImageUrl",
  "visibility",
  "facebookUrl",
  "instagramUrl",
  "tiktokUrl",
  "youtubeUrl",
]);

function isBusinessProfileField(value: PropertyKey): value is BusinessProfileField {
  return typeof value === "string" && businessProfileFields.has(value);
}

function getFieldErrors(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): BusinessProfileActionState["fieldErrors"] {
  const errors: NonNullable<BusinessProfileActionState["fieldErrors"]> = {};

  for (const issue of issues) {
    const field = issue.path[0];
    if (isBusinessProfileField(field)) {
      errors[field] ??= issue.message;
    }
  }

  return errors;
}

export async function updateBusinessProfile(
  _previousState: BusinessProfileActionState,
  formData: FormData,
): Promise<BusinessProfileActionState> {
  const [context, tMessages, tValidation] = await Promise.all([
    getBusinessProfileWriteContext(),
    getTranslations("BusinessManagement.messages"),
    getTranslations("Validation"),
  ]);

  if (!context.canEdit) {
    return {
      status: "error",
      message: tMessages("forbidden"),
    };
  }

  const schema = createBusinessProfileSchema((key) => tValidation(key));
  const parsed = schema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    businessType: formData.get("businessType"),
    businessCategory: formData.get("businessCategory") ?? "",
    legalName: formData.get("legalName"),
    description: formData.get("description"),
    businessEmail: formData.get("businessEmail"),
    businessPhone: formData.get("businessPhone"),
    whatsappPhone: formData.get("whatsappPhone"),
    googleMapsUrl: formData.get("googleMapsUrl"),
    bookingPolicy: formData.get("bookingPolicy"),
    galleryUrls: formData.get("galleryUrls") ?? "",
    faqItems: formData.get("faqItems") ?? "",
    seoTitle: formData.get("seoTitle"),
    seoDescription: formData.get("seoDescription"),
    ogImageUrl: formData.get("ogImageUrl"),
    visibility: formData.get("visibility"),
    website: formData.get("website"),
    logoUrl: formData.get("logoUrl"),
    coverImageUrl: formData.get("coverImageUrl"),
    facebookUrl: formData.get("facebookUrl"),
    instagramUrl: formData.get("instagramUrl"),
    tiktokUrl: formData.get("tiktokUrl"),
    youtubeUrl: formData.get("youtubeUrl"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: tMessages("invalid"),
      fieldErrors: getFieldErrors(parsed.error.issues),
    };
  }

  const {
    businessType,
    businessCategory,
    name,
    slug,
    legalName,
    description,
    businessEmail,
    businessPhone,
    whatsappPhone,
    googleMapsUrl,
    bookingPolicy,
    galleryUrls,
    faqItems,
    seoTitle,
    seoDescription,
    ogImageUrl,
    visibility,
    website,
    logoUrl,
    coverImageUrl,
    facebookUrl,
    instagramUrl,
    tiktokUrl,
    youtubeUrl,
  } = parsed.data;
  const organizationId = context.membership.organizationId;
  if (isReservedBusinessSlug(slug)) {
    return {
      status: "error",
      message: tMessages("invalid"),
      fieldErrors: { slug: tMessages("slugReserved") },
    };
  }

  try {
    await prisma.$transaction([
      prisma.organization.update({
        where: { id: organizationId },
        data: { businessType, name, slug },
      }),
      prisma.businessProfile.upsert({
        where: { organizationId },
        create: {
          organizationId,
          legalName,
          description,
          businessEmail,
          businessPhone,
          businessCategory,
          whatsappPhone,
          googleMapsUrl,
          bookingPolicy,
          galleryUrls,
          faqItems: faqItems as Prisma.InputJsonValue,
          seoTitle,
          seoDescription,
          ogImageUrl,
          website,
          logoUrl,
          coverImageUrl,
          facebookUrl,
          instagramUrl,
          tiktokUrl,
          youtubeUrl,
        },
        update: {
          legalName,
          description,
          businessEmail,
          businessPhone,
          businessCategory,
          whatsappPhone,
          googleMapsUrl,
          bookingPolicy,
          galleryUrls,
          faqItems: faqItems as Prisma.InputJsonValue,
          seoTitle,
          seoDescription,
          ogImageUrl,
          website,
          logoUrl,
          coverImageUrl,
          facebookUrl,
          instagramUrl,
          tiktokUrl,
          youtubeUrl,
        },
      }),
      prisma.organizationSettings.upsert({
        where: { organizationId },
        create: {
          organizationId,
          marketplaceVisible: visibility === "PUBLISHED",
        },
        update: {
          marketplaceVisible: visibility === "PUBLISHED",
        },
      }),
    ]);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        status: "error",
        message: tMessages("invalid"),
        fieldErrors: { slug: tMessages("slugTaken") },
      };
    }
    logServerError("businessProfile.update", error, { organizationId });
    return {
      status: "error",
      message: tMessages("failure"),
    };
  }

  revalidatePath("/business");
  revalidatePath("/business/manage");
  revalidatePath(`/${slug}`);
  revalidatePath(`/businesses/${slug}`);

  return {
    status: "success",
    message: tMessages("success"),
  };
}
