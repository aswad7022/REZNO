"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { BusinessVertical, EntityStatus } from "@prisma/client";

import { logAdminAuditEvent } from "@/features/admin/services/admin-audit";
import { requireAdminPermission } from "@/features/admin/services/admin-auth";
import { businessVerticals } from "@/features/businesses/config/verticals";
import { prisma } from "@/lib/db/prisma";
import { logServerError } from "@/lib/logging/server";

const entityStatuses = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;

const businessUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  businessPhone: z.string().trim().max(40).optional().or(z.literal("")),
  businessEmail: z.string().trim().email().max(160).optional().or(z.literal("")),
  businessCategory: z.string().trim().max(120).optional().or(z.literal("")),
  vertical: z.enum(businessVerticals),
  marketplaceVisible: z
    .enum(["on"])
    .optional()
    .transform((value) => value === "on"),
});

const businessStatusSchema = z.object({
  status: z.enum(entityStatuses),
});

const businessVerificationSchema = z.object({
  verified: z.enum(["true", "false"]).transform((value) => value === "true"),
});

const userUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional().or(z.literal("")),
  displayName: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});

const userStatusSchema = z.object({
  status: z.enum(entityStatuses),
});

function cleanOptional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function adminRedirect(path: string, result: "success" | "error"): never {
  redirect(`${path}?adminAction=${result}`);
}

export async function updateAdminBusiness(
  businessId: string,
  formData: FormData,
) {
  const identity = (await requireAdminPermission("BUSINESSES_MANAGE")).identity;
  const parsed = businessUpdateSchema.safeParse(Object.fromEntries(formData));
  const path = `/admin/businesses/${businessId}`;

  if (!parsed.success) {
    adminRedirect(path, "error");
  }

  const business = await prisma.organization.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, vertical: true, deletedAt: true },
  });

  if (!business || business.deletedAt) {
    adminRedirect("/admin/businesses", "error");
  }

  try {
    await prisma.$transaction([
      prisma.organization.update({
        where: { id: business.id },
        data: {
          name: parsed.data.name,
          vertical: parsed.data.vertical as BusinessVertical,
          settings: {
            upsert: {
              create: { marketplaceVisible: parsed.data.marketplaceVisible },
              update: { marketplaceVisible: parsed.data.marketplaceVisible },
            },
          },
          profile: {
            upsert: {
              create: {
                description: cleanOptional(parsed.data.description),
                businessPhone: cleanOptional(parsed.data.businessPhone),
                businessEmail: cleanOptional(parsed.data.businessEmail),
                businessCategory: cleanOptional(parsed.data.businessCategory),
              },
              update: {
                description: cleanOptional(parsed.data.description),
                businessPhone: cleanOptional(parsed.data.businessPhone),
                businessEmail: cleanOptional(parsed.data.businessEmail),
                businessCategory: cleanOptional(parsed.data.businessCategory),
              },
            },
          },
        },
      }),
    ]);

    await logAdminAuditEvent({
      adminUserId: identity.session.user.id,
      action: "admin.business.update",
      targetType: "business",
      targetId: business.id,
      metadata: {
        previousName: business.name,
        previousVertical: business.vertical,
        nextVertical: parsed.data.vertical,
      },
    });
  } catch (error) {
    logServerError("admin.business.update", error, { businessId });
    adminRedirect(path, "error");
  }

  revalidatePath(path);
  revalidatePath("/admin/businesses");
  adminRedirect(path, "success");
}

export async function updateAdminBusinessStatus(
  businessId: string,
  formData: FormData,
) {
  const identity = (await requireAdminPermission("BUSINESSES_MANAGE")).identity;
  const parsed = businessStatusSchema.safeParse(Object.fromEntries(formData));
  const path = `/admin/businesses/${businessId}`;

  if (!parsed.success) {
    adminRedirect(path, "error");
  }

  const business = await prisma.organization.findUnique({
    where: { id: businessId },
    select: { id: true, status: true, deletedAt: true },
  });

  if (!business || business.deletedAt) {
    adminRedirect("/admin/businesses", "error");
  }

  const status = parsed.data.status as EntityStatus;

  try {
    await prisma.organization.update({
      where: { id: business.id },
      data: {
        status,
        isActive: status === "ACTIVE",
      },
    });

    await logAdminAuditEvent({
      adminUserId: identity.session.user.id,
      action:
        status === "ACTIVE"
          ? "admin.business.reactivate"
          : status === "INACTIVE"
            ? "admin.business.suspend"
            : "admin.business.archive",
      targetType: "business",
      targetId: business.id,
      metadata: { previousStatus: business.status, nextStatus: status },
    });
  } catch (error) {
    logServerError("admin.business.status", error, { businessId });
    adminRedirect(path, "error");
  }

  revalidatePath(path);
  revalidatePath("/admin/businesses");
  adminRedirect(path, "success");
}

