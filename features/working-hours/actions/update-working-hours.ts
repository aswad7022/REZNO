"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { canManageOrganization } from "@/features/business/policies/access";
import { requireBusinessIdentity } from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";
import { logServerError } from "@/lib/logging/server";
import { createWorkingHoursSchema } from "@/features/working-hours/schemas/working-hours";
import type { WorkingHoursActionState } from "@/features/working-hours/types";

export async function updateWorkingHours(
  branchId: string,
  _previousState: WorkingHoursActionState,
  formData: FormData,
): Promise<WorkingHoursActionState> {
  const [identity, tMessages, tValidation] = await Promise.all([
    requireBusinessIdentity(),
    getTranslations("WorkingHours.messages"),
    getTranslations("Validation"),
  ]);

  if (!canManageOrganization(identity.membership.role.systemRole)) {
    return { status: "error", message: tMessages("forbidden") };
  }

  const schema = createWorkingHoursSchema((key) => tValidation(key));
  const parsed = schema.safeParse({
    days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      isOpen: formData.get(`day-${dayOfWeek}-isOpen`) === "on",
      openTime: formData.get(`day-${dayOfWeek}-openTime`),
      closeTime: formData.get(`day-${dayOfWeek}-closeTime`),
    })),
  });

  if (!parsed.success) {
    const dayErrors: NonNullable<WorkingHoursActionState["dayErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const dayIndex = issue.path[1];
      if (typeof dayIndex === "number") {
        dayErrors[dayIndex] ??= issue.message;
      }
    }

    return {
      status: "error",
      message: tMessages("invalid"),
      dayErrors,
    };
  }

  const organizationId = identity.membership.organizationId;
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, organizationId, deletedAt: null },
    select: { id: true },
  });

  if (!branch) {
    return { status: "error", message: tMessages("notFound") };
  }

  try {
    await prisma.$transaction([
      prisma.businessHour.deleteMany({ where: { branchId } }),
      prisma.businessHour.createMany({
        data: parsed.data.days.map((day) => ({ ...day, branchId })),
      }),
    ]);
  } catch (error) {
    logServerError("workingHours.update", error, {
      branchId,
      organizationId,
    });
    return { status: "error", message: tMessages("failure") };
  }

  revalidatePath(`/business/manage/locations/${branchId}/hours`);
  return { status: "success", message: tMessages("success") };
}
