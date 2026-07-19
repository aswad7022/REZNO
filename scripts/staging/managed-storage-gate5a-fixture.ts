import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export const MANAGED_STORAGE_GATE5A_MARKER = "rezno-qa-managed-storage-gate5a";
const baseTime = new Date("2026-07-19T12:00:00.123456Z");

const id = (value: number) => `50000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const personIds = Array.from({ length: 12 }, (_, index) => id(index + 1));
const organizationIds = [id(101), id(102)];
const roleIds = Array.from({ length: 6 }, (_, index) => id(201 + index));
const memberIds = Array.from({ length: 6 }, (_, index) => id(301 + index));
const sessionIds = Array.from({ length: 30 }, (_, index) => id(1001 + index));
const finalizedSessionIndexes = [4, 5, 6, 7, 8, 9, ...Array.from({ length: 16 }, (_, index) => 14 + index)];
const assetIds = Array.from({ length: finalizedSessionIndexes.length }, (_, index) => id(2001 + index));
const users = personIds.map((_, index) => `${MANAGED_STORAGE_GATE5A_MARKER}-user-${index + 1}`);

export const managedStorageFixtureIds = {
  assetIds,
  memberIds,
  organizationIds,
  personIds,
  roleIds,
  sessionIds,
  users,
};

export async function cleanupManagedStorageFixture(prisma: PrismaClient) {
  const counts = {
    adminAuditLogs: (await prisma.adminAuditLog.deleteMany({ where: { adminUserId: { in: users } } })).count,
    assets: (await prisma.storedAsset.deleteMany({ where: { id: { in: assetIds } } })).count,
    mutations: (await prisma.storageMutation.deleteMany({ where: { actorPersonId: { in: personIds } } })).count,
    sessions: (await prisma.uploadSession.deleteMany({ where: { id: { in: sessionIds } } })).count,
    adminAccess: (await prisma.adminAccess.deleteMany({ where: { userId: { in: users } } })).count,
    members: (await prisma.organizationMember.deleteMany({ where: { id: { in: memberIds } } })).count,
    roles: (await prisma.role.deleteMany({ where: { id: { in: roleIds } } })).count,
    organizations: (await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } })).count,
    people: (await prisma.person.deleteMany({ where: { id: { in: personIds } } })).count,
    users: (await prisma.user.deleteMany({ where: { id: { in: users } } })).count,
  };
  return counts;
}

export async function seedManagedStorageFixture(prisma: PrismaClient) {
  await cleanupManagedStorageFixture(prisma);
  await prisma.user.createMany({
    data: users.map((userId, index) => ({
      createdAt: baseTime,
      email: `${MANAGED_STORAGE_GATE5A_MARKER}-${index + 1}@rezno.invalid`,
      emailVerified: true,
      id: userId,
      name: `Gate 5A actor ${index + 1}`,
      updatedAt: baseTime,
    })),
  });
  await prisma.person.createMany({
    data: personIds.map((personId, index) => ({
      authUserId: users[index]!,
      createdAt: baseTime,
      firstName: `Gate5A-${index + 1}`,
      id: personId,
      isOnboarded: true,
      status: "ACTIVE",
      updatedAt: baseTime,
    })),
  });
  await prisma.organization.createMany({ data: [
    { createdAt: baseTime, id: organizationIds[0]!, name: "Gate 5A storage organization", slug: MANAGED_STORAGE_GATE5A_MARKER, updatedAt: baseTime },
    { createdAt: baseTime, id: organizationIds[1]!, name: "Gate 5A foreign organization", slug: `${MANAGED_STORAGE_GATE5A_MARKER}-foreign`, updatedAt: baseTime },
  ] });
  const roleKinds = ["OWNER", "MANAGER", "RECEPTIONIST", "STAFF", "MANAGER", "OWNER"] as const;
  await prisma.role.createMany({
    data: roleIds.map((roleId, index) => ({
      createdAt: baseTime,
      id: roleId,
      isSystem: true,
      name: `${MANAGED_STORAGE_GATE5A_MARKER}-${roleKinds[index]}-${index}`,
      organizationId: index === 5 ? organizationIds[1]! : organizationIds[0]!,
      systemRole: roleKinds[index]!,
      updatedAt: baseTime,
    })),
  });
  await prisma.organizationMember.createMany({
    data: memberIds.map((memberId, index) => ({
      createdAt: baseTime,
      id: memberId,
      organizationId: index === 5 ? organizationIds[1]! : organizationIds[0]!,
      personId: personIds[index + 2]!,
      roleId: roleIds[index]!,
      status: index === 4 ? "INACTIVE" : "ACTIVE",
      updatedAt: baseTime,
    })),
  });
  await prisma.adminAccess.createMany({ data: [
    { createdAt: baseTime, id: id(401), permissions: ["STORAGE_RECORDS_VIEW", "STORAGE_RECORDS_MANAGE"], status: "ACTIVE", updatedAt: baseTime, userId: users[8]! },
    { createdAt: baseTime, id: id(402), permissions: ["STORAGE_RECORDS_VIEW"], status: "ACTIVE", updatedAt: baseTime, userId: users[9]! },
    { createdAt: baseTime, id: id(403), permissions: ["STORAGE_RECORDS_VIEW", "STORAGE_RECORDS_MANAGE"], status: "REVOKED", updatedAt: baseTime, userId: users[10]! },
  ] });

  const sessions = sessionIds.map((sessionId, index) => {
    const customer = index === 0 || index === 4;
    const business = index >= 1 && index <= 9 && !customer;
    const purpose = customer
      ? "CUSTOMER_AVATAR" as const
      : business ? "BUSINESS_LOGO" as const : "INTERNAL_STORAGE_TEST" as const;
    const state = index === 0 ? "CREATED" as const
      : index === 1 || index === 10 || index === 11 || index === 12 || index === 13 ? "TARGET_ISSUED" as const
        : index === 2 ? "EXPIRED" as const
          : index === 3 ? "ABORTED" as const : "FINALIZED" as const;
    const actorPersonId = customer ? personIds[0]! : business ? personIds[2]! : personIds[8]!;
    const timestamp = new Date(baseTime.getTime() + index * 1_000);
    return {
      abortedAt: state === "ABORTED" ? timestamp : null,
      actorMembershipId: business ? memberIds[0]! : null,
      actorPersonId,
      actorRoleId: business ? roleIds[0]! : null,
      createdAt: timestamp,
      displayName: `${MANAGED_STORAGE_GATE5A_MARKER}-${index + 1}.png`,
      expectedChecksumSha256: "a".repeat(64),
      expectedMimeType: "image/png",
      expectedSizeBytes: 68,
      expiresAt: state === "EXPIRED" ? new Date("2026-07-17T12:00:00.123456Z") : new Date("2027-07-19T12:00:00.123456Z"),
      failureCode: index === 10 ? "WRONG_SIZE" : index === 11 ? "WRONG_MIME" : index === 12 ? "MISSING_OBJECT" : index === 13 ? "TRANSIENT_PROVIDER" : null,
      finalizedAt: state === "FINALIZED" ? timestamp : null,
      id: sessionId,
      objectKey: objectKey(purpose, index + 1),
      organizationId: business ? organizationIds[0]! : null,
      ownerPersonId: customer ? personIds[0]! : null,
      provider: "DETERMINISTIC_TEST" as const,
      purpose,
      state,
      targetIssuedAt: state === "TARGET_ISSUED" || state === "FINALIZED" ? timestamp : null,
      updatedAt: timestamp,
      uploadedAt: state === "FINALIZED" ? timestamp : null,
      version: state === "CREATED" ? 1 : 2,
      visibility: customer ? "PRIVATE" as const : business ? "PUBLIC" as const : "INTERNAL" as const,
    };
  });
  await prisma.uploadSession.createMany({ data: sessions });

  const states = ["READY", "READY", "QUARANTINED", "REJECTED", "DELETE_PENDING", "DELETED"] as const;
  await prisma.storedAsset.createMany({
    data: assetIds.map((assetId, index) => {
      const sessionIndex = finalizedSessionIndexes[index]!;
      const session = sessions[sessionIndex]!;
      const state = index < states.length ? states[index]! : "READY" as const;
      const timestamp = new Date(baseTime.getTime() + (index + 100) * 1_000);
      return {
        checksumSha256: "a".repeat(64),
        createdAt: timestamp,
        createdByPersonId: session.actorPersonId,
        deleteRequestedAt: state === "DELETE_PENDING" || state === "DELETED" ? timestamp : null,
        deletedAt: state === "DELETED" ? timestamp : null,
        displayName: session.displayName,
        failureCode: state === "QUARANTINED" ? "INSPECTION_FAILED" : state === "REJECTED" ? "INVALID_TYPE" : null,
        id: assetId,
        inspectionMetadata: { format: "png", height: 1, pages: 1, width: 1 },
        inspectionOutcome: state === "REJECTED" ? "INVALID_TYPE" as const : state === "QUARANTINED" ? "INSPECTION_FAILED" as const : "VALID" as const,
        mimeType: "image/png",
        objectKey: session.objectKey,
        organizationId: session.organizationId,
        ownerPersonId: session.ownerPersonId,
        provider: "DETERMINISTIC_TEST" as const,
        purpose: session.purpose,
        quarantinedAt: state === "QUARANTINED" ? timestamp : null,
        readyAt: state === "READY" ? timestamp : null,
        rejectedAt: state === "REJECTED" ? timestamp : null,
        scannerOutcome: "SCANNER_NOT_CONFIGURED" as const,
        sizeBytes: 68,
        state,
        updatedAt: timestamp,
        uploadSessionId: session.id,
        visibility: session.visibility,
      };
    }),
  });
  return fixtureFingerprint(prisma);
}

export async function fixtureFingerprint(prisma: PrismaClient) {
  const [sessions, assets, members, admins] = await Promise.all([
    prisma.uploadSession.findMany({ where: { id: { in: sessionIds } }, orderBy: { id: "asc" }, select: { id: true, purpose: true, state: true, version: true, visibility: true } }),
    prisma.storedAsset.findMany({ where: { id: { in: assetIds } }, orderBy: { id: "asc" }, select: { id: true, purpose: true, state: true, version: true, visibility: true } }),
    prisma.organizationMember.findMany({ where: { id: { in: memberIds } }, orderBy: { id: "asc" }, select: { id: true, roleId: true, status: true } }),
    prisma.adminAccess.findMany({ where: { userId: { in: users } }, orderBy: { id: "asc" }, select: { id: true, permissions: true, status: true } }),
  ]);
  return createHash("sha256").update(JSON.stringify({ admins, assets, members, sessions })).digest("hex");
}

function objectKey(purpose: string, index: number) {
  const segment = purpose.toLowerCase().replaceAll("_", "-");
  return `staging/${segment}/${id(5000 + index)}/${id(6000 + index)}`;
}
