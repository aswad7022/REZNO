import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const EXPECTED_DATABASE = "rezno_staging";
const EXPECTED_HOST_SHA256 = "d48247179a49d684af03e09a98e5b1e2311a257c01bbb400a72c323946ab35a8";
const EXPECTED_ROLE = "neondb_owner";
const MIGRATION_46 = "20260723120000_media_rendition_claim_integrity";
const MIGRATION_47 = "20260723150000_gate6a_gate6b_constraint_truth_tables";
const OUTPUT_DIRECTORY = ".gate6b-operator-output";

type ClosureMode = "preflight" | "deploy" | "closure";

async function main() {
  const mode = process.env.REZNO_GATE6B_CONSTRAINT_CLOSURE_MODE as ClosureMode | undefined;
  if (!mode || !["preflight", "deploy", "closure"].includes(mode)) {
    throw new Error("Gate 6B constraint closure requires an explicit closed mode.");
  }
  configureExactStagingEnvironment();

  if (mode === "preflight") {
    await inspectDatabase("preflight", 46);
  } else if (mode === "deploy") {
    await run("npx", ["prisma", "migrate", "deploy"]);
    await inspectDatabase("post-deploy", 47);
    await run("npx", ["prisma", "migrate", "deploy"]);
    await inspectDatabase("second-deploy", 47);
  } else {
    await inspectDatabase("pre-closure", 47);
    await run("npm", ["run", "probe:staging:platform-jobs-gate6a-transport"]);
    await run("npm", ["run", "seed:staging:storage-media-gate6b"]);
    await run("npm", ["run", "seed:staging:storage-media-gate6b"]);
    await run("npm", ["run", "smoke:staging:storage-media-gate6b"]);

    await run("npm", ["run", "seed:staging:managed-storage-gate5a"]);
    await run("npm", ["run", "smoke:staging:managed-storage-gate5a"]);
    await run("npm", ["run", "cleanup:staging:managed-storage-gate5a"]);

    await run("npm", ["run", "seed:staging:media-gate5b"]);
    await run("npm", ["run", "smoke:staging:media-gate5b"]);
    await run("npm", ["run", "cleanup:staging:media-gate5b"]);

    await run("npm", ["run", "seed:staging:platform-jobs-gate6a"]);
    await run("npm", ["run", "smoke:staging:platform-jobs-gate6a"]);
    await run("npm", ["run", "cleanup:staging:platform-jobs-gate6a"]);

    await run("npm", ["run", "cleanup:staging:storage-media-gate6b"]);
    await run("npm", ["run", "cleanup:staging:storage-media-gate6b"]);
    await run("npm", ["run", "fingerprint:staging:storage-media-gate6b"]);
    await inspectDatabase("post-closure", 47);
  }

  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await writeFile(
    `${OUTPUT_DIRECTORY}/index.html`,
    "<!doctype html><title>REZNO Gate 6B operator completed</title>",
    { encoding: "utf8", mode: 0o600 },
  );
}

function configureExactStagingEnvironment() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("Gate 6B constraint closure requires DATABASE_URL.");
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    throw new Error("Gate 6B constraint closure requires a parseable PostgreSQL target.");
  }
  const role = decodeURIComponent(target.username);
  const host = target.hostname.toLowerCase();
  if (
    !["postgres:", "postgresql:"].includes(target.protocol)
    || target.pathname !== `/${EXPECTED_DATABASE}`
    || (target.port !== "" && target.port !== "5432")
    || target.searchParams.getAll("sslmode").length !== 1
    || target.searchParams.get("sslmode") !== "verify-full"
    || !host.endsWith(".neon.tech")
    || host.includes("-pooler.")
    || createHash("sha256").update(host).digest("hex") !== EXPECTED_HOST_SHA256
    || role !== EXPECTED_ROLE
    || !target.password
  ) {
    throw new Error("Gate 6B constraint closure target does not match the accepted staging identity.");
  }

  Object.assign(process.env, {
    NODE_ENV: "staging",
    REZNO_ENV: "staging",
    REZNO_MANAGED_STORAGE_GATE5A_CONFIRM: "REZNO_MANAGED_STORAGE_GATE5A_STAGING_ONLY",
    REZNO_MEDIA_GATE5B_CONFIRM: "REZNO_MEDIA_GATE5B_STAGING_ONLY",
    REZNO_STAGE6_GATE6A_CONFIRM: "REZNO_STAGE6_GATE6A_STAGING_ONLY",
    REZNO_STAGE6_GATE6A_EXPECTED_DATABASE_HOST: host,
    REZNO_STAGE6_GATE6A_EXPECTED_DATABASE_ROLE: role,
    REZNO_STAGE6_GATE6B_CONFIRM: "REZNO_STAGE6_GATE6B_STAGING_ONLY",
    REZNO_STAGE6_GATE6B_EXPECTED_DATABASE_HOST: host,
    REZNO_STAGE6_GATE6B_EXPECTED_DATABASE_ROLE: role,
  });
}

