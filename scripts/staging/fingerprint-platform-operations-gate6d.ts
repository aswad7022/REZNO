import { postgresPool, prisma } from "../../lib/db/prisma";
import {
  attestGate6aPrismaTransport,
} from "../../lib/db/postgres-transport";
import {
  PLATFORM_OPERATIONS_GATE6D_MARKER,
  platformOperationsGate6dFixtureFingerprint,
  platformOperationsGate6dForeignSentinels,
  platformOperationsGate6dNonFixtureFingerprint,
} from "./platform-operations-gate6d-fixture";
import {
  assertPlatformOperationsGate6dStaging,
} from "./platform-operations-gate6d-safety";

async function main() {
  const transport =
    process.env.REZNO_STAGE6_GATE6D_ALLOW_LOCAL_UNENCRYPTED === "true"
      ? undefined
      : await attestGate6aPrismaTransport(postgresPool, prisma);
  const safety = await assertPlatformOperationsGate6dStaging(
    prisma,
    process.env,
    transport,
  );
  console.log(JSON.stringify({
    ...safety,
    fixture: PLATFORM_OPERATIONS_GATE6D_MARKER,
    fixtureEvidence:
      await platformOperationsGate6dFixtureFingerprint(prisma),
    foreignSentinels:
      await platformOperationsGate6dForeignSentinels(prisma),
    nonFixtureFingerprint:
      await platformOperationsGate6dNonFixtureFingerprint(prisma),
    status: "fingerprinted",
  }));
}

const keepAlive = setInterval(() => undefined, 1_000);
main()
  .catch(() => {
    process.exitCode = 1;
    console.error("Gate 6D staging fingerprint failed closed.");
  })
  .finally(async () => {
    await prisma.$disconnect();
    await postgresPool.end();
    clearInterval(keepAlive);
  });
