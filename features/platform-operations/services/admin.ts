import "server-only";

import { PlatformJobScheduleKey, PlatformJobType, Prisma } from "@prisma/client";

import { platformJobHash } from "@/features/platform-jobs/domain/canonical";
import { platformJobError } from "@/features/platform-jobs/domain/errors";
import { parsePlatformJobPayload } from "@/features/platform-jobs/domain/registry";
import {
  assertPlatformJobAdminCurrent,
  type PlatformJobAdminContext,
} from "@/features/platform-jobs/services/admin-context";
import { runPlatformJobSerializable } from "@/features/platform-jobs/services/transaction";
import { lockPlatformOperationMutationKey } from "@/features/platform-operations/services/mutation-lock";
import { PLATFORM_RUNTIME_CONTROL_ID } from "@/features/platform-operations/services/runtime";

const RUNTIME_INTERVAL_SECONDS = 300;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PLATFORM_SCHEDULE_DEFAULTS = [
  schedule("PLATFORM_HEALTH_PROBE", 300, 1, {
    probe: "DURABLE_FOUNDATION",
    version: 1,
  }),
  schedule("COMMERCE_ORDER_EXPIRY", 300, 3, { batchSize: 50 }),
  schedule("STORAGE_MAINTENANCE_DISCOVERY", 900, 2, { batchSize: 50 }),
  schedule("STORAGE_RESCAN_DISCOVERY", 3_600, 1, { batchSize: 50 }),
  schedule("MEDIA_RENDITION_DISCOVERY", 300, 2, { batchSize: 50 }),
  schedule("MEDIA_RENDITION_CLEANUP_DISCOVERY", 3_600, 1, { batchSize: 50 }),
  schedule("COMMUNICATION_CAMPAIGN_DISCOVERY", 300, 2, { batchSize: 50 }),
  schedule("COMMUNICATION_DELIVERY_DISCOVERY", 300, 2, { batchSize: 50 }),
  schedule("PAYMENT_RETRY_DISCOVERY", 300, 2, { batchSize: 50 }),
  schedule("PAYMENT_RECONCILIATION", 3_600, 1, { batchSize: 50 }),
  schedule("SETTLEMENT_STATEMENT_GENERATE", 86_400, 1, {
    batchSize: 50,
    periodDays: 1,
  }),
  schedule("PLATFORM_OPERATIONS_MONITOR", 300, 1, { version: 1 }),
  schedule("DISTRIBUTED_RATE_LIMIT_CLEANUP", 3_600, 1, { batchSize: 500 }),
] as const;

export async function initializePlatformRuntime(
  context: PlatformJobAdminContext,
  idempotencyKey: string,
) {
  return runtimeMutation(
    context,
    idempotencyKey,
    "RUNTIME_INITIALIZE",
    { action: "RUNTIME_INITIALIZE" },
    async (transaction, current, now) => {
      const existing = await transaction.platformRuntimeControl.findUnique({
        where: { id: PLATFORM_RUNTIME_CONTROL_ID },
      });
      if (existing) {
        platformJobError(
          "CONFLICT",
          "The automatic runtime is already initialized.",
        );
      }
      const control = await transaction.platformRuntimeControl.create({
        data: {
          configuredByAdminUserId: current.userId,
          configuredByPersonId: current.personId,
          disabledAt: now,
          expectedIntervalSeconds: RUNTIME_INTERVAL_SECONDS,
          id: PLATFORM_RUNTIME_CONTROL_ID,
          provider: "GITHUB_ACTIONS_SCHEDULED_HTTP",
        },
      });
      return {
        control,
        result: runtimeResult(control),
      };
    },
  );
}

