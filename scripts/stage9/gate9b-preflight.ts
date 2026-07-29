import { prisma } from "../../lib/db/prisma";
import {
  evaluateGate9BActivationPreconditions,
  GATE9B_STAGING_ORIGIN,
  parseGate9BStagingDatabaseIdentity,
  type Gate9BDatabaseIdentity,
  type Gate9BMigrationEvidence,
} from "../../features/stage9/gate9b";
import {
  collectStage9BAdminEvidence,
  collectStage9BDeploymentEvidence,
  collectStage9BMigrationEvidence,
  collectStage9BRestorePointEvidence,
  exitCodeForGate9BValidation,
  snapshotStage9BEnv,
} from "./gate9b-evidence-helpers";

let phase = "BOOT";

async function main() {
  const env = snapshotStage9BEnv();
  const allowLocalTest = env.REZNO_STAGE9_GATE9B_ALLOW_LOCAL_TEST_DB === "true";
  const now = new Date();
  let databaseIdentity: Gate9BDatabaseIdentity | null = null;
  let databaseIdentityFailure:
    | { readonly code: string; readonly status: "failed-closed" }
    | null = null;
  let migrationEvidence: Gate9BMigrationEvidence | undefined;

  try {
    phase = "DATABASE_IDENTITY";
    databaseIdentity = parseGate9BStagingDatabaseIdentity(env.DATABASE_URL, {
      allowLocalTest,
      expectedHost: env.REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_HOST,
      expectedIdentitySource: env.REZNO_STAGE9_GATE9B_DATABASE_IDENTITY_SOURCE,
      expectedRole: env.REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_ROLE,
    });
  } catch (error) {
    databaseIdentityFailure = {
      code: error instanceof Error && "code" in error
        ? (error as { code: string }).code
        : "INVALID_DATABASE_IDENTITY",
      status: "failed-closed",
    };
  }

  if (databaseIdentity) {
    try {
      phase = "MIGRATION_BASELINE";
      migrationEvidence = await collectStage9BMigrationEvidence(prisma, env);
    } catch {
      migrationEvidence = undefined;
    }
  }

  phase = "ADMIN_CONTEXT";
  const adminEvidence = await collectStage9BAdminEvidence(prisma, env, now);

  const restorePointEvidence = await collectStage9BRestorePointEvidence(
    env,
    databaseIdentity ?? undefined,
    now,
  );

  phase = "PREFLIGHT";
  const preflight = evaluateGate9BActivationPreconditions({
    adminEvidence,
    databaseIdentity: databaseIdentity ?? undefined,
    deploymentEvidence: await collectStage9BDeploymentEvidence(env, { now }),
    env,
    migrationEvidence,
    now,
    requireAdmin: true,
    restorePointEvidence,
  });
  const status = preflight.ok
    ? "READY"
    : preflight.externalInputRequired
      ? "EXTERNAL_INPUT_REQUIRED"
      : "FAILED_CLOSED";

  console.log(JSON.stringify({
    databaseIdentity: databaseIdentity ?? databaseIdentityFailure,
    preflight,
    stagingOrigin: GATE9B_STAGING_ORIGIN,
    status,
  }, null, 2));

  process.exitCode = exitCodeForGate9BValidation(preflight);
}

main()
  .catch(() => {
    process.exitCode = 1;
    console.error(`Gate 9B preflight failed closed at ${phase}.`);
  })
  .finally(() => prisma.$disconnect());
