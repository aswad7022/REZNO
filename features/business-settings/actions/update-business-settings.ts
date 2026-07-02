"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { canManageOrganization } from "@/features/business/policies/access";
import { createBusinessSettingsSchema } from "@/features/business-settings/schemas/business-settings";
import type { BusinessSettingsActionState } from "@/features/business-settings/types";
import { requireBusinessIdentity } from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";
import { logServerError } from "@/lib/logging/server";

export async function updateBusinessSettings(
  _previousState: BusinessSettingsActionState,
  formData: FormData,
): Promise<BusinessSettingsActionState> {
  const [identity, tMessages, tValidation] = await Promise.all([
    requireBusinessIdentity(),
    getTranslations("BusinessSettings.messages"),
    getTranslations("Validation"),
  ]);

  if (!canManageOrganization(identity.membership.role.systemRole)) {
    return { status: "error", message: tMessages("forbidden") };
  }

  const schema = createBusinessSettingsSchema((key) => tValidation(key));
  const parsed = schema.safeParse({
    bookingEnabled: formData.get("bookingEnabled"),
    marketplaceVisible: formData.get("marketplaceVisible"),
    vertical: formData.get("vertical"),
    staffSelectionMode: formData.get("staffSelectionMode"),
    cancellationWindowHours: formData.get("cancellationWindowHours"),
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      status: "error",
      message: tMessages("invalid"),
      fieldErrors: {
        vertical: errors.vertical?.[0],
        staffSelectionMode: errors.staffSelectionMode?.[0],
        cancellationWindowHours: errors.cancellationWindowHours?.[0],
      },
    };
  }

  try {
    const { vertical, ...settings } = parsed.data;
    await prisma.$transaction([
      prisma.organization.update({
        where: { id: identity.membership.organizationId },
        data: { vertical },
      }),
      prisma.organizationSettings.upsert({
        where: { organizationId: identity.membership.organizationId },
        create: {
          organizationId: identity.membership.organizationId,
          ...settings,
        },
        update: settings,
      }),
    ]);
  } catch (error) {
    logServerError("businessSettings.update", error, {
      organizationId: identity.membership.organizationId,
    });
    return { status: "error", message: tMessages("failure") };
  }

  revalidatePath("/business/manage/settings");
  return { status: "success", message: tMessages("success") };
}
