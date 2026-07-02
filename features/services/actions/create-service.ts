"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { canManageOrganization } from "@/features/business/policies/access";
import { requireBusinessIdentity } from "@/features/identity/server";
import { createServiceSchema } from "@/features/services/schemas/service";
import type {
  ServiceActionState,
  ServiceField,
} from "@/features/services/types";
import { prisma } from "@/lib/db/prisma";
import { logServerError } from "@/lib/logging/server";

const serviceFields: ReadonlySet<string> = new Set([
  "name",
  "description",
  "imageUrl",
  "categoryId",
  "status",
  "staffSelectionMode",
  "price",
  "durationMinutes",
  "pricingType",
  "branchIds",
  "memberIds",
]);

function getFieldErrors(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): ServiceActionState["fieldErrors"] {
  const errors: NonNullable<ServiceActionState["fieldErrors"]> = {};

  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && serviceFields.has(field)) {
      errors[field as ServiceField] ??= issue.message;
    }
  }

  return errors;
}

export async function createService(
  _previousState: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const [identity, tMessages, tValidation] = await Promise.all([
    requireBusinessIdentity(),
    getTranslations("Services.messages"),
    getTranslations("Validation"),
  ]);

  if (!canManageOrganization(identity.membership.role.systemRole)) {
    return { status: "error", message: tMessages("forbidden") };
  }

  const schema = createServiceSchema((key) => tValidation(key));
  const parsed = schema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    imageUrl: formData.get("imageUrl") ?? "",
    categoryId: formData.get("categoryId"),
    status: formData.get("status") ?? "ACTIVE",
    staffSelectionMode:
      formData.get("staffSelectionMode") ?? "OPTIONAL",
    price: formData.get("price"),
    durationMinutes: formData.get("durationMinutes"),
    pricingType: formData.get("pricingType"),
    branchIds: formData.getAll("branchIds"),
    memberIds: formData.getAll("memberIds"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: tMessages("invalid"),
      fieldErrors: getFieldErrors(parsed.error.issues),
    };
  }

  const { branchIds, memberIds, categoryId, ...serviceData } = parsed.data;
  const selectedMemberIds =
    serviceData.staffSelectionMode === "NONE" ? [] : memberIds;
  const organizationId = identity.membership.organizationId;
  const [category, branchCount, memberCount] = await Promise.all([
    prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    }),
    prisma.branch.count({
      where: {
        id: { in: branchIds },
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
      },
    }),
    prisma.organizationMember.count({
      where: { id: { in: selectedMemberIds }, organizationId },
    }),
  ]);

  if (
    !category ||
    branchCount !== branchIds.length ||
    memberCount !== selectedMemberIds.length
  ) {
    return { status: "error", message: tMessages("invalidReferences") };
  }

  try {
    await prisma.service.create({
      data: {
        organizationId,
        categoryId,
        name: serviceData.name,
        description: serviceData.description,
        imageUrl: serviceData.imageUrl,
        status: serviceData.status,
        staffSelectionMode: serviceData.staffSelectionMode,
        branchServices: {
          create: branchIds.map((branchId) => ({
            branchId,
            price: serviceData.price,
            durationMinutes: serviceData.durationMinutes,
            pricingType: serviceData.pricingType,
          })),
        },
        staffAssignments: {
          create: selectedMemberIds.map((memberId) => ({ memberId })),
        },
      },
    });
  } catch (error) {
    logServerError("service.create", error, { organizationId });
    return { status: "error", message: tMessages("failure") };
  }

  revalidatePath("/business/services");
  return { status: "success", message: tMessages("created") };
}

export async function updateService(
  serviceId: string,
  _previousState: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const [identity, tMessages, tValidation] = await Promise.all([
    requireBusinessIdentity(),
    getTranslations("Services.messages"),
    getTranslations("Validation"),
  ]);
  if (!canManageOrganization(identity.membership.role.systemRole)) {
    return { status: "error", message: tMessages("forbidden") };
  }

  const parsed = createServiceSchema((key) => tValidation(key)).safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    imageUrl: formData.get("imageUrl") ?? "",
    categoryId: formData.get("categoryId"),
    status: formData.get("status"),
    staffSelectionMode: formData.get("staffSelectionMode"),
    price: formData.get("price"),
    durationMinutes: formData.get("durationMinutes"),
    pricingType: formData.get("pricingType"),
    branchIds: formData.getAll("branchIds"),
    memberIds: formData.getAll("memberIds"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: tMessages("invalid"),
      fieldErrors: getFieldErrors(parsed.error.issues),
    };
  }

  const organizationId = identity.membership.organizationId;
  const {
    branchIds,
    memberIds,
    categoryId,
    price,
    durationMinutes,
    pricingType,
    ...data
  } = parsed.data;
  const selectedMemberIds =
    data.staffSelectionMode === "NONE" ? [] : memberIds;
  const [service, category, branchCount, memberCount] = await Promise.all([
    prisma.service.findFirst({
      where: { id: serviceId, organizationId },
      select: { id: true },
    }),
    prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    }),
    prisma.branch.count({
      where: {
        id: { in: branchIds },
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
      },
    }),
    prisma.organizationMember.count({
      where: { id: { in: selectedMemberIds }, organizationId },
    }),
  ]);
  if (!service) {
    return { status: "error", message: tMessages("notFound") };
  }
  if (
    !category ||
    branchCount !== branchIds.length ||
    memberCount !== selectedMemberIds.length
  ) {
    return { status: "error", message: tMessages("invalidReferences") };
  }

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.service.update({
        where: { id: service.id },
        data: { ...data, categoryId },
      });
      await transaction.branchService.updateMany({
        where: { serviceId: service.id, branchId: { notIn: branchIds } },
        data: { isAvailable: false },
      });
      await transaction.serviceStaffAssignment.deleteMany({
        where: { serviceId: service.id },
      });
      if (selectedMemberIds.length > 0) {
        await transaction.serviceStaffAssignment.createMany({
          data: selectedMemberIds.map((memberId) => ({
            serviceId: service.id,
            memberId,
          })),
        });
      }
      for (const branchId of branchIds) {
        await transaction.branchService.upsert({
          where: {
            branchId_serviceId: { branchId, serviceId: service.id },
          },
          create: {
            branchId,
            serviceId: service.id,
            price,
            durationMinutes,
            pricingType,
          },
          update: {
            price,
            durationMinutes,
            pricingType,
            isAvailable: true,
          },
        });
      }
    });
  } catch (error) {
    logServerError("service.update", error, {
      serviceId: service.id,
      organizationId,
    });
    return { status: "error", message: tMessages("failure") };
  }

  revalidatePath("/business/services");
  revalidatePath("/marketplace");
  return { status: "success", message: tMessages("updated") };
}
