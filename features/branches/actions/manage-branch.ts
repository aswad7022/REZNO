"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { canManageOrganization } from "@/features/business/policies/access";
import { createBranchSchema } from "@/features/branches/schemas/branch";
import type {
  BranchActionState,
  BranchField,
} from "@/features/branches/types";
import { requireBusinessIdentity } from "@/features/identity/server";
import { prisma } from "@/lib/db/prisma";
import { logServerError } from "@/lib/logging/server";

const branchFields: ReadonlySet<string> = new Set([
  "name",
  "phone",
  "email",
  "timezone",
  "addressLine1",
  "addressLine2",
  "city",
  "country",
  "latitude",
  "longitude",
  "locationLabel",
  "nearbyLandmark",
  "locationInstructions",
  "status",
]);

function slugify(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function getBranchFieldErrors(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): BranchActionState["fieldErrors"] {
  const errors: NonNullable<BranchActionState["fieldErrors"]> = {};

  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && branchFields.has(field)) {
      errors[field as BranchField] ??= issue.message;
    }
  }

  return errors;
}

async function getActionContext(formData: FormData) {
  const [identity, tMessages, tValidation] = await Promise.all([
    requireBusinessIdentity(),
    getTranslations("Branches.messages"),
    getTranslations("Validation"),
  ]);

  if (!canManageOrganization(identity.membership.role.systemRole)) {
    return {
      error: {
        status: "error",
        message: tMessages("forbidden"),
      } satisfies BranchActionState,
    };
  }

  const schema = createBranchSchema((key) => tValidation(key));
  const parsed = schema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    timezone: formData.get("timezone"),
    addressLine1: formData.get("addressLine1"),
    addressLine2: formData.get("addressLine2"),
    city: formData.get("city"),
    country: formData.get("country"),
    latitude: formData.get("latitude"),
    longitude: formData.get("longitude"),
    locationLabel: formData.get("locationLabel"),
    nearbyLandmark: formData.get("nearbyLandmark"),
    locationInstructions: formData.get("locationInstructions"),
    status: formData.get("status") ?? "ACTIVE",
  });

  if (!parsed.success) {
    return {
      error: {
        status: "error",
        message: tMessages("invalid"),
        fieldErrors: getBranchFieldErrors(parsed.error.issues),
      } satisfies BranchActionState,
    };
  }

  return {
    data: parsed.data,
    identity,
    tMessages,
  };
}

export async function createBranch(
  _previousState: BranchActionState,
  formData: FormData,
): Promise<BranchActionState> {
  const context = await getActionContext(formData);

  if (context.error) {
    return context.error;
  }

  const { data, identity, tMessages } = context;
  const slugBase = slugify(data.name) || "branch";
  const slug = `${slugBase}-${randomUUID().slice(0, 6)}`;

  try {
    await prisma.branch.create({
      data: {
        ...data,
        latitude: data.latitude,
        longitude: data.longitude,
        organizationId: identity.membership.organizationId,
        slug,
      },
    });
  } catch (error) {
    logServerError("branch.create", error, {
      organizationId: identity.membership.organizationId,
    });
    return { status: "error", message: tMessages("failure") };
  }

  revalidatePath("/business/manage/locations");
  return { status: "success", message: tMessages("created") };
}

export async function updateBranch(
  branchId: string,
  _previousState: BranchActionState,
  formData: FormData,
): Promise<BranchActionState> {
  const context = await getActionContext(formData);

  if (context.error) {
    return context.error;
  }

  const { data, identity, tMessages } = context;
  const organizationId = identity.membership.organizationId;

  if (data.status !== "ACTIVE") {
    const otherActiveBranches = await prisma.branch.count({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        id: { not: branchId },
      },
    });

    if (otherActiveBranches === 0) {
      return { status: "error", message: tMessages("lastActive") };
    }
  }

  try {
    const result = await prisma.branch.updateMany({
      where: {
        id: branchId,
        organizationId,
        deletedAt: null,
      },
      data,
    });

    if (result.count !== 1) {
      return { status: "error", message: tMessages("notFound") };
    }
  } catch (error) {
    logServerError("branch.update", error, {
      branchId,
      organizationId,
    });
    return { status: "error", message: tMessages("failure") };
  }

  revalidatePath("/business/manage/locations");
  return { status: "success", message: tMessages("updated") };
}
