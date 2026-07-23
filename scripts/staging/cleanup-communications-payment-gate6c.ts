import { postgresPool, prisma } from "../../lib/db/prisma";
import { attestGate6aPrismaTransport } from "../../lib/db/postgres-transport";
import {
  cleanupCommunicationsPaymentGate6cComposedFixture,
  COMMUNICATIONS_PAYMENT_GATE6C_MARKER,
  communicationsPaymentGate6cForeignSentinels,
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
  phase = "SAFETY";
  const safety = await assertCommunicationsPaymentGate6cStaging(
    prisma,
    process.env,
    transport,
  );
  phase = "PREFLIGHT_FINGERPRINT";
  const before = await storageMediaGate6bNonFixtureFingerprint(prisma);
  phase = "PREFLIGHT_SENTINELS";
  const sentinelsBefore =
    await communicationsPaymentGate6cForeignSentinels(prisma);
  phase = "GATE6C_AND_PAYMENT_CLEANUP";
  const cleanup =
    await cleanupCommunicationsPaymentGate6cComposedFixture(prisma);
  phase = "STAGE4C_CLEANUP";
  await runComposedStagingScript(
    "cleanup:staging:outbound-communications-stage4c",
  );
  phase = "POSTCLEANUP_FINGERPRINT";
  const after = await storageMediaGate6bNonFixtureFingerprint(prisma);
  phase = "POSTCLEANUP_SENTINELS";
  const sentinelsAfter =
    await communicationsPaymentGate6cForeignSentinels(prisma);
  if (JSON.stringify(sentinelsAfter) !== JSON.stringify(sentinelsBefore)) {
    throw new Error("Gate 6C cleanup changed a foreign staging sentinel.");
  }
  console.log(JSON.stringify({
    ...safety,
    cleanup,
    databaseFingerprintAfterCleanup: after,
    databaseFingerprintBeforeCleanup: before,
    fixture: COMMUNICATIONS_PAYMENT_GATE6C_MARKER,
    foreignSentinels: sentinelsAfter,
    removed: cleanupTotal(cleanup),
    status: "cleaned",
  }));
}

function cleanupTotal(
  value: Awaited<
    ReturnType<typeof cleanupCommunicationsPaymentGate6cComposedFixture>
  >,
) {
  return Object.values(value)
    .flatMap((section) => Object.values(section))
    .reduce((sum, count) => sum + count, 0);
}

const keepAlive = setInterval(() => undefined, 1_000);
main()
  .catch(() => {
    process.exitCode = 1;
    console.error(`Gate 6C staging cleanup failed closed at ${phase}.`);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await postgresPool.end();
    clearInterval(keepAlive);
  });
