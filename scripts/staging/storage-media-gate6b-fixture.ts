import { createHash } from "node:crypto";

import {
  Prisma,
  type MediaRenditionProfile,
  type PlatformJobScheduleKey,
  type PlatformJobType,
  type PrismaClient,
  type StoredAssetState,
} from "@prisma/client";

import {
  generateMediaRenditionObjectKey,
  mediaRenditionSourceFingerprint,
} from "../../features/media/domain/rendition-registry";
import { platformJobHash } from "../../features/platform-jobs/domain/canonical";

export const STORAGE_MEDIA_GATE6B_MARKER = "rezno-qa-stage6-gate6b-storage-media";
const baseTime = new Date("2026-07-22T15:00:00.123456Z");
export const STORAGE_MEDIA_GATE6B_SOURCE_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAICAIAAAB/FOjAAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAE0lEQVQY02NQCV9GEmIY1UALDQBo+pCBCm3VswAAAABJRU5ErkJggg==",
  "base64",
);
const sourceChecksum = createHash("sha256").update(STORAGE_MEDIA_GATE6B_SOURCE_BYTES).digest("hex");
const outputChecksum = "b".repeat(64);
const outputObjectVersion = "gate6b-output-object-version";
const id = (value: number) => `6b000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

export const storageMediaGate6bFixtureIds = {
  adminAccessId: id(11),
  adminPersonId: id(12),
  adminUserId: `${STORAGE_MEDIA_GATE6B_MARKER}-admin`,
  customerPersonId: id(13),
  customerUserId: `${STORAGE_MEDIA_GATE6B_MARKER}-customer`,
  businessPersonId: id(14),
  businessUserId: `${STORAGE_MEDIA_GATE6B_MARKER}-business`,
  organizationId: id(20),
  roleId: id(21),
  membershipId: id(22),
  sessions: {
    retainedOrphan: id(101),
    dueOrphan: id(102),
    deletePending: id(103),
    activeBound: id(104),
    quarantined: id(105),
    explicitReady: id(106),
    renditionSource: id(107),
  },
  assets: {
    deletePending: id(201),
    activeBound: id(202),
    quarantined: id(203),
    explicitReady: id(204),
    renditionSource: id(205),
  },
  containers: {
    active: id(301),
    detached: id(302),
    activeBound: id(303),
  },
  bindings: {
    active: id(311),
    detached: id(312),
    activeBound: id(313),
  },
  renditions: {
    ready: id(401),
    stale: id(402),
    failed: id(403),
    deletePending: id(404),
  },
  schedules: {
    maintenance: id(501),
    rescan: id(502),
    rendition: id(503),
    renditionCleanup: id(504),
  },
  jobs: {
    maintenance: id(601),
    orphan: id(602),
    assetDelete: id(603),
    rescanDiscovery: id(604),
    rescan: id(605),
    renditionDiscovery: id(606),
    renditionGenerate: id(607),
    renditionCleanupDiscovery: id(608),
    renditionDelete: id(609),
  },
  attemptId: id(620),
  attemptLeaseToken: id(621),
} as const;

const fixtureUsers = [
  storageMediaGate6bFixtureIds.adminUserId,
  storageMediaGate6bFixtureIds.customerUserId,
  storageMediaGate6bFixtureIds.businessUserId,
];
const fixturePeople = [
  storageMediaGate6bFixtureIds.adminPersonId,
  storageMediaGate6bFixtureIds.customerPersonId,
  storageMediaGate6bFixtureIds.businessPersonId,
];
const fixtureSessions = Object.values(storageMediaGate6bFixtureIds.sessions);
const fixtureAssets = Object.values(storageMediaGate6bFixtureIds.assets);

export async function seedStorageMediaGate6bFixture(prisma: PrismaClient) {
  await cleanupStorageMediaGate6bFixture(prisma);
  const ids = storageMediaGate6bFixtureIds;

  await prisma.$transaction(async (transaction) => {
    await transaction.user.createMany({ data: [
      user(ids.adminUserId, "admin"),
      user(ids.customerUserId, "customer"),
      user(ids.businessUserId, "business"),
    ] });
    await transaction.person.createMany({ data: [
      person(ids.adminPersonId, ids.adminUserId, "Gate6BAdmin"),
      person(ids.customerPersonId, ids.customerUserId, "Gate6BCustomer"),
      person(ids.businessPersonId, ids.businessUserId, "Gate6BBusiness"),
    ] });
    await transaction.adminAccess.create({ data: {
      createdAt: baseTime,
      id: ids.adminAccessId,
      permissions: [
        "STORAGE_RECORDS_VIEW",
        "STORAGE_RECORDS_MANAGE",
        "PLATFORM_JOBS_VIEW",
        "PLATFORM_JOBS_MANAGE",
      ],
      role: "ADMIN",
      status: "ACTIVE",
      updatedAt: baseTime,
      userId: ids.adminUserId,
    } });
    await transaction.organization.create({ data: {
      createdAt: baseTime,
      id: ids.organizationId,
      name: STORAGE_MEDIA_GATE6B_MARKER,
      slug: STORAGE_MEDIA_GATE6B_MARKER,
      updatedAt: baseTime,
    } });
    await transaction.role.create({ data: {
      createdAt: baseTime,
      id: ids.roleId,
      isSystem: true,
      name: `${STORAGE_MEDIA_GATE6B_MARKER}-owner`,
      organizationId: ids.organizationId,
      systemRole: "OWNER",
      updatedAt: baseTime,
    } });
    await transaction.organizationMember.create({ data: {
      createdAt: baseTime,
      id: ids.membershipId,
      organizationId: ids.organizationId,
      personId: ids.businessPersonId,
      roleId: ids.roleId,
      status: "ACTIVE",
      updatedAt: baseTime,
    } });

    await transaction.uploadSession.createMany({ data: sessionRows() });
    await transaction.storedAsset.createMany({ data: assetRows() });
    await transaction.mediaContainer.createMany({ data: [
      {
        createdAt: baseTime,
        id: ids.containers.active,
        kind: "CUSTOMER_PROFILE",
        personId: ids.customerPersonId,
        updatedAt: baseTime,
        version: 2,
      },
      {
        createdAt: baseTime,
        id: ids.containers.detached,
        kind: "BUSINESS_PROFILE",
        organizationId: ids.organizationId,
        updatedAt: baseTime,
        version: 2,
      },
      {
        createdAt: baseTime,
        id: ids.containers.activeBound,
        kind: "CUSTOMER_PROFILE",
        personId: ids.adminPersonId,
        updatedAt: baseTime,
        version: 1,
      },
    ] });
    await transaction.mediaBinding.createMany({ data: [
      {
        assetId: ids.assets.renditionSource,
        attachedAt: baseTime,
        containerId: ids.containers.active,
        createdAt: baseTime,
        createdByPersonId: ids.customerPersonId,
        id: ids.bindings.active,
        slot: "CUSTOMER_AVATAR",
        state: "ACTIVE",
        updatedAt: baseTime,
        version: 1,
      },
      {
        assetId: ids.assets.explicitReady,
        attachedAt: baseTime,
        containerId: ids.containers.active,
        createdAt: baseTime,
        createdByPersonId: ids.customerPersonId,
        detachedAt: new Date(baseTime.getTime() + 1_000),
        detachedByPersonId: ids.customerPersonId,
        id: ids.bindings.detached,
        slot: "CUSTOMER_AVATAR",
        state: "DETACHED",
        updatedAt: new Date(baseTime.getTime() + 1_000),
        version: 2,
      },
      {
        assetId: ids.assets.activeBound,
        attachedAt: baseTime,
        containerId: ids.containers.activeBound,
        createdAt: baseTime,
        createdByPersonId: ids.adminPersonId,
        id: ids.bindings.activeBound,
        slot: "CUSTOMER_AVATAR",
        state: "ACTIVE",
        updatedAt: baseTime,
        version: 1,
      },
    ] });
    await transaction.mediaRendition.createMany({ data: renditionRows() });
    await transaction.platformJobSchedule.createMany({ data: scheduleRows() });
    await transaction.platformJob.createMany({ data: jobRows() });
    const completed = ids.jobs.maintenance;
    const result = { kind: "STORAGE_MAINTENANCE_DISCOVERED", queued: 0, scanned: 0 };
    await transaction.platformJobAttempt.create({ data: {
      attemptNumber: 1,
      createdAt: baseTime,
      fencingToken: BigInt(1),
      finishedAt: new Date(baseTime.getTime() + 2_000),
      heartbeatAt: new Date(baseTime.getTime() + 1_000),
      id: ids.attemptId,
      jobId: completed,
      leaseToken: ids.attemptLeaseToken,
      resultHash: platformJobHash(result),
      resultMetadata: result,
      startedAt: new Date(baseTime.getTime() + 1_000),
      status: "SUCCEEDED",
      updatedAt: new Date(baseTime.getTime() + 2_000),
      workerId: "staging:gate6b:fixture-worker",
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });

  return storageMediaGate6bFixtureFingerprint(prisma);
}

export async function storageMediaGate6bFixtureFingerprint(prisma: PrismaClient) {
  const ids = storageMediaGate6bFixtureIds;
  const [actors, sessions, assets, containers, bindings, renditions, schedules, jobs, attempts] = await Promise.all([
    prisma.person.findMany({
      where: { id: { in: fixturePeople } },
      orderBy: { id: "asc" },
      select: { authUserId: true, id: true, status: true },
    }),
    prisma.uploadSession.findMany({
      where: { id: { in: fixtureSessions } },
      orderBy: { id: "asc" },
      select: { failureCode: true, id: true, state: true, version: true },
    }),
    prisma.storedAsset.findMany({
      where: { id: { in: fixtureAssets } },
      orderBy: { id: "asc" },
      select: { id: true, inspectionPolicyVersion: true, state: true, version: true },
    }),
    prisma.mediaContainer.findMany({
      where: { id: { in: Object.values(ids.containers) } },
      orderBy: { id: "asc" },
      select: { id: true, kind: true, version: true },
    }),
    prisma.mediaBinding.findMany({
      where: { id: { in: Object.values(ids.bindings) } },
      orderBy: { id: "asc" },
      select: { assetId: true, id: true, slot: true, state: true, version: true },
    }),
    prisma.mediaRendition.findMany({
      where: { id: { in: Object.values(ids.renditions) } },
      orderBy: { id: "asc" },
      select: { id: true, profile: true, sourceAssetId: true, sourceAssetVersion: true, state: true, version: true },
    }),
    prisma.platformJobSchedule.findMany({
      where: { id: { in: Object.values(ids.schedules) } },
      orderBy: { id: "asc" },
      select: { enabled: true, id: true, jobType: true, scheduleKey: true, version: true },
    }),
    prisma.platformJob.findMany({
      where: { createdByAdminUserId: ids.adminUserId },
      orderBy: { id: "asc" },
      select: { attemptCount: true, id: true, jobType: true, status: true, version: true },
    }),
    prisma.platformJobAttempt.findMany({
      where: { job: { createdByAdminUserId: ids.adminUserId } },
      orderBy: [{ jobId: "asc" }, { attemptNumber: "asc" }],
      select: { attemptNumber: true, jobId: true, status: true },
    }),
  ]);
  const value = jsonSafe({ actors, assets, attempts, bindings, containers, jobs, renditions, schedules, sessions });
  return {
    counts: {
      actors: actors.length,
      assets: assets.length,
      attempts: attempts.length,
      bindings: bindings.length,
      containers: containers.length,
      jobs: jobs.length,
      renditions: renditions.length,
      schedules: schedules.length,
      sessions: sessions.length,
    },
    fingerprint: createHash("sha256").update(JSON.stringify(value)).digest("hex"),
  };
}

export async function storageMediaGate6bNonFixtureFingerprint(prisma: PrismaClient) {
  const ids = storageMediaGate6bFixtureIds;
  const tables = await prisma.$queryRaw<Array<{ table: string }>>(Prisma.sql`
    SELECT tablename AS table
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `);
  const components: Array<{ count: string; digest: string; table: string }> = [];
  for (const { table } of tables) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(table)) throw new Error("Unexpected staging table identifier.");
    const quoted = `"${table.replaceAll('"', '""')}"`;
    const where = nonFixtureWhere(table, ids);
    const rowValue = normalizedRowValue(table);
    const [row] = await prisma.$queryRawUnsafe<Array<{ count: bigint; digest: string }>>(
      `SELECT count(*)::bigint AS count, md5(COALESCE(string_agg(md5((${rowValue})::text), '' ORDER BY md5((${rowValue})::text)), '')) AS digest FROM ${quoted} AS row_value ${where}`,
    );
    if (table === "MediaRendition" && row.count === BigInt(0)) continue;
    components.push({ count: row.count.toString(), digest: row.digest, table });
  }
  return createHash("sha256").update(JSON.stringify(components)).digest("hex");
}

