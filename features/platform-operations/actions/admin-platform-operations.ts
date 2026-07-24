"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminPermission } from "@/features/admin/services/admin-auth";
import { platformJobAdminContext } from "@/features/platform-jobs/services/admin-context";
import {
  bootstrapPlatformSchedules,
  initializePlatformRuntime,
  setPlatformRuntimeEnabled,
} from "@/features/platform-operations/services/admin";
import {
  acknowledgePlatformAlert,
  acknowledgePlatformIncident,
  createPlatformIncident,
  resolvePlatformAlert,
  resolvePlatformIncident,
} from "@/features/platform-operations/services/lifecycle";

const uuid = z.string().uuid();
const versioned = z.object({
  expectedVersion: z.coerce.number().int().min(1).max(2_147_483_647),
  idempotencyKey: uuid,
  targetId: uuid,
});

export async function initializePlatformRuntimeAction(formData: FormData) {
  const access = await requireAdminPermission("PLATFORM_OPERATIONS_MANAGE");
  const idempotencyKey = uuid.parse(formData.get("idempotencyKey"));
  await initializePlatformRuntime(platformJobAdminContext(access), idempotencyKey);
  refresh();
}

export async function setPlatformRuntimeStateAction(formData: FormData) {
  const access = await requireAdminPermission("PLATFORM_OPERATIONS_MANAGE");
  const input = z.object({
    enabled: z.enum(["true", "false"]),
    expectedVersion: z.coerce.number().int().min(1).max(2_147_483_647),
    idempotencyKey: uuid,
  }).parse({
    enabled: formData.get("enabled"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  await setPlatformRuntimeEnabled(platformJobAdminContext(access), {
    ...input,
    enabled: input.enabled === "true",
  });
  refresh();
}

export async function bootstrapPlatformSchedulesAction(formData: FormData) {
  const access = await requireAdminPermission("PLATFORM_OPERATIONS_MANAGE");
  const idempotencyKey = uuid.parse(formData.get("idempotencyKey"));
  await bootstrapPlatformSchedules(
    platformJobAdminContext(access),
    idempotencyKey,
  );
  refresh();
}

export async function acknowledgePlatformAlertAction(formData: FormData) {
  return alertAction(formData, acknowledgePlatformAlert);
}

export async function resolvePlatformAlertAction(formData: FormData) {
  return alertAction(formData, resolvePlatformAlert);
}

export async function createPlatformIncidentAction(formData: FormData) {
  return alertAction(formData, createPlatformIncident);
}

export async function acknowledgePlatformIncidentAction(formData: FormData) {
  return incidentAction(formData, acknowledgePlatformIncident);
}

export async function resolvePlatformIncidentAction(formData: FormData) {
  return incidentAction(formData, resolvePlatformIncident);
}

async function alertAction(
  formData: FormData,
  operation:
    | typeof acknowledgePlatformAlert
    | typeof resolvePlatformAlert
    | typeof createPlatformIncident,
) {
  const access = await requireAdminPermission("PLATFORM_OPERATIONS_MANAGE");
  const input = versioned.parse({
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
    targetId: formData.get("alertId"),
  });
  await operation(platformJobAdminContext(access), input);
  refresh();
}

async function incidentAction(
  formData: FormData,
  operation:
    | typeof acknowledgePlatformIncident
    | typeof resolvePlatformIncident,
) {
  const access = await requireAdminPermission("PLATFORM_OPERATIONS_MANAGE");
  const input = versioned.parse({
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
    targetId: formData.get("incidentId"),
  });
  await operation(platformJobAdminContext(access), input);
  refresh();
}

function refresh() {
  revalidatePath("/admin/platform-operations");
  revalidatePath("/admin/platform-jobs");
}
