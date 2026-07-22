import { postgresPool, prisma } from "../../lib/db/prisma";
import { attestGate6aPrismaTransport } from "../../lib/db/postgres-transport";
import {
  storageMediaGate6bFixtureFingerprint,
  storageMediaGate6bForeignSentinels,
  storageMediaGate6bNonFixtureFingerprint,
} from "./storage-media-gate6b-fixture";
import { assertStorageMediaGate6bStaging } from "./storage-media-gate6b-safety";

async function main() {
  const transport = process.env.REZNO_STAGE6_GATE6B_ALLOW_LOCAL_UNENCRYPTED === "true"
    ? undefined
    : await attestGate6aPrismaTransport(postgresPool, prisma);
  const safety = await assertStorageMediaGate6bStaging(prisma, process.env, transport);
  console.log(JSON.stringify({
    ...safety,
    fixtureEvidence: await storageMediaGate6bFixtureFingerprint(prisma),
    foreignSentinels: await storageMediaGate6bForeignSentinels(prisma),
    nonFixtureFingerprint: await storageMediaGate6bNonFixtureFingerprint(prisma),
    status: "fingerprinted",
  }));
}

const keepAlive = setInterval(() => undefined, 1_000);
main()
  .catch(() => {
    process.exitCode = 1;
    console.error("Gate 6B staging fingerprint failed closed.");
  })
  .finally(async () => {
    await prisma.$disconnect();
    await postgresPool.end();
    clearInterval(keepAlive);
  });
