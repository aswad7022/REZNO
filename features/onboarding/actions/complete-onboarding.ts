"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  ACTIVE_BUSINESS_COOKIE,
  requireActiveIdentity,
} from "@/features/identity/server";
import { isReservedBusinessSlug } from "@/features/business/lib/business-slug";
import { businessOnboardingSchema } from "@/features/onboarding/schemas/onboarding";
import type { BusinessOnboardingState } from "@/features/onboarding/types";
import { prisma } from "@/lib/db/prisma";
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
  const { person } = await requireActiveIdentity();

  await prisma.person.update({
    where: { id: person.id },
    data: { isOnboarded: true },
  });

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
  const organizationId = randomUUID();
  const ownerRoleId = randomUUID();
  const branchSlug = slugify(branchName) || "main";

  try {
    await prisma.$transaction(
      async (transaction) => {
        await transaction.organization.create({
          data: {
            id: organizationId,
            name: organizationName,
            slug: organizationSlug,
            vertical,
            branches: {
              create: {
                name: branchName,
                slug: branchSlug,
              },
            },
            profile: {
              create: {},
            },
            roles: {
              create: {
                id: ownerRoleId,
                name: "Owner",
                description: "Full access to the organization.",
                isSystem: true,
                systemRole: "OWNER",
              },
            },
            settings: {
              create: {},
            },
          },
        });

        await transaction.organizationMember.create({
          data: {
            organizationId,
            personId: identity.person.id,
            roleId: ownerRoleId,
          },
        });

        await transaction.person.update({
          where: { id: identity.person.id },
          data: { isOnboarded: true },
        });
      },
      {
        isolationLevel: "Serializable",
      },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
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
