import "server-only";

import { businessOperationsError } from "@/features/business-operations/domain/errors";
import {
  hashBusinessOperation,
  operationalSettingsSchema,
} from "@/features/business-operations/domain/validation";
import { recordBusinessOperation } from "@/features/business-operations/services/audit";
import {
  assertBusinessOperationActorCurrent,
  assertBusinessOperationMutationRate,
  assertRenderedOrganization,
  resolveBusinessOperationActor,
  type BusinessOperationActorReference,
} from "@/features/business-operations/services/context";
import {
  assertExpectedVersion,
  lockOrganization,
  resolveMutationReplay,
  runBusinessOperationTransaction,
} from "@/features/business-operations/services/transaction";
import { prisma } from "@/lib/db/prisma";

export async function readOperationalSettings(reference: BusinessOperationActorReference) {
  const actor = await resolveBusinessOperationActor(reference, "SETTINGS_READ");
  const [organization, settings] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: actor.organizationId },
      select: { id: true, name: true, updatedAt: true },
    }),
    prisma.organizationSettings.findUnique({ where: { organizationId: actor.organizationId } }),
  ]);
  return {
    bookingEnabled: settings?.bookingEnabled ?? true,
    cancellationWindowHours: settings?.cancellationWindowHours ?? 24,
    marketplaceVisible: settings?.marketplaceVisible ?? true,
    organizationId: organization.id,
    organizationName: organization.name,
    version: (settings?.updatedAt ?? organization.updatedAt).toISOString(),
  };
}

export async function updateOperationalSettings(input: {
  actor: BusinessOperationActorReference;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  settings: unknown;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "SETTINGS_WRITE");
  assertBusinessOperationMutationRate(actor, "settings-update");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const parsed = operationalSettingsSchema.safeParse(input.settings);
  if (!parsed.success) businessOperationsError("INVALID_REQUEST", "Operational settings are invalid.");
  const requestHash = hashBusinessOperation({ action: "SETTINGS_UPDATE", settings: parsed.data });

  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "SETTINGS_WRITE");
    const replay = await resolveMutationReplay(transaction, {
      actorMembershipId: actor.membershipId,
      idempotencyKey: input.idempotencyKey,
      organizationId: actor.organizationId,
      requestHash,
    });
    const [organization, current] = await Promise.all([
      transaction.organization.findUniqueOrThrow({ where: { id: actor.organizationId } }),
      transaction.organizationSettings.findUnique({ where: { organizationId: actor.organizationId } }),
    ]);
    if (replay) {
      if (!current || current.updatedAt.getTime() !== replay.resultVersion.getTime()) {
        businessOperationsError("STALE_VERSION", "A later settings change superseded this replay.");
      }
      return { replayed: true, version: current.updatedAt.toISOString(), ...parsed.data };
    }
    assertExpectedVersion(current?.updatedAt ?? organization.updatedAt, input.expectedVersion);
    const before = {
      bookingEnabled: current?.bookingEnabled ?? true,
      cancellationWindowHours: current?.cancellationWindowHours ?? 24,
      marketplaceVisible: current?.marketplaceVisible ?? true,
    };
    const updated = await transaction.organizationSettings.upsert({
      where: { organizationId: actor.organizationId },
      create: { organizationId: actor.organizationId, ...parsed.data },
      update: parsed.data,
    });
    await recordBusinessOperation(transaction, {
      action: "SETTINGS_UPDATE",
      actor,
      after: parsed.data,
      before,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: parsed.data,
      resultVersion: updated.updatedAt,
      targetId: updated.id,
      targetType: "OrganizationSettings",
    });
    return { replayed: false, version: updated.updatedAt.toISOString(), ...parsed.data };
  });
}
