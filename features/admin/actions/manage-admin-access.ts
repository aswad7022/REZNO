"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  adminPermissions,
  invalidAdminPermissionDependencies,
  normalizeAdminPermissions,
} from "@/features/admin/config/permissions";
import { logAdminAuditEvent } from "@/features/admin/services/admin-audit";
import { requireSuperAdmin } from "@/features/admin/services/admin-auth";
import { prisma } from "@/lib/db/prisma";
import { logServerError } from "@/lib/logging/server";

const adminAccessSchema = z.object({
  userId: z.string().min(1),
  permissions: z
    .array(z.enum(adminPermissions))
    .or(z.enum(adminPermissions).transform((value) => [value]))
    .optional()
    .default([]),
});

const statusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]),
});

function resultRedirect(result: "success" | "error"): never {
  redirect(`/admin/access?adminAction=${result}`);
}

function getPermissionValues(formData: FormData) {
  return formData.getAll("permissions").flatMap((value) =>
    typeof value === "string" ? [value] : [],
  );
}

async function ensureTargetUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
}

async function isTargetPersonActive(userId: string) {
  const person = await prisma.person.findUnique({
    where: { authUserId: userId },
    select: { deletedAt: true, status: true },
  });

  return Boolean(person && !person.deletedAt && person.status === "ACTIVE");
}

export async function grantAdminAccess(formData: FormData) {
  const admin = await requireSuperAdmin();
  const parsed = adminAccessSchema.safeParse({
    userId: formData.get("userId"),
    permissions: getPermissionValues(formData),
  });

  if (!parsed.success) {
    resultRedirect("error");
  }

  if (parsed.data.userId === admin.identity.session.user.id) {
    resultRedirect("error");
  }

  const target = await ensureTargetUser(parsed.data.userId);
  if (!target || !(await isTargetPersonActive(target.id))) {
    resultRedirect("error");
  }

  const permissions = normalizeAdminPermissions(parsed.data.permissions);
  if (invalidAdminPermissionDependencies(permissions).length > 0) {
    resultRedirect("error");
  }

  try {
    await prisma.adminAccess.upsert({
      where: { userId: target.id },
      create: {
        userId: target.id,
        role: "ADMIN",
        status: "ACTIVE",
        permissions,
        grantedById: admin.identity.session.user.id,
      },
      update: {
        role: "ADMIN",
        status: "ACTIVE",
        permissions,
        grantedById: admin.identity.session.user.id,
      },
    });

    await logAdminAuditEvent({
      adminUserId: admin.identity.session.user.id,
      action: "admin.access.grant",
      targetType: "user",
      targetId: target.id,
      metadata: { permissions },
    });
  } catch (error) {
    logServerError("admin.access.grant", error, { userId: target.id });
    resultRedirect("error");
  }

  revalidatePath("/admin/access");
  resultRedirect("success");
}

export async function updateAdminAccess(accessId: string, formData: FormData) {
  const admin = await requireSuperAdmin();
  const permissions = normalizeAdminPermissions(getPermissionValues(formData));
  if (invalidAdminPermissionDependencies(permissions).length > 0) {
    resultRedirect("error");
  }
  const access = await prisma.adminAccess.findUnique({
    where: { id: accessId },
    select: { id: true, userId: true, role: true, permissions: true },
  });

  if (!access || access.userId === admin.identity.session.user.id) {
    resultRedirect("error");
  }

  try {
    await prisma.adminAccess.update({
      where: { id: access.id },
      data: { permissions },
    });

    await logAdminAuditEvent({
      adminUserId: admin.identity.session.user.id,
      action: "admin.access.update",
      targetType: "adminAccess",
      targetId: access.id,
      metadata: {
        userId: access.userId,
        previousPermissions: access.permissions,
        nextPermissions: permissions,
      },
    });
  } catch (error) {
    logServerError("admin.access.update", error, { accessId });
    resultRedirect("error");
  }

  revalidatePath("/admin/access");
  resultRedirect("success");
}

export async function updateAdminAccessStatus(
  accessId: string,
  formData: FormData,
) {
  const admin = await requireSuperAdmin();
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    resultRedirect("error");
  }

  const access = await prisma.adminAccess.findUnique({
    where: { id: accessId },
    select: { id: true, userId: true, status: true, role: true },
  });

  if (!access || access.userId === admin.identity.session.user.id) {
    resultRedirect("error");
  }

  const nextStatus = parsed.data.status;

  try {
    await prisma.adminAccess.update({
      where: { id: access.id },
      data: { status: nextStatus },
    });

    await logAdminAuditEvent({
      adminUserId: admin.identity.session.user.id,
      action:
        nextStatus === "ACTIVE"
          ? "admin.access.reactivate"
          : nextStatus === "SUSPENDED"
            ? "admin.access.suspend"
            : "admin.access.revoke",
      targetType: "adminAccess",
      targetId: access.id,
      metadata: {
        userId: access.userId,
        previousStatus: access.status,
        nextStatus,
      },
    });
  } catch (error) {
    logServerError("admin.access.status", error, { accessId });
    resultRedirect("error");
  }

  revalidatePath("/admin/access");
  resultRedirect("success");
}
