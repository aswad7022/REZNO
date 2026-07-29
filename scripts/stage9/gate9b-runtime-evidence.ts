import {
  bootstrapPlatformSchedules,
  initializePlatformRuntime,
  setPlatformRuntimeEnabled,
} from "../../features/platform-operations/services/admin";
import {
  runPlatformSchedulerTick,
  setPlatformJobScheduleEnabled,
} from "../../features/platform-jobs/services/schedules";
import { runPlatformWorkerBatch } from "../../features/platform-jobs/services/worker";
import { prisma } from "../../lib/db/prisma";
import {
  assertGate9BActivationPreconditions,
  evaluateGate9BRuntimeSnapshot,
  GATE9B_ALLOWED_STAGING_SCHEDULES,
  GATE9B_EXPECTED_JOB_TYPES,
  parseGate9BStagingDatabaseIdentity,
} from "../../features/stage9/gate9b";
import {
  collectStage9BAdminEvidence,
  collectStage9BDeploymentEvidence,
  collectStage9BMigrationEvidence,
  collectStage9BRestorePointEvidence,
  snapshotStage9BEnv,
} from "./gate9b-evidence-helpers";

let phase = "BOOT";

async function main() {
  const env = snapshotStage9BEnv();
  const allowLocalTest = env.REZNO_STAGE9_GATE9B_ALLOW_LOCAL_TEST_DB === "true";

  phase = "IDENTITY";
  const identity = parseGate9BStagingDatabaseIdentity(env.DATABASE_URL, {
    allowLocalTest,
    expectedHost: env.REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_HOST,
    expectedIdentitySource: env.REZNO_STAGE9_GATE9B_DATABASE_IDENTITY_SOURCE,
    expectedRole: env.REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_ROLE,
  });

  phase = "MIGRATIONS";
  const migrationEvidence = await collectStage9BMigrationEvidence(prisma, env);

  phase = "ADMIN_CONTEXT";
  const adminEvidence = await collectStage9BAdminEvidence(prisma, env);

  phase = "ACTIVATION_PRECONDITIONS";
  const now = new Date();
  const restorePointEvidence = await collectStage9BRestorePointEvidence(env, identity, now);
  assertGate9BActivationPreconditions({
    adminEvidence,
    databaseIdentity: identity,
    deploymentEvidence: await collectStage9BDeploymentEvidence(env, { now }),
    env,
    migrationEvidence,
    now,
    requireAdmin: true,
    restorePointEvidence,
  });

  const context = adminContextFromVerifiedEnv(env);

  phase = "INITIALIZE";
  let control = await prisma.platformRuntimeControl.findUnique({
    where: { id: "github-actions-runtime" },
  });
  if (!control) {
    await initializePlatformRuntime(context, "9b000000-0000-4000-8000-000000000001");
    control = await prisma.platformRuntimeControl.findUniqueOrThrow({
      where: { id: "github-actions-runtime" },
    });
  }

  phase = "BOOTSTRAP_SCHEDULES";
  await bootstrapPlatformSchedules(context, "9b000000-0000-4000-8000-000000000002");
  let schedules = await prisma.platformJobSchedule.findMany({
    orderBy: { scheduleKey: "asc" },
    where: { scopeKey: "platform" },
  });
  if (schedules.length !== GATE9B_ALLOWED_STAGING_SCHEDULES.length) {
    throw new Error("Gate 9B schedule bootstrap did not produce the accepted 13 schedules.");
  }
  const schedulesEnabledBeforeManual = schedules.filter((schedule) => schedule.enabled);
  if (
    schedulesEnabledBeforeManual.some((schedule) =>
      !GATE9B_ALLOWED_STAGING_SCHEDULES.includes(schedule.scheduleKey as never)
    )
  ) {
    throw new Error("Gate 9B found an enabled schedule outside the accepted staging registry.");
  }

  phase = "MANUAL_CYCLE_1";
  const manualOne = {
    scheduler: await runPlatformSchedulerTick(context, {
      batchSize: 10,
      idempotencyKey: "9b000000-0000-4000-8000-000000000003",
    }),
    worker: await runPlatformWorkerBatch(context, {
      batchSize: 5,
      idempotencyKey: "9b000000-0000-4000-8000-000000000004",
    }),
  };

  phase = "MANUAL_CYCLE_2";
  const manualTwo = {
    scheduler: await runPlatformSchedulerTick(context, {
      batchSize: 10,
      idempotencyKey: "9b000000-0000-4000-8000-000000000005",
    }),
    worker: await runPlatformWorkerBatch(context, {
      batchSize: 5,
      idempotencyKey: "9b000000-0000-4000-8000-000000000006",
    }),
  };

  phase = "ENABLE_RUNTIME";
  control = await prisma.platformRuntimeControl.findUniqueOrThrow({
    where: { id: "github-actions-runtime" },
  });
  if (control.state !== "ENABLED") {
    await setPlatformRuntimeEnabled(context, {
      enabled: true,
      expectedVersion: control.version,
      idempotencyKey: "9b000000-0000-4000-8000-000000000007",
    });
  }

  phase = "ENABLE_SCHEDULES";
  schedules = await prisma.platformJobSchedule.findMany({
    orderBy: { scheduleKey: "asc" },
    where: { scopeKey: "platform" },
  });
  for (const schedule of schedules) {
    if (schedule.enabled) continue;
    if (!GATE9B_ALLOWED_STAGING_SCHEDULES.includes(schedule.scheduleKey as never)) {
      throw new Error("Gate 9B refused an unapproved schedule.");
    }
    await setPlatformJobScheduleEnabled(context, {
      enabled: true,
      expectedVersion: schedule.version,
      idempotencyKey: idempotencyForSchedule(schedule.scheduleKey),
      scheduleId: schedule.id,
    });
  }

  phase = "SNAPSHOT";
  const enumRows = await prisma.$queryRaw<Array<{ label: string; type: string }>>`
    SELECT enum_type.typname AS type, enum_value.enumlabel AS label
    FROM pg_enum AS enum_value
    JOIN pg_type AS enum_type ON enum_type.oid = enum_value.enumtypid
    WHERE enum_type.typname IN ('PlatformJobType', 'PlatformJobScheduleKey')
    ORDER BY enum_type.typname, enum_value.enumsortorder
  `;
  const currentSchedules = await prisma.platformJobSchedule.findMany({
    where: { enabled: true, scopeKey: "platform" },
    select: { scheduleKey: true },
  });
  const runtimeSnapshot = evaluateGate9BRuntimeSnapshot({
    enabledScheduleKeys: currentSchedules.map((item) => item.scheduleKey),
    jobTypes: enumRows.filter((row) => row.type === "PlatformJobType").map((row) => row.label),
    providerTruth: {
      ai: "DISABLED",
      communications: "NOT_CONFIGURED",
      payment: env.REZNO_PAYMENT_PROVIDER === "DETERMINISTIC_TEST" ? "DETERMINISTIC_TEST" : "NOT_CONFIGURED",
      push: "NOT_CONFIGURED",
      storage: env.REZNO_STORAGE_PROVIDER === "DETERMINISTIC_TEST" ? "DETERMINISTIC_TEST" : "NOT_CONFIGURED",
    },
    scheduleKeys: enumRows.filter((row) => row.type === "PlatformJobScheduleKey").map((row) => row.label),
    stage6Runtime: "STAGING_ACTIVATED_PRODUCTION_NOT_ACTIVATED",
  });
  if (!runtimeSnapshot.ok) {
    throw new Error("Gate 9B runtime snapshot failed closed.");
  }
  console.log(JSON.stringify({
    adminEvidence: { status: adminEvidence.status },
    jobTypes: GATE9B_EXPECTED_JOB_TYPES.length,
    manualOne,
    manualTwo,
    runtime: "STAGING ACTIVATED — PRODUCTION NOT ACTIVATED",
    schedulesEnabledBeforeManual: schedulesEnabledBeforeManual.length,
    schedulesEnabled: currentSchedules.length,
    status: "passed",
  }, null, 2));
}

function adminContextFromVerifiedEnv(env: Record<string, string | undefined>) {
  const userId = env.REZNO_STAGE9_GATE9B_ADMIN_USER_ID?.trim();
  const personId = env.REZNO_STAGE9_GATE9B_ADMIN_PERSON_ID?.trim();
  const adminAccessId = env.REZNO_STAGE9_GATE9B_ADMIN_ACCESS_ID?.trim();
  if (!userId || !personId || !adminAccessId) {
    throw new Error("Gate 9B Admin context is unavailable after precondition verification.");
  }
  return {
    adminAccessId,
    personId,
    source: "database" as const,
    userId,
  };
}

function idempotencyForSchedule(scheduleKey: string) {
  const index = GATE9B_ALLOWED_STAGING_SCHEDULES.indexOf(scheduleKey as never);
  if (index < 0) throw new Error("Unknown Gate 9B schedule key.");
  return `9b000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`;
}

main()
  .catch((error) => {
    process.exitCode = 1;
    console.error(`Gate 9B runtime evidence failed closed at ${phase}.`);
    if (error instanceof Error) console.error(error.message);
  })
  .finally(() => prisma.$disconnect());
