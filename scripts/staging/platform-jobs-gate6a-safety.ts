import type { PrismaClient } from "@prisma/client";

import { assertGate6aTransportEvidence, type Gate6aTransportEvidence } from "../../lib/db/postgres-transport";

export const PLATFORM_JOBS_GATE6A_CONFIRMATION = "REZNO_STAGE6_GATE6A_STAGING_ONLY";
const STORAGE_MEDIA_GATE6B_CONFIRMATION = "REZNO_STAGE6_GATE6B_STAGING_ONLY";
const GATE6A_MIGRATIONS = BigInt(44);
const GATE6B_SUCCESSOR_MIGRATIONS = BigInt(46);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

type SafetyClient = Pick<PrismaClient, "$queryRaw">;

export async function assertPlatformJobsGate6aStaging(
  prisma: SafetyClient,
  environment: NodeJS.ProcessEnv = process.env,
  transportEvidence?: Gate6aTransportEvidence,
) {
  if (
    environment.NODE_ENV === "production"
    || environment.REZNO_ENV !== "staging"
    || environment.REZNO_STAGE6_GATE6A_CONFIRM !== PLATFORM_JOBS_GATE6A_CONFIRMATION
  ) throw new Error("Gate 6A fixture requires the exact non-production staging environment and confirmation marker.");

  const target = parseDatabaseTarget(environment.DATABASE_URL);
  const gate6bSuccessor =
    environment.REZNO_STAGE6_GATE6B_CONFIRM === STORAGE_MEDIA_GATE6B_CONFIRMATION;
  const localOverrideRequested = isExactLocalTestTarget(environment, target);
  if (!localOverrideRequested) {
    assertGate6aTransportEvidence(
      transportEvidence,
      environment,
      gate6bSuccessor ? { requireHealthy44: false } : undefined,
    );
  }
  const [connection] = await prisma.$queryRaw<Array<{ database: string; encrypted: boolean; user: string }>>`
    SELECT current_database() AS database,
           current_user AS user,
           COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false) AS encrypted
  `;
  if (connection?.database !== "rezno_staging" || /prod(?:uction)?|live/i.test(connection?.database ?? "")) {
    throw new Error("Gate 6A fixture requires the exact non-production rezno_staging database.");
  }
  if (target.database !== connection.database) {
    throw new Error("Gate 6A DATABASE_URL does not target the authenticated staging database.");
  }
  if (target.user !== connection.user) {
    throw new Error("Gate 6A DATABASE_URL username does not match the authenticated database role.");
  }

  const localUnencrypted = isExactLocalTestOverride(environment, target, connection);
  if (!localUnencrypted) assertExactRealStagingTarget(environment, target, connection);

  const [migrations] = await prisma.$queryRaw<Array<{ applied: bigint; failed: bigint; rolledBack: bigint; total: bigint }>>`
    SELECT count(*)::bigint AS total,
           count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::bigint AS applied,
           count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::bigint AS failed,
           count(*) FILTER (WHERE rolled_back_at IS NOT NULL)::bigint AS "rolledBack"
    FROM "_prisma_migrations"
  `;
  const expectedMigrations = gate6bSuccessor
    ? GATE6B_SUCCESSOR_MIGRATIONS
    : GATE6A_MIGRATIONS;
  if (
    migrations?.total !== expectedMigrations
    || migrations.applied !== expectedMigrations
    || migrations.failed !== BigInt(0)
    || migrations.rolledBack !== BigInt(0)
  ) {
    throw new Error(
      `Gate 6A fixture requires an exact healthy ${expectedMigrations}/${expectedMigrations} migration state.`,
    );
  }

  return {
    backendPgStatSsl: localUnencrypted ? connection.encrypted : transportEvidence!.backendPgStatSsl,
    clientTlsVerified: localUnencrypted ? false : transportEvidence!.clientTlsVerified,
    database: "rezno_staging" as const,
    encrypted: localUnencrypted ? connection.encrypted : transportEvidence!.encrypted,
    hostnameVerified: localUnencrypted ? false : transportEvidence!.hostnameVerified,
    migrations: gate6bSuccessor ? "46/46" as const : "44/44" as const,
    prismaUsedAttestedPhysicalClient: localUnencrypted
      ? false
      : transportEvidence!.prismaUsedAttestedPhysicalClient,
    role: connection.user,
    rolledBack: 0 as const,
    tlsProtocol: localUnencrypted ? null : transportEvidence!.protocol,
    transport: localUnencrypted ? "LOCAL_TEST_TCP" as const : transportEvidence!.transport,
    transportConfigurationSha256: localUnencrypted
      ? null
      : transportEvidence!.transportConfigurationSha256,
  };
}