async function inspectDatabase(phase: string, expectedMigrations: 46 | 47) {
  const [transportModule, fixture] = await Promise.all([
    import("../../lib/db/postgres-transport"),
    import("./storage-media-gate6b-fixture"),
  ]);
  const postgresPool = transportModule.createPrismaPostgresPool();
  const prisma = new PrismaClient({ adapter: new PrismaPg(postgresPool) });
  try {
    const transport = await transportModule.attestGate6aPrismaTransport(postgresPool, prisma);
    const [migrationState, migrationRows, violationCounts, rowCounts, nonFixtureFingerprint] = await Promise.all([
      readMigrationState(prisma),
      readClosureMigrations(prisma),
      readViolationCounts(prisma),
      readDomainCounts(prisma),
      fixture.storageMediaGate6bNonFixtureFingerprint(prisma),
    ]);
    const repositoryChecksum = createHash("sha256")
      .update(await readFile(`prisma/migrations/${MIGRATION_47}/migration.sql`))
      .digest("hex");
    const migration46 = migrationRows.find((row) => row.name === MIGRATION_46);
    const migration47 = migrationRows.find((row) => row.name === MIGRATION_47);
    if (
      migrationState.applied !== expectedMigrations
      || migrationState.total !== expectedMigrations
      || migrationState.failed !== 0
      || migrationState.rolledBack !== 0
      || migration46?.applied !== 1
      || (expectedMigrations === 46 && migration47 !== undefined)
      || (expectedMigrations === 47
        && (migration47?.applied !== 1 || migration47.checksum !== repositoryChecksum))
    ) {
      throw new Error("Gate 6B constraint closure migration state is not exact.");
    }
    if (Object.values(violationCounts).some((count) => count !== 0)) {
      throw new Error(`Gate 6B constraint closure preflight rejected sanitized counts: ${JSON.stringify(violationCounts)}`);
    }
    console.log(JSON.stringify({
      database: transport.database,
      hostSha256: transport.hostSha256,
      migration47Checksum: repositoryChecksum,
      migrationState,
      nonFixtureFingerprint,
      phase,
      prismaUsedAttestedPhysicalClient: transport.prismaUsedAttestedPhysicalClient,
      role: transport.role,
      rowCounts,
      tls: {
        authorized: transport.authorized,
        hostnameVerified: transport.hostnameVerified,
        protocol: transport.protocol,
        systemCaVerification: transport.systemCaVerification,
      },
      violationCounts,
    }));
  } finally {
    await prisma.$disconnect();
    await postgresPool.end();
  }
}

async function readMigrationState(prisma: PrismaClient) {
  const [row] = await prisma.$queryRaw<Array<{
    applied: bigint;
    failed: bigint;
    rolledBack: bigint;
    total: bigint;
  }>>(Prisma.sql`
    SELECT count(*)::bigint AS total,
           count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::bigint AS applied,
           count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::bigint AS failed,
           count(*) FILTER (WHERE rolled_back_at IS NOT NULL)::bigint AS "rolledBack"
    FROM "_prisma_migrations"
  `);
  if (!row) throw new Error("Gate 6B constraint closure could not read migration state.");
  return {
    applied: Number(row.applied),
    failed: Number(row.failed),
    rolledBack: Number(row.rolledBack),
    total: Number(row.total),
  };
}

async function readClosureMigrations(prisma: PrismaClient) {
  const rows = await prisma.$queryRaw<Array<{
    applied: bigint;
    checksum: string;
    name: string;
  }>>(Prisma.sql`
    SELECT migration_name AS name,
           checksum,
           count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::bigint AS applied
    FROM "_prisma_migrations"
    WHERE migration_name IN (${MIGRATION_46}, ${MIGRATION_47})
    GROUP BY migration_name, checksum
    ORDER BY migration_name
  `);
  return rows.map((row) => ({ applied: Number(row.applied), checksum: row.checksum, name: row.name }));
}

async function readDomainCounts(prisma: PrismaClient) {
  const [row] = await prisma.$queryRaw<Array<{
    assets: bigint;
    bindings: bigint;
    jobs: bigint;
    operations: bigint;
    renditions: bigint;
    schedules: bigint;
  }>>(Prisma.sql`
    SELECT (SELECT count(*) FROM "PlatformJob")::bigint AS jobs,
           (SELECT count(*) FROM "PlatformJobSchedule")::bigint AS schedules,
           (SELECT count(*) FROM "PlatformJobMutation")::bigint AS operations,
           (SELECT count(*) FROM "MediaRendition")::bigint AS renditions,
           (SELECT count(*) FROM "StoredAsset")::bigint AS assets,
           (SELECT count(*) FROM "MediaBinding")::bigint AS bindings
  `);
  if (!row) throw new Error("Gate 6B constraint closure could not read domain counts.");
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
}

