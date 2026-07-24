import { STAGE_6_ARCHITECTURE } from "../../features/platform-jobs/domain/contracts";
import { postgresPool, prisma } from "../../lib/db/prisma";
import { attestGate6aPrismaTransport } from "../../lib/db/postgres-transport";
import {
  COMMUNICATIONS_PAYMENT_GATE6C_MARKER,
  communicationsPaymentGate6cForeignSentinels,
  currentCommunicationsPaymentGate6cSeedPhase,
  seedCommunicationsPaymentGate6cFixture,
} from "./communications-payment-gate6c-fixture";
import { runComposedStagingScript } from "./communications-payment-gate6c-process";
import { assertCommunicationsPaymentGate6cStaging } from "./communications-payment-gate6c-safety";
import {
  storageMediaGate6bNonFixtureFingerprint,
} from "./storage-media-gate6b-fixture";

let phase = "BOOT";

async function main() {
  phase = "TRANSPORT";
  const transport =
    process.env.REZNO_STAGE6_GATE6C_ALLOW_LOCAL_UNENCRYPTED === "true"
      ? undefined
      : await attestGate6aPrismaTransport(postgresPool, prisma);
  const safety = await assertCommunicationsPaymentGate6cStaging(
    prisma,
    process.env,
    transport,
  );
  phase = "PREFLIGHT_FINGERPRINT";
  const preflightFingerprint =
    await storageMediaGate6bNonFixtureFingerprint(prisma);
  phase = "PREFLIGHT_SENTINELS";
  const sentinelsBefore =
    await communicationsPaymentGate6cForeignSentinels(prisma);
  phase = "STAGE4C_COMPOSED_SEED";
  await runComposedStagingScript(
    "seed:staging:outbound-communications-stage4c",
  );
  phase = "GATE6C_FIXTURE_SEED";
  const fixtureEvidence =
    await seedCommunicationsPaymentGate6cFixture(prisma);
  phase = "POSTSEED_SENTINELS";
  const sentinelsAfter =
    await communicationsPaymentGate6cForeignSentinels(prisma);
  if (JSON.stringify(sentinelsAfter) !== JSON.stringify(sentinelsBefore)) {
    throw new Error("Gate 6C seed changed a foreign staging sentinel.");
  }
  phase = "POSTSEED_FINGERPRINT";
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
    const fixturePhase = phase === "GATE6C_FIXTURE_SEED"
      ? `/${currentCommunicationsPaymentGate6cSeedPhase()}`
      : "";
    console.error(
      `Gate 6C staging seed failed closed at ${phase}${fixturePhase}.`,
    );
  })
  .finally(async () => {
    await prisma.$disconnect();
    await postgresPool.end();
    clearInterval(keepAlive);
  });
