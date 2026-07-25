import { postgresPool, prisma } from "../../lib/db/prisma";
import {
  attestGate6aPrismaTransport,
} from "../../lib/db/postgres-transport";
import {
  PLATFORM_OPERATIONS_GATE6D_MARKER,
  platformOperationsGate6dForeignSentinels,
  platformOperationsGate6dNonFixtureFingerprint,
  seedPlatformOperationsGate6dFixture,
} from "./platform-operations-gate6d-fixture";
import {
  assertPlatformOperationsGate6dStaging,
} from "./platform-operations-gate6d-safety";

let phase = "BOOT";

async function main() {
  phase = "TRANSPORT";
  const transport =
    process.env.REZNO_STAGE6_GATE6D_ALLOW_LOCAL_UNENCRYPTED === "true"
      ? undefined
      : await attestGate6aPrismaTransport(postgresPool, prisma);
  phase = "SAFETY";
  const safety = await assertPlatformOperationsGate6dStaging(
    prisma,
    process.env,
    transport,
  );
  phase = "PREFLIGHT";
  const nonFixtureBefore =
    await platformOperationsGate6dNonFixtureFingerprint(prisma);
  const sentinelsBefore =
    await platformOperationsGate6dForeignSentinels(prisma);
  phase = "SEED";
  const fixtureEvidence =
    await seedPlatformOperationsGate6dFixture(prisma);
  phase = "POSTSEED";
  const nonFixtureAfter =
    await platformOperationsGate6dNonFixtureFingerprint(prisma);
  const sentinelsAfter =
    await platformOperationsGate6dForeignSentinels(prisma);
  if (nonFixtureAfter !== nonFixtureBefore) {
    throw new Error("Gate 6D seed changed the non-fixture fingerprint.");
  }
  if (JSON.stringify(sentinelsAfter) !== JSON.stringify(sentinelsBefore)) {
    throw new Error("Gate 6D seed changed a foreign staging sentinel.");
  }
  console.log(JSON.stringify({
    ...safety,
    fixture: PLATFORM_OPERATIONS_GATE6D_MARKER,
    fixtureEvidence,
    foreignSentinels: sentinelsAfter,
    nonFixtureFingerprint: nonFixtureAfter,
    status: "seeded",
  }));
}

const keepAlive = setInterval(() => undefined, 1_000);
main()
  .catch(() => {
    process.exitCode = 1;
    console.error(`Gate 6D staging seed failed closed at ${phase}.`);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await postgresPool.end();
    clearInterval(keepAlive);
  });
