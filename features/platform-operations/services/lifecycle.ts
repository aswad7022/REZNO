import "server-only";

import { Prisma } from "@prisma/client";

import { platformJobHash } from "@/features/platform-jobs/domain/canonical";
import { platformJobError } from "@/features/platform-jobs/domain/errors";
import {
  assertPlatformJobAdminCurrent,
  type PlatformJobAdminContext,
} from "@/features/platform-jobs/services/admin-context";
import { runPlatformJobSerializable } from "@/features/platform-jobs/services/transaction";
import { lockPlatformOperationMutationKey } from "@/features/platform-operations/services/mutation-lock";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function acknowledgePlatformAlert(
  context: PlatformJobAdminContext,
  input: VersionedTarget,
) {
  return alertMutation(context, input, "ALERT_ACKNOWLEDGE");
}

export async function resolvePlatformAlert(
  context: PlatformJobAdminContext,
  input: VersionedTarget,
) {
  return alertMutation(context, input, "ALERT_RESOLVE");
}

export async function createPlatformIncident(
  context: PlatformJobAdminContext,
  input: VersionedTarget,
) {
  validate(input);
  return runPlatformJobSerializable(async (transaction) => {
    const current = await assertPlatformJobAdminCurrent(
      transaction,
      context,
      "PLATFORM_OPERATIONS_MANAGE",
    );
    const action = "INCIDENT_CREATE";
    const requestHash = platformJobHash({
      action,
      alertId: input.targetId,
      expectedVersion: input.expectedVersion,
    });
    await lockPlatformOperationMutationKey(
      transaction,
      current.userId,
      input.idempotencyKey,
    );
    const replay = await mutationReplay(
      transaction,
      current.userId,
      input.idempotencyKey,
      action,
      requestHash,
    );
    if (replay) return replay;
    await lockAlert(transaction, input.targetId);
    const alert = await transaction.platformAlert.findUnique({
      where: { id: input.targetId },
    });
    if (!alert) platformJobError("NOT_FOUND", "The platform alert was not found.");
    if (alert.version !== input.expectedVersion) {
      platformJobError("CONFLICT", "The platform alert version is stale.");
    }
    const existing = await transaction.platformIncident.findUnique({
      where: { sourceAlertId: alert.id },
    });
    if (existing) {
      platformJobError("CONFLICT", "The platform alert already has an incident.");
    }
    const [clock] = await transaction.$queryRaw<Array<{ now: Date }>>(
      Prisma.sql`SELECT clock_timestamp() AS now`,
    );
    if (!clock?.now) {
      platformJobError("PLATFORM_JOB_FAILURE", "The database clock is unavailable.");
    }
    const incident = await transaction.platformIncident.create({
      data: {
        deduplicationKey: `incident:${alert.deduplicationKey}`,
        domain: alert.domain,
        severity: alert.severity,
        sourceAlertId: alert.id,
        summaryCode: alert.summaryCode,
      },
    });
    await transaction.platformIncidentHistory.create({
      data: {
        actorAdminUserId: current.userId,
        actorPersonId: current.personId,
        event: "CREATED",
        fromState: null,
        incidentId: incident.id,
        metadata: { alertId: alert.id },
        source: "ADMIN",
        toState: "OPEN",
      },
    });
    const result = lifecycleResult(incident);
    await transaction.platformOperationMutation.create({
      data: {
        action,
        actorAdminUserId: current.userId,
        actorPersonId: current.personId,
        idempotencyKey: input.idempotencyKey,
        incidentId: incident.id,
        requestHash,
        result,
      },
    });
    return { ...result, replay: false as const };
  });
}

export async function acknowledgePlatformIncident(
  context: PlatformJobAdminContext,
  input: VersionedTarget,
) {
  return incidentMutation(context, input, "INCIDENT_ACKNOWLEDGE");
}

export async function resolvePlatformIncident(
  context: PlatformJobAdminContext,
  input: VersionedTarget,
) {
  return incidentMutation(context, input, "INCIDENT_RESOLVE");
}

interface VersionedTarget {
  expectedVersion: number;
  idempotencyKey: string;
  targetId: string;
}

