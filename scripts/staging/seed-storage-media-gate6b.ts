import { STAGE_6_ARCHITECTURE } from "../../features/platform-jobs/domain/contracts";
import { storageMediaCapabilities } from "../../features/media/services/capabilities";
import { postgresPool, prisma } from "../../lib/db/prisma";
import { attestGate6aPrismaTransport } from "../../lib/db/postgres-transport";
import {
  STORAGE_MEDIA_GATE6B_MARKER,
  seedStorageMediaGate6bFixture,
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
  const fixture = await seedStorageMediaGate6bFixture(prisma);
  const after = await storageMediaGate6bNonFixtureFingerprint(prisma);
  const sentinelsAfter = await storageMediaGate6bForeignSentinels(prisma);
  if (after !== before) throw new Error("Gate 6B seed changed non-fixture staging data.");
  if (JSON.stringify(sentinelsAfter) !== JSON.stringify(sentinelsBefore)) {
    throw new Error("Gate 6B seed changed a foreign Person or Organization sentinel.");
  }
  console.log(JSON.stringify({
    ...safety,
    capabilities: storageMediaCapabilities(),
    fixture: STORAGE_MEDIA_GATE6B_MARKER,
    fixtureEvidence: fixture,
    foreignSentinels: sentinelsAfter,
    nonFixtureFingerprint: after,
    runtime: STAGE_6_ARCHITECTURE.runtime,
    status: "seeded",
  }));
}

const keepAlive = setInterval(() => undefined, 1_000);
main()
  .catch(() => {
    process.exitCode = 1;
    console.error("Gate 6B staging seed failed closed.");
  })
  .finally(async () => {
    await prisma.$disconnect();
    await postgresPool.end();
    clearInterval(keepAlive);
  });