export async function setPlatformRuntimeEnabled(
  context: PlatformJobAdminContext,
  input: {
    enabled: boolean;
    expectedVersion: number;
    idempotencyKey: string;
  },
) {
  assertVersion(input.expectedVersion);
  const action = input.enabled ? "RUNTIME_ENABLE" : "RUNTIME_DISABLE";
  return runtimeMutation(
    context,
    input.idempotencyKey,
    action,
    {
      action,
      enabled: input.enabled,
      expectedVersion: input.expectedVersion,
    },
    async (transaction, _current, now) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT control."id"
        FROM "PlatformRuntimeControl" AS control
        WHERE control."id" = ${PLATFORM_RUNTIME_CONTROL_ID}
        FOR UPDATE
      `);
      const current = await transaction.platformRuntimeControl.findUnique({
        where: { id: PLATFORM_RUNTIME_CONTROL_ID },
      });
      if (!current) {
        platformJobError("NOT_FOUND", "The automatic runtime is not initialized.");
      }
      if (current.version !== input.expectedVersion) {
        platformJobError("CONFLICT", "The runtime control version is stale.");
      }
      const desiredState = input.enabled ? "ENABLED" : "DISABLED";
      if (current.state === desiredState) {
        platformJobError("CONFLICT", "The runtime is already in the requested state.");
      }
      const control = await transaction.platformRuntimeControl.update({
        where: { id: current.id },
        data: {
          ...(input.enabled
            ? { enabledAt: now, state: "ENABLED" as const }
            : { disabledAt: now, state: "DISABLED" as const }),
          generation: { increment: 1 },
          version: { increment: 1 },
        },
      });
      if (!input.enabled) {
        await transaction.platformRuntimeInvocation.updateMany({
          where: { controlId: control.id, state: "RUNNING" },
          data: {
            completedAt: now,
            leaseExpiresAt: null,
            leaseToken: null,
            safeErrorCode: "RUNTIME_DISABLED",
            state: "ABANDONED",
          },
        });
      }
      return { control, result: runtimeResult(control) };
    },
  );
}

export async function bootstrapPlatformSchedules(
  context: PlatformJobAdminContext,
  idempotencyKey: string,
) {
  assertUuid(idempotencyKey);
  return runPlatformJobSerializable(async (transaction) => {
    const current = await assertPlatformJobAdminCurrent(
      transaction,
      context,
      ["PLATFORM_OPERATIONS_MANAGE", "PLATFORM_JOBS_MANAGE"],
    );
    const requestHash = platformJobHash({
      action: "SCHEDULE_BOOTSTRAP",
      registryVersion: 1,
    });
    await lockPlatformOperationMutationKey(
      transaction,
      current.userId,
      idempotencyKey,
    );
    const replay = await operationReplay(
      transaction,
      current.userId,
      idempotencyKey,
      "SCHEDULE_BOOTSTRAP",
      requestHash,
    );
    if (replay) return replay;
    const [clock] = await transaction.$queryRaw<Array<{ now: Date }>>(
      Prisma.sql`SELECT clock_timestamp() AS now`,
    );
    if (!clock?.now) {
      platformJobError("PLATFORM_JOB_FAILURE", "The database clock is unavailable.");
    }
    const schedules = [];
    let created = 0;
    for (const definition of PLATFORM_SCHEDULE_DEFAULTS) {
      const payload = parsePlatformJobPayload(
        definition.jobType,
        1,
        definition.payload,
      );
      const payloadHash = platformJobHash(payload);
      const existing = await transaction.platformJobSchedule.findUnique({
        where: {
          scheduleKey_scopeKey: {
            scheduleKey: definition.scheduleKey,
            scopeKey: "platform",
          },
        },
      });
      if (existing) {
        if (
          existing.jobType !== definition.jobType
          || existing.cadenceSeconds !== definition.cadenceSeconds
          || existing.catchupLimit !== definition.catchupLimit
          || existing.payloadVersion !== 1
          || existing.payloadHash !== payloadHash
          || existing.organizationId !== null
        ) {
          platformJobError(
            "CONFLICT",
            "An existing platform schedule conflicts with the closed registry.",
          );
        }
        schedules.push(existing);
        continue;
      }
      const createdSchedule = await transaction.platformJobSchedule.create({
        data: {
          cadenceSeconds: definition.cadenceSeconds,
          catchupLimit: definition.catchupLimit,
          createdByAdminUserId: current.userId,
          createdByPersonId: current.personId,
          enabled: false,
          jobType: definition.jobType,
          nextRunAt: new Date(
            clock.now.getTime() + definition.cadenceSeconds * 1_000,
          ),
          payload: payload as Prisma.InputJsonValue,
          payloadHash,
          payloadVersion: 1,
          scheduleKey: definition.scheduleKey,
          scopeKey: "platform",
        },
      });
      schedules.push(createdSchedule);
      created += 1;
    }
    const first = schedules[0];
    if (!first) {
      platformJobError("PLATFORM_JOB_FAILURE", "The schedule registry is empty.");
    }
    const result = {
      configured: schedules.length,
      created,
      enabled: 0,
      registryVersion: 1,
    };
    await transaction.platformOperationMutation.create({
      data: {
        action: "SCHEDULE_BOOTSTRAP",
        actorAdminUserId: current.userId,
        actorPersonId: current.personId,
        idempotencyKey,
        requestHash,
        result,
        scheduleId: first.id,
      },
    });
    return { ...result, replay: false as const };
  });
}

async function runtimeMutation(
  context: PlatformJobAdminContext,
  idempotencyKey: string,
  action: "RUNTIME_INITIALIZE" | "RUNTIME_ENABLE" | "RUNTIME_DISABLE",
  request: Readonly<Record<string, boolean | number | string>>,
  operation: (
    transaction: Prisma.TransactionClient,
    current: Awaited<ReturnType<typeof assertPlatformJobAdminCurrent>>,
    now: Date,
  ) => Promise<{
    control: { id: string };
    result: Record<string, boolean | number | string | null>;
  }>,
) {
  assertUuid(idempotencyKey);
  return runPlatformJobSerializable(async (transaction) => {
    const current = await assertPlatformJobAdminCurrent(
      transaction,
      context,
      "PLATFORM_OPERATIONS_MANAGE",
    );
    const requestHash = platformJobHash(request);
    await lockPlatformOperationMutationKey(
      transaction,
      current.userId,
      idempotencyKey,
    );
    const replay = await operationReplay(
      transaction,
      current.userId,
      idempotencyKey,
      action,
      requestHash,
    );
    if (replay) return replay;
    const [clock] = await transaction.$queryRaw<Array<{ now: Date }>>(
      Prisma.sql`SELECT clock_timestamp() AS now`,
    );
    if (!clock?.now) {
      platformJobError("PLATFORM_JOB_FAILURE", "The database clock is unavailable.");
    }
    const { control, result } = await operation(transaction, current, clock.now);
    await transaction.platformOperationMutation.create({
      data: {
        action,
        actorAdminUserId: current.userId,
        actorPersonId: current.personId,
        idempotencyKey,
        requestHash,
        result,
        runtimeControlId: control.id,
      },
    });
    return { ...result, replay: false as const };
  });
}

async function operationReplay(
  transaction: Prisma.TransactionClient,
  actorAdminUserId: string,
  idempotencyKey: string,
  action:
    | "RUNTIME_INITIALIZE"
    | "RUNTIME_ENABLE"
    | "RUNTIME_DISABLE"
    | "SCHEDULE_BOOTSTRAP",
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
    ...safeOperationResult(action, existing.result),
    replay: true as const,
  };
}

function runtimeResult(control: {
  generation: bigint;
  id: string;
  state: string;
  version: number;
}) {
  return {
    controlId: control.id,
    generation: control.generation.toString(),
    state: control.state,
    version: control.version,
  };
}

function safeOperationResult(
  action:
    | "RUNTIME_INITIALIZE"
    | "RUNTIME_ENABLE"
    | "RUNTIME_DISABLE"
    | "SCHEDULE_BOOTSTRAP",
  value: Prisma.JsonValue,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    platformJobError("CONFLICT", "The stored operation result is invalid.");
  }
  const result = value as Record<string, unknown>;
  if (action === "SCHEDULE_BOOTSTRAP") {
    if (
      Object.keys(result).sort().join(",")
        !== "configured,created,enabled,registryVersion"
      || result.configured !== PLATFORM_SCHEDULE_REGISTRY_SIZE
      || !Number.isInteger(result.created)
      || Number(result.created) < 0
      || Number(result.created) > PLATFORM_SCHEDULE_REGISTRY_SIZE
      || result.enabled !== 0
      || result.registryVersion !== 1
    ) {
      platformJobError("CONFLICT", "The stored operation result is invalid.");
    }
    return {
      configured: PLATFORM_SCHEDULE_REGISTRY_SIZE,
      created: Number(result.created),
      enabled: 0,
      registryVersion: 1,
    };
  }
  if (
    Object.keys(result).sort().join(",")
      !== "controlId,generation,state,version"
    || result.controlId !== PLATFORM_RUNTIME_CONTROL_ID
    || typeof result.generation !== "string"
    || !/^[1-9][0-9]{0,19}$/.test(result.generation)
    || (result.state !== "DISABLED" && result.state !== "ENABLED")
    || !Number.isInteger(result.version)
    || Number(result.version) < 1
    || Number(result.version) > 2_147_483_647
  ) {
    platformJobError("CONFLICT", "The stored operation result is invalid.");
  }
  return {
    controlId: PLATFORM_RUNTIME_CONTROL_ID,
    generation: result.generation,
    state: result.state,
    version: Number(result.version),
  };
}

function schedule<
  T extends PlatformJobScheduleKey & PlatformJobType,
  P extends Readonly<Record<string, number | string>>,
>(
  scheduleKey: T,
  cadenceSeconds: number,
  catchupLimit: number,
  payload: P,
) {
  return {
    cadenceSeconds,
    catchupLimit,
    jobType: scheduleKey,
    payload,
    scheduleKey,
  };
}

function assertVersion(value: number) {
  if (
    !Number.isInteger(value)
    || value < 1
    || value > 2_147_483_647
  ) {
    platformJobError("VALIDATION_ERROR", "The runtime version is invalid.");
  }
}

function assertUuid(value: string) {
  if (!UUID.test(value)) {
    platformJobError("VALIDATION_ERROR", "The idempotency key is invalid.");
  }
}

export const PLATFORM_SCHEDULE_REGISTRY_SIZE =
  PLATFORM_SCHEDULE_DEFAULTS.length;