async function alertMutation(
  context: PlatformJobAdminContext,
  input: VersionedTarget,
  action: "ALERT_ACKNOWLEDGE" | "ALERT_RESOLVE",
) {
  validate(input);
  return runPlatformJobSerializable(async (transaction) => {
    const current = await assertPlatformJobAdminCurrent(
      transaction,
      context,
      "PLATFORM_OPERATIONS_MANAGE",
    );
    const requestHash = platformJobHash({
      action,
      alertId: input.targetId,
      expectedVersion: input.expectedVersion,
    });
    await lockPlatformOperationMutationKey(
      transaction,
      current.userId,
      input.idempotencyKey,
    );
    const replay = await mutationReplay(
      transaction,
      current.userId,
      input.idempotencyKey,
      action,
      requestHash,
    );
    if (replay) return replay;
    await lockAlert(transaction, input.targetId);
    const alert = await transaction.platformAlert.findUnique({
      where: { id: input.targetId },
    });
    if (!alert) platformJobError("NOT_FOUND", "The platform alert was not found.");
    if (alert.version !== input.expectedVersion) {
      platformJobError("CONFLICT", "The platform alert version is stale.");
    }
    if (
      (action === "ALERT_ACKNOWLEDGE" && alert.state !== "OPEN")
      || (action === "ALERT_RESOLVE" && alert.state === "RESOLVED")
    ) {
      platformJobError("CONFLICT", "The platform alert transition is invalid.");
    }
    const [clock] = await transaction.$queryRaw<Array<{ now: Date }>>(
      Prisma.sql`SELECT clock_timestamp() AS now`,
    );
    if (!clock?.now) {
      platformJobError("PLATFORM_JOB_FAILURE", "The database clock is unavailable.");
    }
    const resolving = action === "ALERT_RESOLVE";
    const alertUpdated = await transaction.platformAlert.update({
      where: { id: alert.id },
      data: resolving
        ? {
            resolvedAt: clock.now,
            resolvedByAdminId: current.userId,
            resolvedByPersonId: current.personId,
            resolvedByRuntimeInvocationId: null,
            state: "RESOLVED",
            version: { increment: 1 },
          }
        : {
            acknowledgedAt: clock.now,
            acknowledgedByAdminId: current.userId,
            acknowledgedByPersonId: current.personId,
            state: "ACKNOWLEDGED",
            version: { increment: 1 },
          },
    });
    await transaction.platformAlertHistory.create({
      data: {
        actorAdminUserId: current.userId,
        actorPersonId: current.personId,
        alertId: alert.id,
        event: resolving ? "RESOLVED" : "ACKNOWLEDGED",
        fromState: alert.state,
        metadata: { source: "admin_operation" },
        source: "ADMIN",
        toState: alertUpdated.state,
      },
    });
    const result = lifecycleResult(alertUpdated);
    await transaction.platformOperationMutation.create({
      data: {
        action,
        actorAdminUserId: current.userId,
        actorPersonId: current.personId,
        alertId: alert.id,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        result,
      },
    });
    return { ...result, replay: false as const };
  });
}

