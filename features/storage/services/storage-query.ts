import "server-only";

import {
  Prisma,
  type StoredAssetState,
  type StoragePurpose,
  type UploadSessionState,
} from "@prisma/client";

import { storedAssetSummaryDto, uploadSessionDto } from "@/features/storage/domain/contracts";
import {
  decodeStorageCursor,
  encodeStorageCursor,
  storageCursorFilter,
  storageCursorScope,
} from "@/features/storage/domain/cursor";
import { storageError } from "@/features/storage/domain/errors";
import { STORAGE_QUOTA_LIMITS } from "@/features/storage/domain/policy";
import { STORAGE_PURPOSE_REGISTRY } from "@/features/storage/domain/purpose-registry";
import {
  ACTIVE_SESSION_RESERVATION_STATES,
  PROVIDER_RESIDENT_ASSET_STATES,
  purposeQuotaUsage,
} from "@/features/storage/domain/quota";
import { assertStorageActorCurrent, assertStorageAdminCurrent, type StorageActor, type StorageAdminActor } from "@/features/storage/services/actor";
import { storageQuotaOwnerFilter } from "@/features/storage/services/storage-quota";
import { storageSerializable } from "@/features/storage/services/transaction";
import { getExactPostgresTime } from "@/lib/db/postgres-timestamp";

type QueryActor = StorageActor | StorageAdminActor;
type PageInput = {
  cursor?: string | null;
  limit?: number;
};

export async function getStorageQuotaStatus(actor: QueryActor) {
  return storageSerializable(async (transaction) => {
    await assertActor(transaction, actor);
    const now = await databaseNow(transaction);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const scope = storageQuotaOwnerFilter(actor);
    const purposes = legalPurposes(actor);
    const [activeSessions, pending, dailySessions, finalized, groupedAssets, groupedReservations] = await Promise.all([
      transaction.uploadSession.count({
        where: { ...scope.session, expiresAt: { gt: now }, state: { in: [...ACTIVE_SESSION_RESERVATION_STATES] } },
      }),
      transaction.uploadSession.aggregate({
        where: { ...scope.session, expiresAt: { gt: now }, state: { in: [...ACTIVE_SESSION_RESERVATION_STATES] } },
        _sum: { expectedSizeBytes: true },
      }),
      transaction.uploadSession.count({ where: { ...scope.session, createdAt: { gte: dayAgo } } }),
      transaction.storedAsset.aggregate({
        where: { ...scope.asset, createdAt: { gte: dayAgo } },
        _sum: { sizeBytes: true },
      }),
      transaction.storedAsset.groupBy({
        by: ["purpose"],
        where: { ...scope.asset, purpose: { in: purposes }, state: { in: [...PROVIDER_RESIDENT_ASSET_STATES] } },
        _count: { _all: true },
      }),
      transaction.uploadSession.groupBy({
        by: ["purpose"],
        where: {
          ...scope.session,
          expiresAt: { gt: now },
          purpose: { in: purposes },
          state: { in: [...ACTIVE_SESSION_RESERVATION_STATES] },
        },
        _count: { _all: true },
      }),
    ]);
    const limits = quotaLimits(actor);
    const storedCounts = new Map(groupedAssets.map((row) => [row.purpose, row._count._all]));
    const reservedCounts = new Map(groupedReservations.map((row) => [row.purpose, row._count._all]));
    return {
      type: "STORAGE_QUOTA_STATUS" as const,
      activeSessions: { limit: limits.activeSessions, used: activeSessions },
      dailyFinalizedBytes: { limit: limits.dailyFinalizedBytes, used: Number(finalized._sum.sizeBytes ?? BigInt(0)) },
      dailySessions: { limit: limits.dailySessions, used: dailySessions },
      pendingBytes: { limit: limits.pendingBytes, used: Number(pending._sum.expectedSizeBytes ?? BigInt(0)) },
      purposeAssets: purposes.map((purpose) => {
        const stored = storedCounts.get(purpose) ?? 0;
        const reserved = reservedCounts.get(purpose) ?? 0;
        return {
          limit: STORAGE_PURPOSE_REGISTRY[purpose].maxActiveAssets,
          purpose,
          reserved,
          stored,
          used: purposeQuotaUsage(stored, reserved),
        };
      }),
    };
  });
}

