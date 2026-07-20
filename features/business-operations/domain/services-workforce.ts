import type { SystemRole } from "@prisma/client";
import { z } from "zod";

import { operationalHoursSchema } from "@/features/business-operations/domain/validation";

const nullableText = (maximum: number) =>
  z.string().trim().max(maximum).transform((value) => value || null);

export const operationalServiceSchema = z.object({
  categoryId: z.string().uuid(),
  description: nullableText(2000),
  name: z.string().trim().min(2).max(120),
  staffSelectionMode: z.enum(["NONE", "OPTIONAL", "REQUIRED"]),
}).strict();

const decimalString = z.string().trim().regex(/^\d{1,8}(?:\.\d{1,2})?$/);

export const operationalOfferingSchema = z.object({
  durationMinutes: z.number().int().min(5).max(1440),
  price: decimalString.refine((value) => Number(value) > 0),
  pricingType: z.enum(["FIXED", "STARTING_FROM"]),
}).strict();

export const operationalInvitationSchema = z.object({
  email: z.string().trim().email().max(320),
  expiresAt: z.string().datetime({ offset: true }),
  systemRole: z.enum(["MANAGER", "RECEPTIONIST", "STAFF"]),
}).strict();

export const operationalMemberProfileSchema = z.object({
  bio: nullableText(1000),
  isPublicProfessional: z.boolean(),
  publicSlug: z.string().trim().toLowerCase().max(80).regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  ).nullable(),
  specialties: z.array(z.string().trim().min(1).max(80)).max(30)
    .transform((items) => [...new Set(items)]),
}).strict().superRefine((value, context) => {
  if (value.isPublicProfessional && !value.publicSlug) {
    context.addIssue({ code: "custom", path: ["publicSlug"], message: "A public slug is required." });
  }
});

export const operationalStaffScheduleSchema = operationalHoursSchema;

export const operationalMemberBlockSchema = z.object({
  branchId: z.string().uuid(),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  reason: z.string().trim().max(500).transform((value) => value || null),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
}).strict();

export const ASSIGNABLE_ROLES = ["MANAGER", "RECEPTIONIST", "STAFF"] as const;

export function canInviteRole(actorRole: SystemRole, targetRole: SystemRole) {
  if (targetRole === "OWNER") return false;
  return actorRole === "OWNER"
    ? targetRole === "MANAGER" || targetRole === "RECEPTIONIST" || targetRole === "STAFF"
    : actorRole === "MANAGER" && (targetRole === "RECEPTIONIST" || targetRole === "STAFF");
}

export function canManageWorkforceRole(
  actorRole: SystemRole,
  targetRole: SystemRole | null,
) {
  if (!targetRole || targetRole === "OWNER") return false;
  return actorRole === "OWNER"
    ? targetRole === "MANAGER" || targetRole === "RECEPTIONIST" || targetRole === "STAFF"
    : actorRole === "MANAGER" && (targetRole === "RECEPTIONIST" || targetRole === "STAFF");
}

export function canAssignRole(
  actorRole: SystemRole,
  currentRole: SystemRole | null,
  nextRole: SystemRole,
) {
  return canManageWorkforceRole(actorRole, currentRole) && canInviteRole(actorRole, nextRole);
}

export function invitationExpiresAtIsAllowed(expiresAt: Date, now = new Date()) {
  const duration = expiresAt.getTime() - now.getTime();
  return duration >= 60 * 60_000 && duration <= 30 * 86_400_000;
}

export function scheduleVersion(
  rows: ReadonlyArray<{
    dayOfWeek: number;
    endTime: string;
    isActive: boolean;
    startTime: string;
    updatedAt: Date;
  }>,
) {
  if (rows.length === 0) return "1970-01-01T00:00:00.000Z";
  return rows.reduce(
    (latest, row) => row.updatedAt > latest ? row.updatedAt : latest,
    rows[0]!.updatedAt,
  ).toISOString();
}
