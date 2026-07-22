import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { checkServerIdentity, TLSSocket, type PeerCertificate } from "node:tls";

import type { PrismaClient } from "@prisma/client";
import { Pool, type PoolClient, type PoolConfig } from "pg";

const EXPECTED_DATABASE = "rezno_staging";
const EXPECTED_PORT = 5432;
const EXPECTED_MIGRATIONS = 44;
const TLS_PROTOCOLS = new Set(["TLSv1.2", "TLSv1.3"]);
const URL_TLS_PARAMETERS = ["sslmode", "sslcert", "sslkey", "sslrootcert"] as const;

type Gate6aTarget = {
  database: typeof EXPECTED_DATABASE;
  host: string;
  password: string;
  port: typeof EXPECTED_PORT;
  role: string;
};

type SocketEvidence = {
  authorizationErrorAbsent: boolean;
  authorized: boolean;
  encrypted: boolean;
  hostnameVerified: boolean;
  peerCertificateCurrentlyValid: boolean;
  peerCertificatePresent: boolean;
  protocol: string | null;
  remoteAddressNotLoopback: boolean;
  remoteAddressPresent: boolean;
  remotePortMatches: boolean;
  socketServernameMatches: boolean;
  streamIsTlsSocket: boolean;
};

export type Gate6aTransportEvidence = SocketEvidence & {
  backendPgStatSsl: boolean;
  clientTlsVerified: true;
  configurationMatchesPrisma: boolean;
  database: typeof EXPECTED_DATABASE;
  databaseMatches: boolean;
  harmlessTimestampObserved: boolean;
  hostSha256: string;
  inetServerAddressNotLoopback: boolean;
  inetServerAddressPresent: boolean;
  inetServerPortPresent: boolean;
  migrationApplied: number;
  migrationFailed: number;
  migrationRolledBack: number;
  migrationTotal: number;
  nonPooler: boolean;
  prismaDatabaseMatches: boolean;
  prismaRoleMatches: boolean;
  prismaUsedAttestedPhysicalClient: boolean;
  rejectUnauthorized: true;
  role: string;
  roleMatches: boolean;
  systemCaVerification: true;
  transport: "TCP_POSTGRESQL_TLS";
  transportConfigurationSha256: string;
};

type IdentityRow = {
  backendIdentity: string;
  backendPgStatSsl: boolean;
  database: string;
  harmlessTimestamp: Date | string;
  inetServerAddress: string | null;
  inetServerPort: number | null;
  migrationApplied: number | string;
  migrationFailed: number | string;
  migrationRolledBack: number | string;
  migrationTotal: number | string;
  role: string;
};

type TransportPrismaClient = Pick<PrismaClient, "$queryRawUnsafe">;

const IDENTITY_SQL = `
  SELECT identity.*,
         migrations.*
    FROM (
      SELECT current_database() AS "database",
             current_user AS "role",
             pg_backend_pid()::text AS "backendIdentity",
             clock_timestamp() AS "harmlessTimestamp",
             inet_server_addr()::text AS "inetServerAddress",
             inet_server_port() AS "inetServerPort",
             COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false) AS "backendPgStatSsl"
    ) AS identity
    CROSS JOIN (
      SELECT count(*)::integer AS "migrationTotal",
             count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::integer AS "migrationApplied",
             count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::integer AS "migrationFailed",
             count(*) FILTER (WHERE rolled_back_at IS NOT NULL)::integer AS "migrationRolledBack"
        FROM "_prisma_migrations"
    ) AS migrations
`;

export function createPrismaPostgresPool(environment: NodeJS.ProcessEnv = process.env) {
  if (!gate6aRemoteTransportRequested(environment)) {
    return new Pool({ connectionString: environment.DATABASE_URL });
  }
  return new Pool(createGate6aVerifiedPoolConfig(environment));
}