async function incidentMutation(
  context: PlatformJobAdminContext,
  input: VersionedTarget,
  action: "INCIDENT_ACKNOWLEDGE" | "INCIDENT_RESOLVE",
) {
  validate(input);
  return runPlatformJobSerializable(async (transaction) => {
    const current = await assertPlatformJobAdminCurrent(
      transaction,
      context,
      "PLATFORM_OPERATIONS_MANAGE",
    );
    const requestHash = platformJobHash({
      action,
      expectedVersion: input.expectedVersion,
      incidentId: input.targetId,
    });
    await lockPlatformOperationMutationKey(
      transaction,
      current.userId,
      input.idempotencyKey,
    );
    const replay = await mutationReplay(
      transaction,
      current.userId,
      input.idempotencyKey,
      action,
      requestHash,
    );
    if (replay) return replay;
    await transaction.$queryRaw(Prisma.sql`
      SELECT incident."id"
      FROM "PlatformIncident" AS incident
      WHERE incident."id" = ${input.targetId}::uuid
      FOR UPDATE
    `);
    const incident = await transaction.platformIncident.findUnique({
      where: { id: input.targetId },
    });
    if (!incident) {
      platformJobError("NOT_FOUND", "The platform incident was not found.");
    }
    if (incident.version !== input.expectedVersion) {
      platformJobError("CONFLICT", "The platform incident version is stale.");
    }
    if (
      (action === "INCIDENT_ACKNOWLEDGE" && incident.state !== "OPEN")
      || (action === "INCIDENT_RESOLVE" && incident.state === "RESOLVED")
    ) {
      platformJobError("CONFLICT", "The platform incident transition is invalid.");
    }
    const [clock] = await transaction.$queryRaw<Array<{ now: Date }>>(
      Prisma.sql`SELECT clock_timestamp() AS now`,
    );
    if (!clock?.now) {
      platformJobError("PLATFORM_JOB_FAILURE", "The database clock is unavailable.");
    }
    const resolving = action === "INCIDENT_RESOLVE";
    const updated = await transaction.platformIncident.update({
      where: { id: incident.id },
      data: resolving
        ? {
            resolvedAt: clock.now,
            resolvedByAdminId: current.userId,
            resolvedByPersonId: current.personId,
            state: "RESOLVED",
            version: { increment: 1 },
          }
        : {
            acknowledgedAt: clock.now,
            acknowledgedByAdminId: current.userId,
            acknowledgedByPersonId: current.personId,
            state: "ACKNOWLEDGED",
            version: { increment: 1 },
          },
    });
    await transaction.platformIncidentHistory.create({
      data: {
        actorAdminUserId: current.userId,
        actorPersonId: current.personId,
        event: resolving ? "RESOLVED" : "ACKNOWLEDGED",
        fromState: incident.state,
        incidentId: incident.id,
        metadata: { source: "admin_operation" },
        source: "ADMIN",
        toState: updated.state,
      },
    });
    const result = lifecycleResult(updated);
    await transaction.platformOperationMutation.create({
      data: {
        action,
        actorAdminUserId: current.userId,
        actorPersonId: current.personId,
        idempotencyKey: input.idempotencyKey,
        incidentId: incident.id,
        requestHash,
        result,
      },
    });
    return { ...result, replay: false as const };
  });
}

async function mutationReplay(
  transaction: Prisma.TransactionClient,
  actorAdminUserId: string,
  idempotencyKey: string,
  action:
    | "ALERT_ACKNOWLEDGE"
    | "ALERT_RESOLVE"
    | "INCIDENT_CREATE"
    | "INCIDENT_ACKNOWLEDGE"
    | "INCIDENT_RESOLVE",
  requestHash: string,
) {
  const existing = await transaction.platformOperationMutation.findUnique({
    where: {
      actorAdminUserId_idempotencyKey: {
        actorAdminUserId,
        idempotencyKey,
      },
    },
  });
  if (!existing) return null;
  if (existing.action !== action || existing.requestHash !== requestHash) {
    platformJobError(
      "IDEMPOTENCY_CONFLICT",
      "The operation idempotency key was reused with changed input.",
    );
  }
  return {
    ...safeLifecycleResult(existing.result),
    replay: true as const,
  };
}

async function lockAlert(
  transaction: Prisma.TransactionClient,
  alertId: string,
) {
  await transaction.$queryRaw(Prisma.sql`
    SELECT alert."id"
    FROM "PlatformAlert" AS alert
    WHERE alert."id" = ${alertId}::uuid
    FOR UPDATE
  `);
}

function lifecycleResult(value: {
  id: string;
  state: string;
  version: number;
}) {
  return { id: value.id, state: value.state, version: value.version };
}

function safeLifecycleResult(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    platformJobError("CONFLICT", "The stored operation result is invalid.");
  }
  const result = value as Record<string, unknown>;
  if (
    Object.keys(result).sort().join(",") !== "id,state,version"
    || typeof result.id !== "string"
    || !UUID.test(result.id)
    || (
      result.state !== "OPEN"
      && result.state !== "ACKNOWLEDGED"
      && result.state !== "RESOLVED"
    )
    || !Number.isInteger(result.version)
    || Number(result.version) < 1
    || Number(result.version) > 2_147_483_647
  ) {
    platformJobError("CONFLICT", "The stored operation result is invalid.");
  }
  return {
    id: result.id,
    state: result.state,
    version: Number(result.version),
  };
}

function validate(input: VersionedTarget) {
  if (!UUID.test(input.targetId) || !UUID.test(input.idempotencyKey)) {
    platformJobError("VALIDATION_ERROR", "The operation identifiers are invalid.");
  }
  if (
    !Number.isInteger(input.expectedVersion)
    || input.expectedVersion < 1
    || input.expectedVersion > 2_147_483_647
  ) {
    platformJobError("VALIDATION_ERROR", "The operation version is invalid.");
  }
}
