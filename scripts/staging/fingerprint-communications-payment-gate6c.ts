import { postgresPool, prisma } from "../../lib/db/prisma";
import { attestGate6aPrismaTransport } from "../../lib/db/postgres-transport";
import {
  communicationsPaymentGate6cFixtureFingerprint,
  communicationsPaymentGate6cForeignSentinels,
  COMMUNICATIONS_PAYMENT_GATE6C_MARKER,
} from "./communications-payment-gate6c-fixture";
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
  console.log(JSON.stringify({
    ...safety,
    databaseFingerprint:
      await storageMediaGate6bNonFixtureFingerprint(prisma),
    fixture: COMMUNICATIONS_PAYMENT_GATE6C_MARKER,
    fixtureEvidence:
      await communicationsPaymentGate6cFixtureFingerprint(prisma),
    foreignSentinels:
      await communicationsPaymentGate6cForeignSentinels(prisma),
    status: "fingerprinted",
  }));
}

const keepAlive = setInterval(() => undefined, 1_000);
main()
  .catch(() => {
    process.exitCode = 1;
    console.error("Gate 6C staging fingerprint failed closed.");
  })
  .finally(async () => {
    await prisma.$disconnect();
    await postgresPool.end();
    clearInterval(keepAlive);
  });