export function createGate6aVerifiedPoolConfig(
  environment: NodeJS.ProcessEnv = process.env,
): Readonly<PoolConfig> {
  const target = parseGate6aRemoteTarget(environment);
  const ssl = Object.freeze({
    rejectUnauthorized: true as const,
    servername: target.host,
  });
  return Object.freeze({
    application_name: "rezno-stage6-gate6a",
    connectionTimeoutMillis: 15_000,
    database: target.database,
    enableChannelBinding: true,
    host: target.host,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    max: 1,
    password: target.password,
    port: target.port,
    ssl,
    user: target.role,
  } satisfies PoolConfig & { enableChannelBinding: true });
}

export function stripConnectionStringTlsParameters(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  for (const key of URL_TLS_PARAMETERS) parsed.searchParams.delete(key);
  return parsed.toString();
}

export function gate6aTransportEvidenceBinding(environment: NodeJS.ProcessEnv = process.env) {
  const target = parseGate6aRemoteTarget(environment);
  return Object.freeze({
    hostSha256: sha256(target.host),
    transportConfigurationSha256: transportConfigurationSha256(target),
  });
}

export async function attestGate6aPrismaTransport(
  pool: Pool,
  prisma: TransportPrismaClient,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<Gate6aTransportEvidence> {
  const target = parseGate6aRemoteTarget(environment);
  const expectedConfigurationSha256 = transportConfigurationSha256(target);
  assertPoolUsesVerifiedConfiguration(pool, target, expectedConfigurationSha256);

  let client: PoolClient | undefined;
  let socketEvidence: SocketEvidence;
  let nodeIdentity: IdentityRow;
  try {
    client = await pool.connect();
    socketEvidence = inspectEstablishedTlsSocket(client, target.host, new Date());
    assertSocketEvidence(socketEvidence);
    const result = await client.query<IdentityRow>(IDENTITY_SQL);
    nodeIdentity = requireIdentityRow(result.rows);
  } catch (error) {
    throw sanitizedTransportError(error);
  } finally {
    client?.release();
  }

  let prismaIdentity: IdentityRow;
  try {
    prismaIdentity = requireIdentityRow(await prisma.$queryRawUnsafe<Array<IdentityRow>>(IDENTITY_SQL));
  } catch (error) {
    throw sanitizedTransportError(error);
  }

  const evidence: Gate6aTransportEvidence = {
    ...socketEvidence,
    backendPgStatSsl: nodeIdentity.backendPgStatSsl,
    clientTlsVerified: true,
    configurationMatchesPrisma: true,
    database: EXPECTED_DATABASE,
    databaseMatches: nodeIdentity.database === EXPECTED_DATABASE,
    harmlessTimestampObserved: validTimestamp(nodeIdentity.harmlessTimestamp)
      && validTimestamp(prismaIdentity.harmlessTimestamp),
    hostSha256: sha256(target.host),
    inetServerAddressNotLoopback: nodeIdentity.inetServerAddress !== null
      && !isLoopbackAddress(nodeIdentity.inetServerAddress),
    inetServerAddressPresent: Boolean(nodeIdentity.inetServerAddress),
    inetServerPortPresent: Number.isInteger(nodeIdentity.inetServerPort),
    migrationApplied: toSafeInteger(nodeIdentity.migrationApplied),
    migrationFailed: toSafeInteger(nodeIdentity.migrationFailed),
    migrationRolledBack: toSafeInteger(nodeIdentity.migrationRolledBack),
    migrationTotal: toSafeInteger(nodeIdentity.migrationTotal),
    nonPooler: !isPoolerHost(target.host),
    prismaDatabaseMatches: prismaIdentity.database === nodeIdentity.database,
    prismaRoleMatches: prismaIdentity.role === nodeIdentity.role,
    prismaUsedAttestedPhysicalClient: prismaIdentity.backendIdentity === nodeIdentity.backendIdentity,
    rejectUnauthorized: true,
    role: nodeIdentity.role,
    roleMatches: nodeIdentity.role === target.role,
    systemCaVerification: true,
    transport: "TCP_POSTGRESQL_TLS",
    transportConfigurationSha256: expectedConfigurationSha256,
  };
  assertGate6aTransportEvidence(evidence, environment, { requireHealthy44: false });
  return Object.freeze(evidence);
}

export function assertGate6aTransportEvidence(
  evidence: Gate6aTransportEvidence | undefined,
  environment: NodeJS.ProcessEnv = process.env,
  options: { requireHealthy44?: boolean } = {},
) {
  const target = parseGate6aRemoteTarget(environment);
  if (!evidence) throw new Error("Gate 6A requires client-side TLS attestation before database use.");
  const required = [
    evidence.streamIsTlsSocket,
    evidence.encrypted,
    evidence.authorized,
    evidence.authorizationErrorAbsent,
    evidence.peerCertificatePresent,
    evidence.peerCertificateCurrentlyValid,
    evidence.hostnameVerified,
    evidence.socketServernameMatches,
    evidence.remotePortMatches,
    evidence.remoteAddressPresent,
    evidence.remoteAddressNotLoopback,
    evidence.inetServerAddressPresent,
    evidence.inetServerAddressNotLoopback,
    evidence.inetServerPortPresent,
    evidence.nonPooler,
    evidence.databaseMatches,
    evidence.roleMatches,
    evidence.prismaDatabaseMatches,
    evidence.prismaRoleMatches,
    evidence.prismaUsedAttestedPhysicalClient,
    evidence.configurationMatchesPrisma,
    evidence.rejectUnauthorized,
    evidence.systemCaVerification,
    evidence.harmlessTimestampObserved,
  ];
  if (required.some((value) => value !== true)) {
    throw new Error("Gate 6A client-side TLS attestation is incomplete or invalid.");
  }
  if (!evidence.protocol || !TLS_PROTOCOLS.has(evidence.protocol)) {
    throw new Error("Gate 6A requires TLS 1.2 or TLS 1.3.");
  }
  if (
    evidence.database !== target.database
    || evidence.role !== target.role
    || evidence.hostSha256 !== sha256(target.host)
    || evidence.transportConfigurationSha256 !== transportConfigurationSha256(target)
    || evidence.transport !== "TCP_POSTGRESQL_TLS"
  ) throw new Error("Gate 6A TLS evidence does not match the authenticated target or Prisma configuration.");
  if (
    options.requireHealthy44 !== false
    && (
      evidence.migrationApplied !== EXPECTED_MIGRATIONS
      || evidence.migrationTotal !== EXPECTED_MIGRATIONS
      || evidence.migrationFailed !== 0
      || evidence.migrationRolledBack !== 0
    )
  ) throw new Error("Gate 6A TLS evidence requires an exact healthy 44/44 migration state.");
}

export function inspectEstablishedTlsSocket(
  client: PoolClient,
  expectedHost: string,
  now: Date,
): SocketEvidence {
  const stream = (client as PoolClient & { connection?: { stream?: unknown } }).connection?.stream;
  if (!(stream instanceof TLSSocket)) return emptySocketEvidence();
  const certificate = stream.getPeerCertificate();
  const peerCertificatePresent = certificatePresent(certificate);
  const validFrom = peerCertificatePresent ? Date.parse(certificate.valid_from) : Number.NaN;
  const validTo = peerCertificatePresent ? Date.parse(certificate.valid_to) : Number.NaN;
  const peerCertificateCurrentlyValid = Number.isFinite(validFrom)
    && Number.isFinite(validTo)
    && validFrom <= now.getTime()
    && now.getTime() <= validTo;
  const hostnameVerified = peerCertificatePresent
    && checkServerIdentity(expectedHost, certificate) === undefined;
  return {
    authorizationErrorAbsent: stream.authorizationError == null,
    authorized: stream.authorized === true,
    encrypted: stream.encrypted === true,
    hostnameVerified,
    peerCertificateCurrentlyValid,
    peerCertificatePresent,
    protocol: stream.getProtocol(),
    remoteAddressNotLoopback: Boolean(stream.remoteAddress) && !isLoopbackAddress(stream.remoteAddress!),
    remoteAddressPresent: Boolean(stream.remoteAddress),
    remotePortMatches: stream.remotePort === EXPECTED_PORT,
    socketServernameMatches: stream.servername === expectedHost,
    streamIsTlsSocket: true,
  };
}

function gate6aRemoteTransportRequested(environment: NodeJS.ProcessEnv) {
  return environment.REZNO_ENV === "staging"
    && environment.REZNO_STAGE6_GATE6A_CONFIRM === "REZNO_STAGE6_GATE6A_STAGING_ONLY"
    && environment.REZNO_STAGE6_GATE6A_ALLOW_LOCAL_UNENCRYPTED !== "true";
}

function parseGate6aRemoteTarget(environment: NodeJS.ProcessEnv): Gate6aTarget {
  if (!gate6aRemoteTransportRequested(environment) || environment.NODE_ENV === "production") {
    throw new Error("Gate 6A verified transport requires the exact non-production staging confirmation.");
  }
  const raw = environment.DATABASE_URL;
  if (!raw) throw new Error("Gate 6A verified transport requires DATABASE_URL.");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Gate 6A verified transport requires a parseable PostgreSQL URL.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Gate 6A verified transport requires PostgreSQL protocol.");
  }
  if (parsed.pathname !== `/${EXPECTED_DATABASE}`) {
    throw new Error("Gate 6A verified transport requires the exact rezno_staging database.");
  }
  const sslmodes = parsed.searchParams.getAll("sslmode");
  if (sslmodes.length !== 1 || sslmodes[0] !== "verify-full") {
    throw new Error("Gate 6A verified transport requires exactly one sslmode=verify-full value.");
  }
  const channelBindings = parsed.searchParams.getAll("channel_binding");
  if (channelBindings.length > 1 || (channelBindings.length === 1 && channelBindings[0] !== "require")) {
    throw new Error("Gate 6A verified transport rejects weakened channel-binding metadata.");
  }
  for (const key of ["host", "port", "user", "database", "ssl", "sslnegotiation", "uselibpqcompat"]) {
    if (parsed.searchParams.has(key)) {
      throw new Error("Gate 6A verified transport rejects URL transport overrides.");
    }
  }
  const host = parsed.hostname.toLowerCase();
  const expectedHostRaw = environment.REZNO_STAGE6_GATE6A_EXPECTED_DATABASE_HOST;
  const expectedRoleRaw = environment.REZNO_STAGE6_GATE6A_EXPECTED_DATABASE_ROLE;
  if (!expectedHostRaw || !expectedRoleRaw) {
    throw new Error("Gate 6A verified transport requires authenticated host and role metadata.");
  }
  const expectedHost = expectedHostRaw.trim().toLowerCase();
  const expectedRole = expectedRoleRaw.trim();
  if (!validDnsHostname(expectedHost) || !expectedHost.endsWith(".neon.tech") || isPoolerHost(expectedHost)) {
    throw new Error("Gate 6A verified transport requires a valid direct Neon hostname.");
  }
  if (host !== expectedHost) {
    throw new Error("Gate 6A verified transport host does not match authenticated discovery.");
  }
  const port = parsed.port ? Number(parsed.port) : EXPECTED_PORT;
  if (port !== EXPECTED_PORT) throw new Error("Gate 6A verified transport requires port 5432.");
  const role = decodeUrlComponent(parsed.username, "role");
  const password = decodeUrlComponent(parsed.password, "credential");
  if (!role || role !== expectedRole || !password) {
    throw new Error("Gate 6A verified transport role or credential metadata is invalid.");
  }
  return { database: EXPECTED_DATABASE, host, password, port: EXPECTED_PORT, role };
}