export async function storageMediaGate6bForeignSentinels(prisma: PrismaClient) {
  const [person, organization] = await Promise.all([
    prisma.person.findFirst({
      where: { id: { notIn: fixturePeople } },
      orderBy: { id: "asc" },
      select: { id: true, status: true, updatedAt: true },
    }),
    prisma.organization.findFirst({
      where: { id: { not: storageMediaGate6bFixtureIds.organizationId } },
      orderBy: { id: "asc" },
      select: { id: true, status: true, updatedAt: true },
    }),
  ]);
  if (process.env.NODE_ENV !== "test" && (!person || !organization)) {
    throw new Error("Gate 6B real staging requires pre-existing foreign Person and Organization sentinels.");
  }
  return {
    organization: organization ? sentinelHash(organization) : null,
    person: person ? sentinelHash(person) : null,
  };
}

export async function cleanupStorageMediaGate6bFixture(prisma: PrismaClient) {
  const ids = storageMediaGate6bFixtureIds;
  const cleanup = await prisma.$transaction(async (transaction) => {
    await transaction.storedAsset.updateMany({
      where: { id: { in: fixtureAssets } },
      data: {
        rescanClaimExpiresAt: null,
        rescanClaimFencingToken: null,
        rescanClaimJobId: null,
        rescanClaimLeaseToken: null,
      },
    });
    await transaction.$executeRaw(Prisma.sql`
      UPDATE "MediaRendition"
      SET "state" = CASE WHEN "state" = 'PROCESSING' THEN 'PENDING'::"MediaRenditionState" ELSE "state" END,
          "claimExpiresAt" = NULL,
          "claimFencingToken" = NULL,
          "claimJobId" = NULL,
          "claimLeaseToken" = NULL
      WHERE "sourceAssetId" IN (${Prisma.join(fixtureAssets.map((id) => Prisma.sql`${id}::uuid`))})
    `);
    const mutations = await transaction.platformJobMutation.deleteMany({ where: { actorAdminUserId: ids.adminUserId } });
    const attempts = await transaction.platformJobAttempt.deleteMany({ where: { job: { createdByAdminUserId: ids.adminUserId } } });
    const childJobs = await transaction.platformJob.deleteMany({ where: { createdByAdminUserId: ids.adminUserId, parentJobId: { not: null } } });
    const jobs = await transaction.platformJob.deleteMany({ where: { createdByAdminUserId: ids.adminUserId } });
    const schedules = await transaction.platformJobSchedule.deleteMany({ where: { createdByAdminUserId: ids.adminUserId } });
    const renditions = await transaction.mediaRendition.deleteMany({ where: { sourceAssetId: { in: fixtureAssets } } });
    const mediaMutations = await transaction.mediaMutation.deleteMany({ where: { actorPersonId: { in: fixturePeople } } });
    const bindings = await transaction.mediaBinding.deleteMany({ where: { id: { in: Object.values(ids.bindings) } } });
    const containers = await transaction.mediaContainer.deleteMany({ where: { id: { in: Object.values(ids.containers) } } });
    const storageMutations = await transaction.storageMutation.deleteMany({ where: { actorPersonId: { in: fixturePeople } } });
    const assets = await transaction.storedAsset.deleteMany({ where: { id: { in: fixtureAssets } } });
    const sessions = await transaction.uploadSession.deleteMany({ where: { id: { in: fixtureSessions } } });
    const auditLogs = await transaction.adminAuditLog.deleteMany({ where: { adminUserId: ids.adminUserId } });
    const adminAccess = await transaction.adminAccess.deleteMany({ where: { id: ids.adminAccessId } });
    const membership = await transaction.organizationMember.deleteMany({ where: { id: ids.membershipId } });
    const role = await transaction.role.deleteMany({ where: { id: ids.roleId } });
    const organization = await transaction.organization.deleteMany({ where: { id: ids.organizationId } });
    const people = await transaction.person.deleteMany({ where: { id: { in: fixturePeople } } });
    const users = await transaction.user.deleteMany({ where: { id: { in: fixtureUsers } } });
    return {
      adminAccess: adminAccess.count,
      assets: assets.count,
      attempts: attempts.count,
      auditLogs: auditLogs.count,
      bindings: bindings.count,
      childJobs: childJobs.count,
      containers: containers.count,
      jobs: jobs.count,
      mediaMutations: mediaMutations.count,
      membership: membership.count,
      organization: organization.count,
      people: people.count,
      renditions: renditions.count,
      role: role.count,
      schedules: schedules.count,
      sessions: sessions.count,
      storageMutations: storageMutations.count,
      mutations: mutations.count,
      users: users.count,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  return cleanup;
}

export function storageMediaGate6bCleanupTotal(
  cleanup: Awaited<ReturnType<typeof cleanupStorageMediaGate6bFixture>>,
) {
  return Object.values(cleanup).reduce((sum, count) => sum + count, 0);
}

function sessionRows() {
  const ids = storageMediaGate6bFixtureIds;
  const objectKey = (index: number) => `staging/customer-avatar/${id(800 + index)}/${id(900 + index)}`;
  const expired = (sessionId: string, index: number, expiresAt: Date) => ({
    actorPersonId: ids.customerPersonId,
    createdAt: baseTime,
    expectedChecksumSha256: sourceChecksum,
    expectedMimeType: "image/png",
    expectedSizeBytes: BigInt(STORAGE_MEDIA_GATE6B_SOURCE_BYTES.byteLength),
    expiresAt,
    id: sessionId,
    objectKey: objectKey(index),
    ownerPersonId: ids.customerPersonId,
    provider: "DETERMINISTIC_TEST" as const,
    purpose: "CUSTOMER_AVATAR" as const,
    state: "EXPIRED" as const,
    updatedAt: baseTime,
    version: 1,
    visibility: "PRIVATE" as const,
  });
  const finalized = (sessionId: string, index: number) => ({
    ...expired(sessionId, index, new Date("2027-07-22T15:00:00.123456Z")),
    finalizedAt: baseTime,
    state: "FINALIZED" as const,
  });
  const rows = [
    expired(ids.sessions.retainedOrphan, 1, new Date("2026-07-22T14:00:00.123456Z")),
    expired(ids.sessions.dueOrphan, 2, new Date("2026-07-20T14:00:00.123456Z")),
    finalized(ids.sessions.deletePending, 3),
    {
      ...finalized(ids.sessions.activeBound, 4),
      actorPersonId: ids.adminPersonId,
      ownerPersonId: ids.adminPersonId,
    },
    finalized(ids.sessions.quarantined, 5),
    finalized(ids.sessions.explicitReady, 6),
    finalized(ids.sessions.renditionSource, 7),
  ];
  return rows;
}

function assetRows() {
  const ids = storageMediaGate6bFixtureIds;
  const sessions = new Map(sessionRows().map((session) => [session.id, session]));
  const row = (
    assetId: string,
    sessionId: string,
    state: StoredAssetState,
    version = 1,
    inspectionPolicyVersion: number | null = 1,
  ) => {
    const session = sessions.get(sessionId)!;
    return {
      checksumSha256: sourceChecksum,
      createdAt: baseTime,
      createdByPersonId: session.actorPersonId,
      deleteRequestedAt: state === "DELETE_PENDING" ? baseTime : null,
      id: assetId,
      inspectionMetadata: { format: "png", height: 8, pages: 1, width: 16 },
      inspectionOutcome: "VALID" as const,
      inspectionPolicyVersion,
      mimeType: "image/png",
      objectKey: session.objectKey,
      ownerPersonId: session.ownerPersonId,
      provider: "DETERMINISTIC_TEST" as const,
      providerObjectVersion: deterministicObjectVersion(session.objectKey, sourceChecksum),
      purpose: "CUSTOMER_AVATAR" as const,
      quarantinedAt: state === "QUARANTINED" ? baseTime : null,
      readyAt: state === "READY" || state === "DELETE_PENDING" ? baseTime : null,
      scannerOutcome: "SCANNER_NOT_CONFIGURED" as const,
      sizeBytes: BigInt(STORAGE_MEDIA_GATE6B_SOURCE_BYTES.byteLength),
      state,
      updatedAt: baseTime,
      uploadSessionId: sessionId,
      version,
      visibility: "PRIVATE" as const,
    };
  };
  return [
    row(ids.assets.deletePending, ids.sessions.deletePending, "DELETE_PENDING"),
    row(ids.assets.activeBound, ids.sessions.activeBound, "DELETE_PENDING"),
    row(ids.assets.quarantined, ids.sessions.quarantined, "QUARANTINED", 1, null),
    row(ids.assets.explicitReady, ids.sessions.explicitReady, "READY", 2),
    row(ids.assets.renditionSource, ids.sessions.renditionSource, "READY"),
  ];
}

function renditionRows() {
  const ids = storageMediaGate6bFixtureIds;
  const assets = new Map(assetRows().map((asset) => [asset.id, asset]));
  const output = (
    renditionId: string,
    sourceAssetId: string,
    sourceAssetVersion: number,
    profile: MediaRenditionProfile,
    state: "READY" | "SUPERSEDED" | "DELETE_PENDING",
  ) => {
    const sourceProviderObjectVersion = assets.get(sourceAssetId)!.providerObjectVersion;
    const sourceFingerprint = mediaRenditionSourceFingerprint({
      profile,
      sourceAssetId,
      sourceAssetVersion,
      sourceChecksumSha256: sourceChecksum,
      sourceProviderObjectVersion,
    });
    return {
      checksumSha256: outputChecksum,
      createdAt: baseTime,
      deleteRequestedAt: state === "DELETE_PENDING" ? baseTime : null,
      height: 8,
      id: renditionId,
      mimeType: "image/webp",
      objectKey: generateMediaRenditionObjectKey(sourceAssetId, sourceFingerprint),
      profile,
      provider: "DETERMINISTIC_TEST" as const,
      providerObjectVersion: outputObjectVersion,
      readyAt: baseTime,
      sizeBytes: BigInt(64),
      sourceAssetId,
      sourceAssetVersion,
      sourceChecksumSha256: sourceChecksum,
      sourceFingerprint,
      sourceProviderObjectVersion,
      state,
      updatedAt: baseTime,
      version: 1,
      width: 16,
    };
  };
  const failedProfile: MediaRenditionProfile = "AVATAR_256_WEBP";
  const failedSourceProviderObjectVersion = assets.get(ids.assets.explicitReady)!.providerObjectVersion;
  const failedFingerprint = mediaRenditionSourceFingerprint({
    profile: failedProfile,
    sourceAssetId: ids.assets.explicitReady,
    sourceAssetVersion: 1,
    sourceChecksumSha256: sourceChecksum,
    sourceProviderObjectVersion: failedSourceProviderObjectVersion,
  });
  return [
    output(ids.renditions.ready, ids.assets.renditionSource, 1, "AVATAR_256_WEBP", "READY"),
    output(ids.renditions.stale, ids.assets.renditionSource, 1, "CARD_640_WEBP", "SUPERSEDED"),
    {
      createdAt: baseTime,
      failureCode: "OUTPUT_VERIFICATION_MISMATCH",
      id: ids.renditions.failed,
      objectKey: generateMediaRenditionObjectKey(ids.assets.explicitReady, failedFingerprint),
      profile: failedProfile,
      provider: "DETERMINISTIC_TEST" as const,
      sourceAssetId: ids.assets.explicitReady,
      sourceAssetVersion: 1,
      sourceChecksumSha256: sourceChecksum,
      sourceFingerprint: failedFingerprint,
      sourceProviderObjectVersion: failedSourceProviderObjectVersion,
      state: "FAILED" as const,
      updatedAt: baseTime,
      version: 1,
    },
    output(ids.renditions.deletePending, ids.assets.renditionSource, 1, "HERO_1600_WEBP", "DELETE_PENDING"),
  ];
}

function scheduleRows() {
  const ids = storageMediaGate6bFixtureIds;
  const rows: Array<[string, PlatformJobScheduleKey, PlatformJobType]> = [
    [ids.schedules.maintenance, "STORAGE_MAINTENANCE_DISCOVERY", "STORAGE_MAINTENANCE_DISCOVERY"],
    [ids.schedules.rescan, "STORAGE_RESCAN_DISCOVERY", "STORAGE_RESCAN_DISCOVERY"],
    [ids.schedules.rendition, "MEDIA_RENDITION_DISCOVERY", "MEDIA_RENDITION_DISCOVERY"],
    [ids.schedules.renditionCleanup, "MEDIA_RENDITION_CLEANUP_DISCOVERY", "MEDIA_RENDITION_CLEANUP_DISCOVERY"],
  ];
  return rows.map(([scheduleId, scheduleKey, jobType], index) => {
    const payload = { batchSize: 10 };
    return {
      cadenceSeconds: 300,
      catchupLimit: 1,
      createdAt: baseTime,
      createdByAdminUserId: ids.adminUserId,
      createdByPersonId: ids.adminPersonId,
      enabled: false,
      id: scheduleId,
      jobType,
      nextRunAt: new Date(baseTime.getTime() + index * 1_000),
      payload,
      payloadHash: platformJobHash(payload),
      payloadVersion: 1,
      scheduleKey,
      scopeKey: "platform",
      updatedAt: baseTime,
      version: 1,
    };
  });
}

function jobRows() {
  const ids = storageMediaGate6bFixtureIds;
  const definitions: Array<[string, PlatformJobType, object]> = [
    [ids.jobs.maintenance, "STORAGE_MAINTENANCE_DISCOVERY", { batchSize: 10 }],
    [ids.jobs.orphan, "STORAGE_ORPHAN_CLEANUP", { expectedVersion: 1, uploadSessionId: ids.sessions.dueOrphan }],
    [ids.jobs.assetDelete, "STORAGE_ASSET_DELETE_RETRY", { assetId: ids.assets.deletePending, expectedVersion: 1 }],
    [ids.jobs.rescanDiscovery, "STORAGE_RESCAN_DISCOVERY", { batchSize: 10 }],
    [ids.jobs.rescan, "STORAGE_ASSET_RESCAN", { assetId: ids.assets.quarantined, expectedVersion: 1 }],
    [ids.jobs.renditionDiscovery, "MEDIA_RENDITION_DISCOVERY", { batchSize: 10 }],
    [ids.jobs.renditionGenerate, "MEDIA_RENDITION_GENERATE", { assetId: ids.assets.renditionSource, expectedVersion: 1, profile: "AVATAR_256_WEBP" }],
    [ids.jobs.renditionCleanupDiscovery, "MEDIA_RENDITION_CLEANUP_DISCOVERY", { batchSize: 10 }],
    [ids.jobs.renditionDelete, "MEDIA_RENDITION_DELETE", { expectedVersion: 1, renditionId: ids.renditions.deletePending }],
  ];
  return definitions.map(([jobId, jobType, payload], index) => {
    const completed = jobId === ids.jobs.maintenance;
    const result = { kind: "STORAGE_MAINTENANCE_DISCOVERED", queued: 0, scanned: 0 };
    return {
      attemptCount: completed ? 1 : 0,
      availableAt: new Date(baseTime.getTime() + index * 1_000),
      completedAt: completed ? new Date(baseTime.getTime() + 2_000) : null,
      createdAt: baseTime,
      createdByAdminUserId: ids.adminUserId,
      createdByPersonId: ids.adminPersonId,
      deduplicationKey: `staging:${STORAGE_MEDIA_GATE6B_MARKER}:${jobType.toLowerCase()}`,
      fencingToken: completed ? BigInt(1) : BigInt(0),
      id: jobId,
      jobType,
      maxAttempts: 3,
      payload,
      payloadHash: platformJobHash(payload),
      payloadVersion: 1,
      priority: 5,
      resultHash: completed ? platformJobHash(result) : null,
      resultMetadata: completed ? result : Prisma.DbNull,
      scopeKey: "platform",
      source: "ADMIN_MANUAL" as const,
      startedAt: completed ? new Date(baseTime.getTime() + 1_000) : null,
      status: completed ? "SUCCEEDED" as const : "AVAILABLE" as const,
      updatedAt: completed ? new Date(baseTime.getTime() + 2_000) : baseTime,
      version: completed ? 2 : 1,
    };
  });
}

function user(userId: string, label: string) {
  return {
    createdAt: baseTime,
    email: `${STORAGE_MEDIA_GATE6B_MARKER}-${label}@rezno.invalid`,
    emailVerified: true,
    id: userId,
    name: `${STORAGE_MEDIA_GATE6B_MARKER}-${label}`,
    updatedAt: baseTime,
  };
}

function person(personId: string, authUserId: string, firstName: string) {
  return {
    authUserId,
    createdAt: baseTime,
    firstName,
    id: personId,
    isOnboarded: true,
    status: "ACTIVE" as const,
    updatedAt: baseTime,
  };
}

function nonFixtureWhere(table: string, ids: typeof storageMediaGate6bFixtureIds) {
  const text = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const uuidList = (values: readonly string[]) => values.map((value) => `${text(value)}::uuid`).join(", ");
  const textList = (values: readonly string[]) => values.map(text).join(", ");
  if (table === "user") return `WHERE row_value."id" NOT IN (${textList(fixtureUsers)})`;
  if (table === "Person") return `WHERE row_value."id" NOT IN (${uuidList(fixturePeople)})`;
  if (table === "AdminAccess") return `WHERE row_value."id" <> ${text(ids.adminAccessId)}::uuid`;
  if (table === "Organization") return `WHERE row_value."id" <> ${text(ids.organizationId)}::uuid`;
  if (table === "Role") return `WHERE row_value."id" <> ${text(ids.roleId)}::uuid`;
  if (table === "OrganizationMember") return `WHERE row_value."id" <> ${text(ids.membershipId)}::uuid`;
  if (table === "UploadSession") return `WHERE row_value."id" NOT IN (${uuidList(fixtureSessions)})`;
  if (table === "StoredAsset") return `WHERE row_value."id" NOT IN (${uuidList(fixtureAssets)})`;
  if (table === "MediaContainer") return `WHERE row_value."id" NOT IN (${uuidList(Object.values(ids.containers))})`;
  if (table === "MediaBinding") return `WHERE row_value."id" NOT IN (${uuidList(Object.values(ids.bindings))})`;
  if (table === "MediaRendition") return `WHERE row_value."sourceAssetId" NOT IN (${uuidList(fixtureAssets)})`;
  if (table === "StorageMutation" || table === "MediaMutation") {
    return `WHERE row_value."actorPersonId" NOT IN (${uuidList(fixturePeople)})`;
  }
  if (table === "AdminAuditLog") return `WHERE row_value."adminUserId" <> ${text(ids.adminUserId)}`;
  if (table === "PlatformJob") return `WHERE row_value."createdByAdminUserId" IS DISTINCT FROM ${text(ids.adminUserId)}`;
  if (table === "PlatformJobSchedule") return `WHERE row_value."createdByAdminUserId" <> ${text(ids.adminUserId)}`;
  if (table === "PlatformJobMutation") return `WHERE row_value."actorAdminUserId" <> ${text(ids.adminUserId)}`;
  if (table === "PlatformJobAttempt") {
    return `WHERE NOT EXISTS (SELECT 1 FROM "PlatformJob" fixture_job WHERE fixture_job."id" = row_value."jobId" AND fixture_job."createdByAdminUserId" = ${text(ids.adminUserId)})`;
  }
  return "";
}

function sentinelHash(value: object) {
  return createHash("sha256").update(JSON.stringify(jsonSafe(value))).digest("hex");
}

function normalizedRowValue(table: string) {
  if (table === "StoredAsset") {
    return `to_jsonb(row_value) - ARRAY['inspectionPolicyVersion', 'lastRescannedAt', 'rescanClaimJobId', 'rescanClaimLeaseToken', 'rescanClaimFencingToken', 'rescanClaimExpiresAt']`;
  }
  if (table === "PlatformJob") return `to_jsonb(row_value) - 'parentJobId'`;
  return "to_jsonb(row_value)";
}

function deterministicObjectVersion(objectKey: string, checksumSha256: string) {
  return createHash("sha256").update(`${objectKey}:${checksumSha256}`).digest("hex").slice(0, 32);
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  }
  return value;
}