type DatabaseTarget = {
  database: string;
  host: string;
  protocol: "postgres:" | "postgresql:";
  sslmode: string | null;
  user: string;
};

function parseDatabaseTarget(databaseUrl: string | undefined): DatabaseTarget {
  if (!databaseUrl) throw new Error("Gate 6A staging requires DATABASE_URL.");
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Gate 6A staging requires a parseable DATABASE_URL.");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("Gate 6A staging requires a PostgreSQL DATABASE_URL protocol.");
  }
  if (parsed.pathname !== "/rezno_staging") {
    throw new Error("Gate 6A DATABASE_URL must use the exact rezno_staging path.");
  }
  const sslmodes = parsed.searchParams.getAll("sslmode");
  if (sslmodes.length > 1) {
    throw new Error("Gate 6A DATABASE_URL must contain at most one sslmode value.");
  }
  let user: string;
  try {
    user = decodeURIComponent(parsed.username);
  } catch {
    throw new Error("Gate 6A DATABASE_URL contains an invalid encoded username.");
  }
  if (!user) throw new Error("Gate 6A DATABASE_URL requires an explicit database username.");
  return {
    database: parsed.pathname.slice(1),
    host: parsed.hostname.toLowerCase(),
    protocol: parsed.protocol,
    sslmode: sslmodes[0] ?? null,
    user,
  };
}

function isExactLocalTestOverride(
  environment: NodeJS.ProcessEnv,
  target: DatabaseTarget,
  connection: { database: string; encrypted: boolean; user: string },
) {
  if (environment.REZNO_STAGE6_GATE6A_ALLOW_LOCAL_UNENCRYPTED !== "true") return false;
  if (
    environment.NODE_ENV !== "test"
    || connection.encrypted
    || !LOOPBACK_HOSTS.has(target.host)
    || target.database !== "rezno_staging"
    || target.user !== connection.user
    || (target.sslmode !== null && target.sslmode !== "disable")
  ) throw new Error("Gate 6A local-unencrypted override is restricted to the exact loopback test target.");
  return true;
}

function isExactLocalTestTarget(environment: NodeJS.ProcessEnv, target: DatabaseTarget) {
  return environment.REZNO_STAGE6_GATE6A_ALLOW_LOCAL_UNENCRYPTED === "true"
    && environment.NODE_ENV === "test"
    && LOOPBACK_HOSTS.has(target.host)
    && target.database === "rezno_staging"
    && (target.sslmode === null || target.sslmode === "disable");
}

function assertExactRealStagingTarget(
  environment: NodeJS.ProcessEnv,
  target: DatabaseTarget,
  connection: { database: string; encrypted: boolean; user: string },
) {
  const expectedHost = environment.REZNO_STAGE6_GATE6A_EXPECTED_DATABASE_HOST?.trim().toLowerCase();
  const expectedRole = environment.REZNO_STAGE6_GATE6A_EXPECTED_DATABASE_ROLE?.trim();
  if (!expectedHost || !expectedRole) {
    throw new Error("Gate 6A staging requires authenticated expected host and role confirmations.");
  }
  if (
    !target.host.endsWith(".neon.tech")
    || target.host.includes("-pooler.")
    || LOOPBACK_HOSTS.has(target.host)
  ) throw new Error("Gate 6A staging requires the direct non-pooler Neon endpoint.");
  if (target.sslmode !== "verify-full") {
    throw new Error("Gate 6A staging requires sslmode=verify-full.");
  }
  if (expectedHost !== target.host) {
    throw new Error("Gate 6A DATABASE_URL host does not match authenticated Neon discovery.");
  }
  if (expectedRole !== connection.user || expectedRole !== target.user) {
    throw new Error("Gate 6A database role does not match authenticated Neon discovery.");
  }
}
