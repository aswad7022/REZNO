import { postgresPool, prisma } from "../../lib/db/prisma";
import { attestGate6aPrismaTransport } from "../../lib/db/postgres-transport";
import { cleanupPlatformJobsGate6aFixture, PLATFORM_JOBS_GATE6A_MARKER, platformJobsGate6aCleanupTotal, platformJobsGate6aNonFixtureFingerprint } from "./platform-jobs-gate6a-fixture";
import { assertPlatformJobsGate6aStaging } from "./platform-jobs-gate6a-safety";

async function main() {
  const transport = await attestGate6aPrismaTransport(postgresPool, prisma);
  const safety = await assertPlatformJobsGate6aStaging(prisma, process.env, transport);
  const before = await platformJobsGate6aNonFixtureFingerprint(prisma);
  const cleanup = await cleanupPlatformJobsGate6aFixture(prisma);
  const after = await platformJobsGate6aNonFixtureFingerprint(prisma);
  if (after !== before) throw new Error("Gate 6A cleanup changed non-fixture staging data.");
  console.log(JSON.stringify({
    ...safety,
    cleanup,
    fixture: PLATFORM_JOBS_GATE6A_MARKER,
    nonFixtureFingerprint: after,
    removed: platformJobsGate6aCleanupTotal(cleanup),
    status: "cleaned",
  }));
}

const keepAlive = setInterval(() => undefined, 1_000);
main()
  .catch(() => {
    process.exitCode = 1;
    console.error("Gate 6A staging cleanup failed closed.");
  })
  .finally(async () => {
    await prisma.$disconnect();
    await postgresPool.end();
    clearInterval(keepAlive);
  });
