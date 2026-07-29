import { prisma } from "../../lib/db/prisma";
import {
  evaluateGate9BActivationPreconditions,
  gate9BDatabaseBindingSha256,
  gate9BRestorePointEvidenceFromEnv,
  GATE9B_LOCAL_TEST_SOURCE,
  GATE9B_STAGING_ORIGIN,
  parseGate9BStagingDatabaseIdentity,
  type Gate9BDatabaseIdentity,
  type Gate9BMigrationEvidence,
} from "../../features/stage9/gate9b";
import {
  collectStage9BAdminEvidence,
  collectStage9BDeploymentEvidence,
  collectStage9BMigrationEvidence,
  exitCodeForGate9BValidation,
  localStage9BRestorePointEvidence,
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

  const databaseBindingSha256 = databaseIdentity
    ? gate9BDatabaseBindingSha256(databaseIdentity)
    : undefined;
  const restorePointEvidence =
    allowLocalTest
    && env.NODE_ENV === "test"
    && env.REZNO_STAGE9_GATE9B_RESTORE_POINT_ID?.trim()
    && env.REZNO_STAGE9_GATE9B_RESTORE_POINT_VERIFICATION_SOURCE === GATE9B_LOCAL_TEST_SOURCE
    && databaseBindingSha256
      ? localStage9BRestorePointEvidence({
        createdAt: new Date(now.getTime() - 60_000),
        databaseBindingSha256,
        expiresAt: new Date(now.getTime() + 60 * 60_000),
        verifiedAt: now,
      })
      : gate9BRestorePointEvidenceFromEnv(env);

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
