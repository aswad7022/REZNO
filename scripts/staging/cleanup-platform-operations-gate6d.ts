import { postgresPool, prisma } from "../../lib/db/prisma";
import {
  attestGate6aPrismaTransport,
} from "../../lib/db/postgres-transport";
import {
  cleanupPlatformOperationsGate6dFixture,
  PLATFORM_OPERATIONS_GATE6D_MARKER,
  platformOperationsGate6dCleanupTotal,
  platformOperationsGate6dForeignSentinels,
  platformOperationsGate6dNonFixtureFingerprint,
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
  phase = "CLEANUP";
  const cleanup = await cleanupPlatformOperationsGate6dFixture(prisma);
  phase = "POSTCLEANUP";
  const nonFixtureAfter =
    await platformOperationsGate6dNonFixtureFingerprint(prisma);
  const sentinelsAfter =
    await platformOperationsGate6dForeignSentinels(prisma);
  if (nonFixtureAfter !== nonFixtureBefore) {
    throw new Error("Gate 6D cleanup changed the non-fixture fingerprint.");
  }
  if (JSON.stringify(sentinelsAfter) !== JSON.stringify(sentinelsBefore)) {
    throw new Error("Gate 6D cleanup changed a foreign staging sentinel.");
  }
  console.log(JSON.stringify({
    ...safety,
    cleanup,
    fixture: PLATFORM_OPERATIONS_GATE6D_MARKER,
    foreignSentinels: sentinelsAfter,
    nonFixtureFingerprint: nonFixtureAfter,
    removed: platformOperationsGate6dCleanupTotal(cleanup),
    status: "cleaned",
  }));
}

const keepAlive = setInterval(() => undefined, 1_000);
main()
  .catch(() => {
    process.exitCode = 1;
    console.error(`Gate 6D staging cleanup failed closed at ${phase}.`);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await postgresPool.end();
    clearInterval(keepAlive);
  });