async function readViolationCounts(prisma: PrismaClient) {
  const [row] = await prisma.$queryRaw<Array<Record<string, bigint>>>(Prisma.sql`
    SELECT
      (SELECT count(*) FROM "MediaRendition"
       WHERE "state" = 'PROCESSING'
         AND ("claimJobId" IS NULL OR "claimLeaseToken" IS NULL
           OR "claimFencingToken" IS NULL OR "claimExpiresAt" IS NULL)
      )::bigint AS "processingMissingClaim",
      (SELECT count(*) FROM "MediaRendition"
       WHERE "state" = 'PROCESSING' AND "claimFencingToken" IS NOT NULL
         AND "claimFencingToken" < 1
      )::bigint AS "processingInvalidFence",
      (SELECT count(*) FROM "MediaRendition"
       WHERE "state" = 'DELETE_PENDING' AND NOT (
         ("claimJobId" IS NULL AND "claimLeaseToken" IS NULL
           AND "claimFencingToken" IS NULL AND "claimExpiresAt" IS NULL)
         OR
         ("claimJobId" IS NOT NULL AND "claimLeaseToken" IS NOT NULL
           AND "claimFencingToken" IS NOT NULL AND "claimFencingToken" >= 1
           AND "claimExpiresAt" IS NOT NULL)
       )
      )::bigint AS "deletePartialClaim",
      (SELECT count(*) FROM "MediaRendition"
       WHERE "state" IN ('PENDING', 'READY', 'FAILED', 'SUPERSEDED', 'DELETED')
         AND ("claimJobId" IS NOT NULL OR "claimLeaseToken" IS NOT NULL
           OR "claimFencingToken" IS NOT NULL OR "claimExpiresAt" IS NOT NULL)
      )::bigint AS "illegalStateClaim",
      (SELECT count(*) FROM "StoredAsset" WHERE NOT (
        ("rescanClaimJobId" IS NULL AND "rescanClaimLeaseToken" IS NULL
          AND "rescanClaimFencingToken" IS NULL AND "rescanClaimExpiresAt" IS NULL)
        OR
        ("rescanClaimJobId" IS NOT NULL AND "rescanClaimLeaseToken" IS NOT NULL
          AND "rescanClaimFencingToken" IS NOT NULL AND "rescanClaimFencingToken" >= 1
          AND "rescanClaimExpiresAt" IS NOT NULL)
      ))::bigint AS "rescanPartialClaim",
      (SELECT count(*) FROM "StoredAsset"
       WHERE "rescanClaimFencingToken" IS NOT NULL AND "rescanClaimFencingToken" < 1
      )::bigint AS "rescanInvalidFence",
      (SELECT count(*) FROM "PlatformJobMutation"
       WHERE "action" = 'WORKER_BATCH' AND "operationBatchSize" IS NULL
      )::bigint AS "workerNullBatch",
      (SELECT count(*) FROM "PlatformJobMutation"
       WHERE "action" = 'WORKER_BATCH'
         AND ("operationWorkerId" IS NULL
           OR "operationWorkerId" !~ '^(operation:[a-f0-9]{64}|admin:[a-f0-9]{16}:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$')
      )::bigint AS "workerNullIdentity",
      (SELECT count(*) FROM "PlatformJobMutation"
       WHERE "action" = 'WORKER_BATCH' AND "operationFencingToken" IS NULL
      )::bigint AS "workerNullFence",
      (SELECT count(*) FROM "PlatformJobMutation"
       WHERE "action" = 'WORKER_BATCH' AND (
         NOT ("result" ? 'state')
         OR jsonb_typeof("result"->'state') IS DISTINCT FROM 'string'
         OR "result"->>'state' NOT IN ('PROCESSING', 'COMPLETE')
         OR ("operationCompletedAt" IS NULL AND "result"->>'state' IS DISTINCT FROM 'PROCESSING')
         OR ("operationCompletedAt" IS NOT NULL AND "result"->>'state' IS DISTINCT FROM 'COMPLETE')
       )
      )::bigint AS "workerInvalidResult",
      (SELECT count(*) FROM "PlatformJobMutation"
       WHERE "action" = 'WORKER_BATCH' AND NOT (
         ("operationCompletedAt" IS NULL AND "operationLeaseToken" IS NOT NULL
           AND "operationLeaseExpiresAt" IS NOT NULL)
         OR
         ("operationCompletedAt" IS NOT NULL AND "operationLeaseToken" IS NULL
           AND "operationLeaseExpiresAt" IS NULL)
       )
      )::bigint AS "workerInvalidLease",
      (SELECT count(*) FROM "PlatformJobMutation"
       WHERE "action" <> 'WORKER_BATCH'
         AND ("operationBatchSize" IS NOT NULL OR "operationWorkerId" IS NOT NULL
           OR "operationLeaseToken" IS NOT NULL OR "operationFencingToken" IS NOT NULL
           OR "operationLeaseExpiresAt" IS NOT NULL OR "operationCompletedAt" IS NOT NULL)
      )::bigint AS "nonWorkerOperation",
      (SELECT count(*) FROM "MediaRendition" WHERE NOT (
        ("state" IN ('READY', 'SUPERSEDED')
          AND "mimeType" IS NOT NULL AND "mimeType" = 'image/webp'
          AND "sizeBytes" IS NOT NULL AND "sizeBytes" BETWEEN 1 AND 4194304
          AND "checksumSha256" IS NOT NULL AND "checksumSha256" ~ '^[a-f0-9]{64}$'
          AND "width" IS NOT NULL AND "width" BETWEEN 1 AND 1600
          AND "height" IS NOT NULL AND "height" BETWEEN 1 AND 1600
          AND "width"::bigint * "height"::bigint <= 2560000 AND "readyAt" IS NOT NULL)
        OR
        ("state" IN ('PENDING', 'PROCESSING', 'FAILED')
          AND "providerObjectVersion" IS NULL AND "mimeType" IS NULL
          AND "sizeBytes" IS NULL AND "checksumSha256" IS NULL
          AND "width" IS NULL AND "height" IS NULL AND "readyAt" IS NULL)
        OR
        ("state" IN ('DELETE_PENDING', 'DELETED') AND (
          ("providerObjectVersion" IS NULL AND "mimeType" IS NULL
            AND "sizeBytes" IS NULL AND "checksumSha256" IS NULL
            AND "width" IS NULL AND "height" IS NULL AND "readyAt" IS NULL)
          OR
          ("mimeType" IS NOT NULL AND "mimeType" = 'image/webp'
            AND "sizeBytes" IS NOT NULL AND "sizeBytes" BETWEEN 1 AND 4194304
            AND "checksumSha256" IS NOT NULL AND "checksumSha256" ~ '^[a-f0-9]{64}$'
            AND "width" IS NOT NULL AND "width" BETWEEN 1 AND 1600
            AND "height" IS NOT NULL AND "height" BETWEEN 1 AND 1600
            AND "width"::bigint * "height"::bigint <= 2560000 AND "readyAt" IS NOT NULL)
        ))
      ))::bigint AS "invalidOutput",
      (SELECT count(*) FROM "MediaRendition" WHERE NOT (
        ("width" IS NULL AND "height" IS NULL)
        OR
        ("width" IS NOT NULL AND "height" IS NOT NULL
          AND "width" >= 1 AND "height" >= 1
          AND (("profile" = 'AVATAR_256_WEBP' AND "width" <= 256 AND "height" <= 256)
            OR ("profile" = 'CARD_640_WEBP' AND "width" <= 640 AND "height" <= 640)
            OR ("profile" = 'HERO_1600_WEBP' AND "width" <= 1600 AND "height" <= 1600)))
      ))::bigint AS "invalidProfileDimensions",
      (SELECT count(*) FROM "MediaRendition" WHERE NOT (
        ("state" = 'DELETE_PENDING' AND "deleteRequestedAt" IS NOT NULL AND "deletedAt" IS NULL)
        OR ("state" = 'DELETED' AND "deleteRequestedAt" IS NOT NULL AND "deletedAt" IS NOT NULL)
        OR ("state" NOT IN ('DELETE_PENDING', 'DELETED')
          AND "deleteRequestedAt" IS NULL AND "deletedAt" IS NULL)
      ))::bigint AS "invalidDeletionLifecycle"
  `);
  if (!row) throw new Error("Gate 6B constraint closure could not read sanitized violation counts.");
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      shell: false,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Gate 6B constraint closure command failed safely (${code ?? signal}).`));
    });
  });
}

const keepAlive = setInterval(() => undefined, 1_000);
main()
  .catch((error: unknown) => {
    process.exitCode = 1;
    console.error(error instanceof Error && /^Gate 6B constraint closure/u.test(error.message)
      ? error.message
      : "Gate 6B constraint closure failed closed.");
  })
  .finally(() => {
    clearInterval(keepAlive);
  });
