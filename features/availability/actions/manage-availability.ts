"use server";

import { TZDate } from "@date-fns/tz";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { canManageOrganization } from "@/features/business/policies/access";
import { requireBusinessIdentity } from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";
import { logServerError } from "@/lib/logging/server";
import { createWorkingHoursSchema } from "@/features/working-hours/schemas/working-hours";
import type {
  AvailabilityActionState,
  BlockedTimeActionState,
} from "@/features/availability/types";

function localDateTimeToDate(value: string, timezone: string): Date | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return new Date(
    new TZDate(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      timezone,
    ),
  );
}

async function requireScheduleContext(memberId: string, branchId: string) {
  const identity = await requireBusinessIdentity();
  const organizationId = identity.membership.organizationId;
  const assignment = await prisma.branchAssignment.findFirst({
    where: {
      memberId,
      branchId,
      member: { organizationId },
      branch: { organizationId, deletedAt: null },
    },
    include: { branch: true },
  });

  return {
    identity,
    assignment,
    canEdit:
      canManageOrganization(identity.membership.role.systemRole) ||
      (identity.membership.role.systemRole === "STAFF" &&
        identity.membership.id === memberId),
  };
}

export async function updateMemberAvailability(
  memberId: string,
  branchId: string,
  _previousState: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  const [context, tMessages, tValidation] = await Promise.all([
    requireScheduleContext(memberId, branchId),
    getTranslations("Availability.messages"),
    getTranslations("Validation"),
  ]);

  if (!context.canEdit) {
    return { status: "error", message: tMessages("forbidden") };
  }
  if (!context.assignment) {
    return { status: "error", message: tMessages("notFound") };
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
    const dayErrors: NonNullable<AvailabilityActionState["dayErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const dayIndex = issue.path[1];
      if (typeof dayIndex === "number") dayErrors[dayIndex] ??= issue.message;
    }
    return {
      status: "error",
      message: tMessages("invalid"),
      dayErrors,
    };
  }

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.availability.deleteMany({
        where: { memberId, branchId },
      });
      const openDays = parsed.data.days.filter((day) => day.isOpen);
      if (openDays.length > 0) {
        await transaction.availability.createMany({
          data: openDays.map((day) => ({
            memberId,
            branchId,
            dayOfWeek: day.dayOfWeek,
            startTime: day.openTime,
            endTime: day.closeTime,
          })),
        });
      }
    });
  } catch (error) {
    logServerError("availability.update", error, { memberId, branchId });
    return { status: "error", message: tMessages("failure") };
  }

  revalidatePath(`/business/team/${memberId}/availability`);
  return { status: "success", message: tMessages("success") };
}

export async function createBlockedTime(
  memberId: string,
  _previousState: BlockedTimeActionState,
  formData: FormData,
): Promise<BlockedTimeActionState> {
  const [tMessages, tValidation] = await Promise.all([
    getTranslations("BlockedTime.messages"),
    getTranslations("Validation"),
  ]);
  const input = z
    .object({
      branchId: z.string().uuid(tValidation("branchSelectionInvalid")),
      startsAt: z.string().min(1, tValidation("dateTimeInvalid")),
      endsAt: z.string().min(1, tValidation("dateTimeInvalid")),
      reason: z.string().trim().max(500).transform((value) => value || null),
    })
    .safeParse({
      branchId: formData.get("branchId"),
      startsAt: formData.get("startsAt"),
      endsAt: formData.get("endsAt"),
      reason: formData.get("reason") ?? "",
    });

  if (!input.success) {
    const errors = input.error.flatten().fieldErrors;
    return {
      status: "error",
      message: tMessages("invalid"),
      fieldErrors: {
        branchId: errors.branchId?.[0],
        startsAt: errors.startsAt?.[0],
        endsAt: errors.endsAt?.[0],
        reason: errors.reason?.[0],
      },
    };
  }

  const context = await requireScheduleContext(memberId, input.data.branchId);
  if (!context.canEdit) {
    return { status: "error", message: tMessages("forbidden") };
  }
  if (!context.assignment) {
    return { status: "error", message: tMessages("notFound") };
  }

  const startsAt = localDateTimeToDate(
    input.data.startsAt,
    context.assignment.branch.timezone,
  );
  const endsAt = localDateTimeToDate(
    input.data.endsAt,
    context.assignment.branch.timezone,
  );
  if (!startsAt || !endsAt || startsAt >= endsAt) {
    return { status: "error", message: tMessages("rangeInvalid") };
  }

  try {
    await prisma.blockedTime.create({
      data: {
        memberId,
        branchId: input.data.branchId,
        startsAt,
        endsAt,
        reason: input.data.reason,
      },
    });
  } catch (error) {
    logServerError("blockedTime.create", error, {
      memberId,
      branchId: input.data.branchId,
    });
    return { status: "error", message: tMessages("failure") };
  }

  revalidatePath(`/business/team/${memberId}/availability`);
  return { status: "success", message: tMessages("success") };
}

export async function deleteBlockedTime(
  memberId: string,
  blockedTimeId: string,
): Promise<void> {
  const identity = await requireBusinessIdentity();
  if (!canManageOrganization(identity.membership.role.systemRole)) return;

  await prisma.blockedTime.deleteMany({
    where: {
      id: blockedTimeId,
      memberId,
      member: { organizationId: identity.membership.organizationId },
    },
  });
  revalidatePath(`/business/team/${memberId}/availability`);
}
