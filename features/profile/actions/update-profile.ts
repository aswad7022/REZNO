"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { requireActiveIdentity } from "@/features/identity/server";
import { createProfileSchema } from "@/features/profile/schemas/profile";
import type { ProfileActionState } from "@/features/profile/types";
import { prisma } from "@/lib/db/prisma";
import { logServerError } from "@/lib/logging/server";
import type { DashboardRole } from "@/types/dashboard";

function fieldErrors(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): ProfileActionState["fieldErrors"] {
  const errors: NonNullable<ProfileActionState["fieldErrors"]> = {};

  for (const issue of issues) {
    const field = issue.path[0];
    if (
      field === "firstName" ||
      field === "lastName" ||
      field === "displayName" ||
      field === "phone"
    ) {
      errors[field] ??= issue.message;
    }
  }

  return errors;
}

export async function updateProfile(
  role: DashboardRole,
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const [{ person, session }, t] = await Promise.all([
    requireActiveIdentity(),
    getTranslations("Profile"),
  ]);

  const allowed = new Set(["firstName", "lastName", "displayName", "phone"]);
  if ([...formData.keys()].some((key) => !key.startsWith("$ACTION_") && !allowed.has(key))) {
    return { status: "error", message: t("messages.invalid") };
  }

  const parsed = createProfileSchema((key) => t(`validation.${key}`)).safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    displayName: formData.get("displayName"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: t("messages.invalid"),
      fieldErrors: fieldErrors(parsed.error.issues),
    };
  }

  const { firstName, lastName, displayName, phone } = parsed.data;
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.user.id },
        data: { name: displayName ?? fullName },
      }),
      prisma.person.update({
        where: { id: person.id },
        data: {
          firstName,
          lastName,
          displayName,
          phone,
        },
      }),
    ]);
  } catch (error) {
    logServerError("profile.update", error, {
      personId: person.id,
      userId: session.user.id,
    });
    return {
      status: "error",
      message: t("messages.failure"),
    };
  }

  revalidatePath(`/${role}`, "layout");

  return {
    status: "success",
    message: t("messages.success"),
  };
}