export async function listStoredAssets(
  actor: QueryActor,
  input: PageInput & { purpose?: StoragePurpose | null; state?: StoredAssetState | null } = {},
) {
  const pageSize = pageSizeValue(input.limit);
  return storageSerializable(async (transaction) => {
    await assertActor(transaction, actor);
    const authoritativeNow = await getExactPostgresTime(transaction);
    const filter = storageCursorFilter({ purpose: input.purpose ?? null, state: input.state ?? null });
    const scope = storageCursorScope(scopeValue(actor));
    const decoded = input.cursor
      ? decodeStorageCursor("ASSET", input.cursor, { filter, pageSize, scope }, authoritativeNow)
      : null;
    const snapshot = decoded?.snapshot ?? authoritativeNow;
    const boundary = decoded
      ? Prisma.sql`AND (
          asset."createdAt" < ${decoded.sortValue}::timestamptz
          OR (asset."createdAt" = ${decoded.sortValue}::timestamptz AND asset."id" < ${decoded.id}::uuid)
        )`
      : Prisma.empty;
    const purpose = input.purpose
      ? Prisma.sql`AND asset."purpose"::text = ${input.purpose}`
      : Prisma.empty;
    const state = input.state
      ? Prisma.sql`AND asset."state"::text = ${input.state}`
      : Prisma.empty;
    const rows = await transaction.$queryRaw<Array<{ id: string; sortValue: string }>>(Prisma.sql`
      SELECT asset."id", to_char(
        asset."createdAt" AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS "sortValue"
      FROM "StoredAsset" AS asset
      WHERE ${assetScope(actor)}
        AND asset."createdAt" <= ${snapshot}::timestamptz
        ${purpose}
        ${state}
        ${boundary}
      ORDER BY asset."createdAt" DESC, asset."id" DESC
      LIMIT ${pageSize + 1}
    `);
    const hasMore = rows.length > pageSize;
    const pageRows = rows.slice(0, pageSize);
    const records = pageRows.length
      ? await transaction.storedAsset.findMany({ where: { id: { in: pageRows.map((row) => row.id) } } })
      : [];
    const byId = new Map(records.map((record) => [record.id, record]));
    const items = pageRows.map((row) => byId.get(row.id)).filter((item) => Boolean(item)).map((item) => storedAssetSummaryDto(item!));
    const last = hasMore ? pageRows.at(-1) : null;
    return {
      type: "STORED_ASSET_PAGE" as const,
      items,
      nextCursor: last
        ? encodeStorageCursor("ASSET", {
            filter,
            id: last.id,
            pageSize,
            scope,
            snapshot,
            sortValue: last.sortValue,
          })
        : null,
      pageSize,
    };
  });
}

export async function listUploadSessions(
  actor: QueryActor,
  input: PageInput & { state?: UploadSessionState | null } = {},
) {
  const pageSize = pageSizeValue(input.limit);
  return storageSerializable(async (transaction) => {
    await assertActor(transaction, actor);
    const authoritativeNow = await getExactPostgresTime(transaction);
    const filter = storageCursorFilter({ state: input.state ?? null });
    const scope = storageCursorScope(scopeValue(actor));
    const decoded = input.cursor
      ? decodeStorageCursor("SESSION", input.cursor, { filter, pageSize, scope }, authoritativeNow)
      : null;
    const snapshot = decoded?.snapshot ?? authoritativeNow;
    const boundary = decoded
      ? Prisma.sql`AND (
          session."createdAt" < ${decoded.sortValue}::timestamptz
          OR (session."createdAt" = ${decoded.sortValue}::timestamptz AND session."id" < ${decoded.id}::uuid)
        )`
      : Prisma.empty;
    const state = input.state
      ? Prisma.sql`AND session."state"::text = ${input.state}`
      : Prisma.empty;
    const rows = await transaction.$queryRaw<Array<{ id: string; sortValue: string }>>(Prisma.sql`
      SELECT session."id", to_char(
        session."createdAt" AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS "sortValue"
      FROM "UploadSession" AS session
      WHERE ${sessionScope(actor)}
        AND session."createdAt" <= ${snapshot}::timestamptz
        ${state}
        ${boundary}
      ORDER BY session."createdAt" DESC, session."id" DESC
      LIMIT ${pageSize + 1}
    `);
    const hasMore = rows.length > pageSize;
    const pageRows = rows.slice(0, pageSize);
    const records = pageRows.length
      ? await transaction.uploadSession.findMany({ where: { id: { in: pageRows.map((row) => row.id) } } })
      : [];
    const byId = new Map(records.map((record) => [record.id, record]));
    const items = pageRows.map((row) => byId.get(row.id)).filter((item) => Boolean(item)).map((item) => uploadSessionDto(item!));
    const last = hasMore ? pageRows.at(-1) : null;
    return {
      items,
      nextCursor: last
        ? encodeStorageCursor("SESSION", {
            filter,
            id: last.id,
            pageSize,
            scope,
            snapshot,
            sortValue: last.sortValue,
          })
        : null,
      pageSize,
      type: "UPLOAD_SESSION_PAGE" as const,
    };
  });
}

