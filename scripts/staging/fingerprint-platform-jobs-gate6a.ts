import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Prisma } from "@prisma/client";

import { postgresPool, prisma } from "../../lib/db/prisma";
import { attestGate6aPrismaTransport } from "../../lib/db/postgres-transport";
import { platformJobsGate6aFixtureFingerprint, platformJobsGate6aNonFixtureFingerprint } from "./platform-jobs-gate6a-fixture";

const MIGRATION_44 = "20260722090000_platform_worker_operation_recovery";
const MIGRATION_44_FILE = new URL("../../prisma/migrations/20260722090000_platform_worker_operation_recovery/migration.sql", import.meta.url);

async function main() {
  const transport = await attestGate6aPrismaTransport(postgresPool, prisma);
  const [fingerprint, fixture, migrationFile, migrationRows] = await Promise.all([
    platformJobsGate6aNonFixtureFingerprint(prisma),
    platformJobsGate6aFixtureFingerprint(prisma),
    readFile(MIGRATION_44_FILE),
    prisma.$queryRaw<Array<{ checksum: string; finishedAt: Date | null; rolledBackAt: Date | null }>>(Prisma.sql`
      SELECT checksum,
             finished_at AS "finishedAt",
             rolled_back_at AS "rolledBackAt"
        FROM "_prisma_migrations"
       WHERE migration_name = ${MIGRATION_44}
    `),
  ]);
  const migration44AppliedExactlyOnce = migrationRows.length === 1
    && migrationRows[0]?.finishedAt !== null
    && migrationRows[0]?.rolledBackAt === null;
  const migration44ChecksumMatches = migrationRows[0]?.checksum
    === createHash("sha256").update(migrationFile).digest("hex");
  if (!migration44AppliedExactlyOnce || !migration44ChecksumMatches) {
    throw new Error("Gate 6A Migration 44 staging evidence is invalid.");
  }
  console.log(JSON.stringify({
    clientTlsVerified: transport.clientTlsVerified,
    databaseMatches: transport.databaseMatches,
    migrationApplied: transport.migrationApplied,
    migrationFailed: transport.migrationFailed,
    migrationRolledBack: transport.migrationRolledBack,
    migrationTotal: transport.migrationTotal,
    migration44AppliedExactlyOnce,
    migration44ChecksumMatches,
    nonFixtureFingerprint: fingerprint,
    prismaUsedAttestedPhysicalClient: transport.prismaUsedAttestedPhysicalClient,
    roleMatches: transport.roleMatches,
    fixtureCounts: fixture.counts,
    fixtureRowsRemaining: Object.values(fixture.counts).reduce((sum, count) => sum + count, 0),
    status: "fingerprinted",
    transportConfigurationSha256: transport.transportConfigurationSha256,
  }));
}

const keepAlive = setInterval(() => undefined, 1_000);
main()
  .catch(() => {
    process.exitCode = 1;
    console.error("Gate 6A staging fingerprint failed closed.");
  })
  .finally(async () => {
    await prisma.$disconnect();
    await postgresPool.end();
    clearInterval(keepAlive);
  });