export async function updateAdminBusinessVerification(
  businessId: string,
  formData: FormData,
) {
  const identity = (await requireAdminPermission("BUSINESSES_MANAGE")).identity;
  const parsed = businessVerificationSchema.safeParse(
    Object.fromEntries(formData),
  );
  const path = `/admin/businesses/${businessId}`;

  if (!parsed.success) {
    adminRedirect(path, "error");
  }

  const business = await prisma.organization.findUnique({
    where: { id: businessId },
    select: { id: true, isVerified: true, deletedAt: true },
  });

  if (!business || business.deletedAt) {
    adminRedirect("/admin/businesses", "error");
  }

  try {
    await prisma.organization.update({
      where: { id: business.id },
      data: { isVerified: parsed.data.verified },
    });

    await logAdminAuditEvent({
      adminUserId: identity.session.user.id,
      action: parsed.data.verified
        ? "admin.business.verify"
        : "admin.business.unverify",
      targetType: "business",
      targetId: business.id,
      metadata: {
        previousVerified: business.isVerified,
        nextVerified: parsed.data.verified,
      },
    });
  } catch (error) {
    logServerError("admin.business.verify", error, { businessId });
    adminRedirect(path, "error");
  }

  revalidatePath(path);
  revalidatePath("/admin/businesses");
  adminRedirect(path, "success");
}

export async function updateAdminUser(personId: string, formData: FormData) {
  const identity = (await requireAdminPermission("USERS_MANAGE")).identity;
  const parsed = userUpdateSchema.safeParse(Object.fromEntries(formData));
  const path = `/admin/users/${personId}`;

  if (!parsed.success) {
    adminRedirect(path, "error");
  }

  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true, authUserId: true, deletedAt: true },
  });

  if (!person || person.deletedAt) {
    adminRedirect("/admin/users", "error");
  }

  try {
    await prisma.person.update({
      where: { id: person.id },
      data: {
        firstName: parsed.data.firstName,
        lastName: cleanOptional(parsed.data.lastName),
        displayName: cleanOptional(parsed.data.displayName),
        phone: cleanOptional(parsed.data.phone),
      },
    });

    await logAdminAuditEvent({
      adminUserId: identity.session.user.id,
      action: "admin.user.update",
      targetType: "person",
      targetId: person.id,
    });
  } catch (error) {
    logServerError("admin.user.update", error, { personId });
    adminRedirect(path, "error");
  }

  revalidatePath(path);
  revalidatePath("/admin/users");
  adminRedirect(path, "success");
}

export async function updateAdminUserStatus(
  personId: string,
  formData: FormData,
) {
  const identity = (await requireAdminPermission("USERS_MANAGE")).identity;
  const parsed = userStatusSchema.safeParse(Object.fromEntries(formData));
  const path = `/admin/users/${personId}`;

  if (!parsed.success) {
    adminRedirect(path, "error");
  }

  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true, authUserId: true, status: true, deletedAt: true },
  });

  if (!person || person.deletedAt) {
    adminRedirect("/admin/users", "error");
  }

  if (person.authUserId === identity.session.user.id) {
    adminRedirect(path, "error");
  }

  const status = parsed.data.status as EntityStatus;

  try {
    await prisma.person.update({
      where: { id: person.id },
      data: { status },
    });

    await logAdminAuditEvent({
      adminUserId: identity.session.user.id,
      action:
        status === "ACTIVE"
          ? "admin.user.reactivate"
          : status === "INACTIVE"
            ? "admin.user.suspend"
            : "admin.user.archive",
      targetType: "person",
      targetId: person.id,
      metadata: { previousStatus: person.status, nextStatus: status },
    });
  } catch (error) {
    logServerError("admin.user.status", error, { personId });
    adminRedirect(path, "error");
  }

  revalidatePath(path);
  revalidatePath("/admin/users");
  adminRedirect(path, "success");
}
