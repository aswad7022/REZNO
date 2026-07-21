import { prisma } from "../../lib/db/prisma";
import { PLATFORM_JOB_LIMITS, STAGE_6_ARCHITECTURE } from "../../features/platform-jobs/domain/contracts";
import { PLATFORM_JOBS_GATE6A_MARKER, platformJobsGate6aNonFixtureFingerprint, seedPlatformJobsGate6aFixture } from "./platform-jobs-gate6a-fixture";
import { assertPlatformJobsGate6aStaging } from "./platform-jobs-gate6a-safety";

async function main() {
  const safety = await assertPlatformJobsGate6aStaging(prisma);
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

main().finally(() => prisma.$disconnect());
