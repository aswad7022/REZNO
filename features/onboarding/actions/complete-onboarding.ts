"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  ACTIVE_BUSINESS_COOKIE,
  requireActiveIdentity,
} from "@/features/identity/server";
import { isReservedBusinessSlug } from "@/features/business/lib/business-slug";
import { businessOnboardingSchema } from "@/features/onboarding/schemas/onboarding";
import { completeCustomerOnboardingProfile } from "@/features/onboarding/services/customer-onboarding";
import {
  BusinessOnboardingProvisioningError,
  provisionBusinessOnboarding,
} from "@/features/onboarding/services/business-onboarding";
import type { BusinessOnboardingState } from "@/features/onboarding/types";
import { getSafeInternalPath } from "@/lib/navigation/safe-redirect";

function slugify(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function safeNextPath(value: string | undefined): string {
  return getSafeInternalPath(value, "/customer");
}

export async function completeCustomerOnboarding(
  nextPath?: string,
): Promise<never> {
  const { session } = await requireActiveIdentity();

  await completeCustomerOnboardingProfile(session.user.id);

  redirect(safeNextPath(nextPath));
}

export async function completeBusinessOnboarding(
  _previousState: BusinessOnboardingState,
  formData: FormData,
): Promise<BusinessOnboardingState> {
  const identity = await requireActiveIdentity();
  const t = await getTranslations("Onboarding");
  const parsed = businessOnboardingSchema((key) => t(key)).safeParse({
    organizationName: formData.get("organizationName"),
    branchName: formData.get("branchName"),
    slug: formData.get("slug"),
    vertical: formData.get("vertical"),
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;

    return {
      status: "error",
      message: t("invalid"),
      fieldErrors: {
        organizationName: errors.organizationName?.[0],
        branchName: errors.branchName?.[0],
        slug: errors.slug?.[0],
        vertical: errors.vertical?.[0],
      },
    };
  }

  const {
    branchName,
    organizationName,
    slug: organizationSlug,
    vertical,
  } = parsed.data;
  if (isReservedBusinessSlug(organizationSlug)) {
    return {
      status: "error",
      message: t("invalid"),
      fieldErrors: { slug: t("slugReserved") },
    };
  }
  const branchSlug = slugify(branchName) || "main";
  let organizationId: string;

  try {
    const result = await provisionBusinessOnboarding({
      branchName,
      branchSlug,
      organizationName,
      organizationSlug,
      personId: identity.person.id,
      vertical,
    });
    organizationId = result.organizationId;
  } catch (error) {
    if (
      error instanceof BusinessOnboardingProvisioningError &&
      error.code === "SLUG_TAKEN"
    ) {
      return {
        status: "error",
        message: t("invalid"),
        fieldErrors: { slug: t("slugTaken") },
      };
    }
    return {
      status: "error",
      message: t("failure"),
    };
  }

  (await cookies()).set(ACTIVE_BUSINESS_COOKIE, organizationId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 180,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  redirect("/business");
}
