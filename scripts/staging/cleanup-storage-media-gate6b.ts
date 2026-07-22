import { postgresPool, prisma } from "../../lib/db/prisma";
import { attestGate6aPrismaTransport } from "../../lib/db/postgres-transport";
import {
  cleanupStorageMediaGate6bFixture,
  STORAGE_MEDIA_GATE6B_MARKER,
  storageMediaGate6bCleanupTotal,
  storageMediaGate6bForeignSentinels,
  storageMediaGate6bNonFixtureFingerprint,
} from "./storage-media-gate6b-fixture";
import { assertStorageMediaGate6bStaging } from "./storage-media-gate6b-safety";

async function main() {
  const transport = process.env.REZNO_STAGE6_GATE6B_ALLOW_LOCAL_UNENCRYPTED === "true"
    ? undefined
    : await attestGate6aPrismaTransport(postgresPool, prisma);
  const safety = await assertStorageMediaGate6bStaging(prisma, process.env, transport);
  const before = await storageMediaGate6bNonFixtureFingerprint(prisma);
  const sentinelsBefore = await storageMediaGate6bForeignSentinels(prisma);
  const cleanup = await cleanupStorageMediaGate6bFixture(prisma);
  const after = await storageMediaGate6bNonFixtureFingerprint(prisma);
  const sentinelsAfter = await storageMediaGate6bForeignSentinels(prisma);
  if (after !== before) throw new Error("Gate 6B cleanup changed non-fixture staging data.");
  if (JSON.stringify(sentinelsAfter) !== JSON.stringify(sentinelsBefore)) {
    throw new Error("Gate 6B cleanup changed a foreign Person or Organization sentinel.");
  }
  console.log(JSON.stringify({
    ...safety,
    cleanup,
    fixture: STORAGE_MEDIA_GATE6B_MARKER,
    foreignSentinels: sentinelsAfter,
    nonFixtureFingerprint: after,
    removed: storageMediaGate6bCleanupTotal(cleanup),
    status: "cleaned",
  }));
}

const keepAlive = setInterval(() => undefined, 1_000);
main()
  .catch(() => {
    process.exitCode = 1;
    console.error("Gate 6B staging cleanup failed closed.");
  })
  .finally(async () => {
    await prisma.$disconnect();
    await postgresPool.end();
    clearInterval(keepAlive);
  });