function assetScope(actor: QueryActor) {
  if (actor.kind === "customer") return Prisma.sql`asset."ownerPersonId" = ${actor.personId}::uuid AND asset."organizationId" IS NULL`;
  if (actor.kind === "business") return Prisma.sql`asset."organizationId" = ${actor.organizationId}::uuid`;
  return Prisma.sql`TRUE`;
}

function sessionScope(actor: QueryActor) {
  if (actor.kind === "customer") return Prisma.sql`session."actorPersonId" = ${actor.personId}::uuid AND session."ownerPersonId" = ${actor.personId}::uuid AND session."organizationId" IS NULL`;
  if (actor.kind === "business") return Prisma.sql`
    session."actorPersonId" = ${actor.personId}::uuid
    AND session."organizationId" = ${actor.organizationId}::uuid
    AND session."actorMembershipId" = ${actor.membershipId}::uuid
    AND session."actorRoleId" = ${actor.roleId}::uuid
  `;
  return Prisma.sql`session."purpose" = 'INTERNAL_STORAGE_TEST' AND session."actorPersonId" = ${actor.personId}::uuid`;
}

async function assertActor(transaction: Prisma.TransactionClient, actor: QueryActor) {
  return actor.kind === "admin"
    ? assertStorageAdminCurrent(transaction, actor, "STORAGE_RECORDS_VIEW")
    : assertStorageActorCurrent(transaction, actor);
}

function scopeValue(actor: QueryActor) {
  return actor.kind === "business"
    ? { kind: actor.kind, membershipId: actor.membershipId, organizationId: actor.organizationId, personId: actor.personId, roleId: actor.roleId }
    : actor.kind === "admin"
      ? { adminAccessId: actor.adminAccessId, kind: actor.kind, personId: actor.personId, source: actor.source, userId: actor.userId }
      : { kind: actor.kind, personId: actor.personId };
}

function pageSizeValue(value: number | undefined) {
  const result = value ?? 20;
  if (!Number.isInteger(result) || result < 1 || result > 50) {
    storageError("VALIDATION_ERROR", "limit must be an integer between 1 and 50.");
  }
  return result;
}

function legalPurposes(actor: QueryActor) {
  const family = actor.kind === "customer" ? "PERSON" : actor.kind === "business" ? "ORGANIZATION" : "PLATFORM_INTERNAL";
  return (Object.entries(STORAGE_PURPOSE_REGISTRY) as Array<[StoragePurpose, (typeof STORAGE_PURPOSE_REGISTRY)[StoragePurpose]]>)
    .filter(([, policy]) => policy.ownerFamily === family)
    .map(([purpose]) => purpose);
}

function quotaLimits(actor: QueryActor) {
  return actor.kind === "customer"
    ? STORAGE_QUOTA_LIMITS.person
    : actor.kind === "business" ? STORAGE_QUOTA_LIMITS.organization : STORAGE_QUOTA_LIMITS.internal;
}

async function databaseNow(transaction: Prisma.TransactionClient) {
  const [row] = await transaction.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS "now"`);
  if (!row) throw new Error("Database time is unavailable.");
  return row.now;
}
