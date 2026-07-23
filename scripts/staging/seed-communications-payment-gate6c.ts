import { STAGE_6_ARCHITECTURE } from "../../features/platform-jobs/domain/contracts";
import { postgresPool, prisma } from "../../lib/db/prisma";
import { attestGate6aPrismaTransport } from "../../lib/db/postgres-transport";
import {
  COMMUNICATIONS_PAYMENT_GATE6C_MARKER,
  communicationsPaymentGate6cForeignSentinels,
  seedCommunicationsPaymentGate6cFixture,
} from "./communications-payment-gate6c-fixture";
import { runComposedStagingScript } from "./communications-payment-gate6c-process";
import { assertCommunicationsPaymentGate6cStaging } from "./communications-payment-gate6c-safety";
import {
  storageMediaGate6bNonFixtureFingerprint,
} from "./storage-media-gate6b-fixture";

async function main() {
  const transport =
    process.env.REZNO_STAGE6_GATE6C_ALLOW_LOCAL_UNENCRYPTED === "true"
      ? undefined
      : await attestGate6aPrismaTransport(postgresPool, prisma);
  const safety = await assertCommunicationsPaymentGate6cStaging(
    prisma,
    process.env,
    transport,
  );
  const preflightFingerprint =
    await storageMediaGate6bNonFixtureFingerprint(prisma);
  const sentinelsBefore =
    await communicationsPaymentGate6cForeignSentinels(prisma);
  await runComposedStagingScript(
    "seed:staging:outbound-communications-stage4c",
  );
  const fixtureEvidence =
    await seedCommunicationsPaymentGate6cFixture(prisma);
  const sentinelsAfter =
    await communicationsPaymentGate6cForeignSentinels(prisma);
  if (JSON.stringify(sentinelsAfter) !== JSON.stringify(sentinelsBefore)) {
    throw new Error("Gate 6C seed changed a foreign staging sentinel.");
  }
  console.log(JSON.stringify({
    ...safety,
    databaseFingerprintAfterSeed:
      await storageMediaGate6bNonFixtureFingerprint(prisma),
    fixture: COMMUNICATIONS_PAYMENT_GATE6C_MARKER,
    fixtureEvidence,
    foreignSentinels: sentinelsAfter,
    preflightFingerprint,
    runtime: STAGE_6_ARCHITECTURE.runtime,
    status: "seeded",
  }));
}

const keepAlive = setInterval(() => undefined, 1_000);
main()
  .catch(() => {
    process.exitCode = 1;
    console.error("Gate 6C staging seed failed closed.");
  })
  .finally(async () => {
    await prisma.$disconnect();
    await postgresPool.end();
    clearInterval(keepAlive);
  });
