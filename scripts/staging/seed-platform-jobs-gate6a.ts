import { postgresPool, prisma } from "../../lib/db/prisma";
import { attestGate6aPrismaTransport } from "../../lib/db/postgres-transport";
import { PLATFORM_JOB_LIMITS, STAGE_6_ARCHITECTURE } from "../../features/platform-jobs/domain/contracts";
import { PLATFORM_JOBS_GATE6A_MARKER, platformJobsGate6aNonFixtureFingerprint, seedPlatformJobsGate6aFixture } from "./platform-jobs-gate6a-fixture";
import { assertPlatformJobsGate6aStaging } from "./platform-jobs-gate6a-safety";

async function main() {
  const transport = await attestGate6aPrismaTransport(postgresPool, prisma);
  const safety = await assertPlatformJobsGate6aStaging(prisma, process.env, transport);
  const before = await platformJobsGate6aNonFixtureFingerprint(prisma);
  const fixture = await seedPlatformJobsGate6aFixture(prisma);
  const after = await platformJobsGate6aNonFixtureFingerprint(prisma);
  if (after !== before) throw new Error("Gate 6A seed changed non-fixture staging data.");
  console.log(JSON.stringify({
    ...safety,
    bounds: PLATFORM_JOB_LIMITS,
    fixture: PLATFORM_JOBS_GATE6A_MARKER,
    fixtureEvidence: fixture,
    nonFixtureFingerprint: after,
    runtime: STAGE_6_ARCHITECTURE.runtime,
    status: "seeded",
  }));
}

const keepAlive = setInterval(() => undefined, 1_000);
main()
  .catch(() => {
    process.exitCode = 1;
    console.error("Gate 6A staging seed failed closed.");
  })
  .finally(async () => {
    await prisma.$disconnect();
    await postgresPool.end();
    clearInterval(keepAlive);
  });