function assertPoolUsesVerifiedConfiguration(pool: Pool, target: Gate6aTarget, expectedHash: string) {
  const options = pool.options as PoolConfig & { enableChannelBinding?: boolean };
  const ssl = typeof options.ssl === "object" && options.ssl !== null ? options.ssl : undefined;
  const actualHash = transportConfigurationSha256({
    database: options.database,
    host: options.host,
    port: options.port,
    role: options.user,
  });
  if (
    options.connectionString !== undefined
    || options.host !== target.host
    || options.database !== target.database
    || options.user !== target.role
    || options.port !== target.port
    || options.max !== 1
    || options.enableChannelBinding !== true
    || !ssl
    || ssl.rejectUnauthorized !== true
    || ssl.servername !== target.host
    || actualHash !== expectedHash
  ) throw new Error("Gate 6A probe and Prisma must use the same explicit verified pool configuration.");
}

function transportConfigurationSha256(target: {
  database?: string;
  host?: string;
  port?: number;
  role?: string;
}) {
  return sha256(JSON.stringify({
    database: target.database,
    host: target.host,
    max: 1,
    port: target.port,
    rejectUnauthorized: true,
    role: target.role,
    servername: target.host,
    systemCa: true,
    transport: "TCP_POSTGRESQL_TLS",
  }));
}

function assertSocketEvidence(evidence: SocketEvidence) {
  if (
    !evidence.streamIsTlsSocket
    || !evidence.encrypted
    || !evidence.authorized
    || !evidence.authorizationErrorAbsent
    || !evidence.peerCertificatePresent
    || !evidence.peerCertificateCurrentlyValid
    || !evidence.hostnameVerified
    || !evidence.socketServernameMatches
    || !evidence.remotePortMatches
    || !evidence.remoteAddressPresent
    || !evidence.remoteAddressNotLoopback
    || !evidence.protocol
    || !TLS_PROTOCOLS.has(evidence.protocol)
  ) throw new Error("Gate 6A established socket failed TLS, certificate, hostname, or endpoint attestation.");
}

function requireIdentityRow(rows: IdentityRow[]) {
  if (rows.length !== 1 || !rows[0]) throw new Error("Gate 6A transport identity query returned an invalid result.");
  return rows[0];
}

function emptySocketEvidence(): SocketEvidence {
  return {
    authorizationErrorAbsent: false,
    authorized: false,
    encrypted: false,
    hostnameVerified: false,
    peerCertificateCurrentlyValid: false,
    peerCertificatePresent: false,
    protocol: null,
    remoteAddressNotLoopback: false,
    remoteAddressPresent: false,
    remotePortMatches: false,
    socketServernameMatches: false,
    streamIsTlsSocket: false,
  };
}

function certificatePresent(certificate: PeerCertificate) {
  return Object.keys(certificate).length > 0 && Boolean(certificate.raw);
}

function validDnsHostname(host: string) {
  return host.length <= 253
    && isIP(host) === 0
    && host.split(".").every((label) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/u.test(label));
}

function isPoolerHost(host: string) {
  return host.includes("-pooler.") || host.includes(".pooler.");
}

function isLoopbackAddress(address: string) {
  const normalized = address.toLowerCase();
  return normalized === "::1"
    || normalized === "0:0:0:0:0:0:0:1"
    || normalized.startsWith("127.")
    || normalized.startsWith("::ffff:127.");
}

function decodeUrlComponent(value: string, label: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(`Gate 6A verified transport contains an invalid encoded ${label}.`);
  }
}

function validTimestamp(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime());
}

function toSafeInteger(value: number | string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("Gate 6A transport returned an invalid migration count.");
  }
  return parsed;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function sanitizedTransportError(error: unknown) {
  if (error instanceof Error && /^Gate 6A /u.test(error.message)) return error;
  return new Error("Gate 6A PostgreSQL transport attestation failed closed.");
}
