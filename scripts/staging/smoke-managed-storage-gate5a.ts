import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

import { setStorageCursorSigningSecretForTests } from "../../features/storage/domain/cursor-signing";
import { StorageDomainError } from "../../features/storage/domain/errors";
import { sha256Hex } from "../../features/storage/domain/policy";
import { DeterministicStorageProvider } from "../../features/storage/providers/deterministic";
import { setStorageProviderForTests } from "../../features/storage/providers/registry";
import type { StorageAdminActor, StorageBusinessActor, StorageCustomerActor } from "../../features/storage/services/actor";
import { createDownloadTarget, deleteStoredAsset } from "../../features/storage/services/storage-assets";
import { createUploadSession, finalizeUpload, issueUploadTarget } from "../../features/storage/services/storage-mutations";
import { listStoredAssets, listUploadSessions } from "../../features/storage/services/storage-query";
import { prisma } from "../../lib/db/prisma";
import { fixtureFingerprint, managedStorageFixtureIds } from "./managed-storage-gate5a-fixture";
import { assertManagedStorageGate5aStaging } from "./managed-storage-gate5a-safety";

const failures = (code: string) => (error: unknown) => error instanceof StorageDomainError && error.code === code;

async function main() {
  await assertManagedStorageGate5aStaging(prisma);
  const provider = new DeterministicStorageProvider();
  setStorageProviderForTests(provider);
  setStorageCursorSigningSecretForTests("gate5a-staging-cursor-secret-with-high-entropy-2026-07-19-!@#");
  const sessionIds: string[] = [];
  const assetIds: string[] = [];
  const mutationKeys: string[] = [];
  const actors = stagingActors();
  const png = await sharp({ create: { background: "green", channels: 3, height: 3, width: 4 } }).png().toBuffer();
  const digest = sha256Hex(png);
  let checks = 0;
  const key = () => {
    const value = randomUUID();
    mutationKeys.push(value);
    return value;
  };
  const trackSession = <T extends { id: string }>(session: T) => {
    sessionIds.push(session.id);
    return session;
  };
  const ready = async (actor: StorageCustomerActor | StorageBusinessActor | StorageAdminActor, purpose: "CUSTOMER_AVATAR" | "BUSINESS_LOGO" | "INTERNAL_STORAGE_TEST") => {
    const created = trackSession(await createUploadSession(actor, {
      expectedChecksumSha256: digest,
      expectedMimeType: "image/png",
      expectedSizeBytes: png.byteLength,
      idempotencyKey: key(),
      purpose,
    }));
    await issueUploadTarget(actor, { expectedVersion: created.version, idempotencyKey: key(), sessionId: created.id });
    const row = await prisma.uploadSession.findUniqueOrThrow({ where: { id: created.id } });
    provider.putObject({ bytes: png, contentType: "image/png", objectKey: row.objectKey });
    const finalizeKey = key();
    const finalized = await finalizeUpload(actor, { expectedVersion: row.version, idempotencyKey: finalizeKey, sessionId: row.id });
    assert.deepEqual(
      await finalizeUpload(actor, { expectedVersion: row.version, idempotencyKey: finalizeKey, sessionId: row.id }),
      finalized,
    );
    assetIds.push(finalized.asset.id);
    assert.equal(finalized.asset.state, "READY");
    checks += 2;
    return finalized.asset;
  };

  try {
    const replayKey = key();
    const replayInput = {
      expectedMimeType: "image/png",
      expectedSizeBytes: png.byteLength,
      idempotencyKey: replayKey,
      purpose: "CUSTOMER_AVATAR" as const,
    };
    const replaySession = trackSession(await createUploadSession(actors.customerB, replayInput));
    assert.deepEqual(await createUploadSession(actors.customerB, replayInput), replaySession);
    await assert.rejects(createUploadSession(actors.customerB, { ...replayInput, expectedSizeBytes: png.byteLength + 1 }), failures("IDEMPOTENCY_CONFLICT"));
    checks += 2;

    const privateAsset = await ready(actors.customerB, "CUSTOMER_AVATAR");
    const publicAsset = await ready(actors.owner, "BUSINESS_LOGO");
    await ready(actors.manager, "BUSINESS_LOGO");
    for (const actor of [actors.receptionist, actors.staff, actors.revoked]) {
      await assert.rejects(createUploadSession(actor, {
        expectedMimeType: "image/png",
        expectedSizeBytes: png.byteLength,
        idempotencyKey: key(),
        purpose: "BUSINESS_LOGO",
      }), failures("FORBIDDEN"));
      checks += 1;
    }

    assert.equal((await createDownloadTarget(actors.customerB, privateAsset.id)).assetId, privateAsset.id);
    await assert.rejects(createDownloadTarget(actors.customerA, privateAsset.id), failures("NOT_FOUND"));
    assert.equal((await createDownloadTarget(null, publicAsset.id)).assetId, publicAsset.id);
    await assert.rejects(createDownloadTarget(null, managedStorageFixtureIds.assetIds[2]!), failures("NOT_FOUND"));
    checks += 4;

    for (const scenario of ["missing", "size", "mime", "checksum"] as const) {
      const created = trackSession(await createUploadSession(actors.admin, {
        expectedChecksumSha256: scenario === "checksum" ? "f".repeat(64) : null,
        expectedMimeType: "image/png",
        expectedSizeBytes: png.byteLength,
        idempotencyKey: key(),
        purpose: "INTERNAL_STORAGE_TEST",
      }));
      await issueUploadTarget(actors.admin, { expectedVersion: created.version, idempotencyKey: key(), sessionId: created.id });
      const row = await prisma.uploadSession.findUniqueOrThrow({ where: { id: created.id } });
      if (scenario !== "missing") provider.putObject({
        bytes: scenario === "size" ? Buffer.concat([png, Buffer.from([0])]) : png,
        contentType: scenario === "mime" ? "image/jpeg" : "image/png",
        objectKey: row.objectKey,
      });
      await assert.rejects(finalizeUpload(actors.admin, { expectedVersion: row.version, idempotencyKey: key(), sessionId: row.id }), failures("UPLOAD_OBJECT_MISMATCH"));
      checks += 1;
    }

    const frames = Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]);
    const animated = await sharp(frames, { raw: { channels: 4, height: 2, pageHeight: 1, width: 1 } })
      .webp({ delay: [100, 100], loop: 0 }).toBuffer();
    const animatedSession = trackSession(await createUploadSession(actors.manager, {
      expectedMimeType: "image/webp",
      expectedSizeBytes: animated.byteLength,
      idempotencyKey: key(),
      purpose: "PRODUCT_IMAGE",
    }));
    await issueUploadTarget(actors.manager, {
      expectedVersion: animatedSession.version,
      idempotencyKey: key(),
      sessionId: animatedSession.id,
    });
    const animatedRow = await prisma.uploadSession.findUniqueOrThrow({ where: { id: animatedSession.id } });
    provider.putObject({ bytes: animated, contentType: "image/webp", objectKey: animatedRow.objectKey });
    const animatedResult = await finalizeUpload(actors.manager, {
      expectedVersion: animatedRow.version,
      idempotencyKey: key(),
      sessionId: animatedRow.id,
    });
    assetIds.push(animatedResult.asset.id);
    assert.equal(animatedResult.asset.state, "REJECTED");
    assert.equal(animatedResult.asset.inspectionOutcome, "ANIMATED_NOT_ALLOWED");
    checks += 2;

    const expiring = trackSession(await createUploadSession(actors.customerB, {
      expectedMimeType: "image/png",
      expectedSizeBytes: png.byteLength,
      idempotencyKey: key(),
      purpose: "CUSTOMER_AVATAR",
    }));
    await issueUploadTarget(actors.customerB, { expectedVersion: expiring.version, idempotencyKey: key(), sessionId: expiring.id });
    await prisma.uploadSession.update({ where: { id: expiring.id }, data: { expiresAt: new Date("2026-07-18T00:00:00.000Z") } });
    const expiredRow = await prisma.uploadSession.findUniqueOrThrow({ where: { id: expiring.id } });
    await assert.rejects(finalizeUpload(actors.customerB, { expectedVersion: expiredRow.version, idempotencyKey: key(), sessionId: expiredRow.id }), failures("UPLOAD_SESSION_EXPIRED"));
    checks += 1;

    const quotaResults = await Promise.allSettled(Array.from({ length: 5 }, () => createUploadSession(actors.customerB, {
      expectedMimeType: "image/png",
      expectedSizeBytes: png.byteLength,
      idempotencyKey: key(),
      purpose: "CUSTOMER_AVATAR",
    }).then(trackSession)));
    assert.equal(quotaResults.filter((result) => result.status === "fulfilled").length, 4);
    const quotaFailure = quotaResults.find((result) => result.status === "rejected");
    assert.ok(quotaFailure && quotaFailure.status === "rejected" && failures("STORAGE_QUOTA_EXCEEDED")(quotaFailure.reason));
    checks += 2;

    const ownerPage = await listStoredAssets(actors.owner, { limit: 1 });
    assert.ok(ownerPage.nextCursor);
    await assert.rejects(listStoredAssets(actors.foreignOwner, { cursor: ownerPage.nextCursor, limit: 1 }), failures("INVALID_CURSOR"));
    const customerPage = await listUploadSessions(actors.customerA, { limit: 1 });
    assert.ok(customerPage.nextCursor);
    await assert.rejects(listUploadSessions(actors.customerB, { cursor: customerPage.nextCursor, limit: 1 }), failures("INVALID_CURSOR"));
    checks += 4;

    const deleteRow = await prisma.storedAsset.findUniqueOrThrow({ where: { id: privateAsset.id } });
    provider.setDeleteOutcomes(deleteRow.objectKey, ["TRANSIENT_FAILURE", "READY"]);
    const deleteKey = key();
    await assert.rejects(deleteStoredAsset(actors.customerB, { assetId: deleteRow.id, expectedVersion: deleteRow.version, idempotencyKey: deleteKey }), failures("STORAGE_PROVIDER_FAILURE"));
    const deleted = await deleteStoredAsset(actors.customerB, { assetId: deleteRow.id, expectedVersion: deleteRow.version, idempotencyKey: deleteKey });
    assert.equal(deleted.state, "DELETED");
    checks += 2;

    await prisma.adminAccess.update({ where: { id: actors.admin.adminAccessId! }, data: { status: "REVOKED" } });
    await assert.rejects(listStoredAssets(actors.admin), failures("FORBIDDEN"));
    await prisma.adminAccess.update({ where: { id: actors.admin.adminAccessId! }, data: { status: "ACTIVE" } });
    checks += 1;

    const audits = await prisma.adminAuditLog.findMany({ where: { adminUserId: actors.admin.userId, idempotencyKey: { in: mutationKeys } } });
    assert.doesNotMatch(JSON.stringify(audits), /objectKey|checksum|signature|token|deterministic-storage/i);
    checks += 1;
    const fingerprint = await fixtureFingerprint(prisma);
    console.log(JSON.stringify({ checks, fingerprint, fixture: "rezno-qa-managed-storage-gate5a", status: "passed" }));
  } finally {
    await prisma.adminAuditLog.deleteMany({ where: { adminUserId: actors.admin.userId, idempotencyKey: { in: mutationKeys } } });
    await prisma.storedAsset.deleteMany({ where: { id: { in: assetIds } } });
    await prisma.storageMutation.deleteMany({ where: { idempotencyKey: { in: mutationKeys } } });
    await prisma.uploadSession.deleteMany({ where: { id: { in: sessionIds } } });
    setStorageProviderForTests(undefined);
    setStorageCursorSigningSecretForTests(undefined);
    await prisma.$disconnect();
  }
}

function stagingActors() {
  const ids = managedStorageFixtureIds;
  const customer = (index: number): StorageCustomerActor => ({
    kind: "customer",
    personId: ids.personIds[index]!,
    userId: ids.users[index]!,
  });
  const business = (personIndex: number, memberIndex: number, role: StorageBusinessActor["systemRole"]): StorageBusinessActor => ({
    kind: "business",
    membershipId: ids.memberIds[memberIndex]!,
    organizationId: memberIndex === 5 ? ids.organizationIds[1]! : ids.organizationIds[0]!,
    personId: ids.personIds[personIndex]!,
    roleId: ids.roleIds[memberIndex]!,
    systemRole: role,
    userId: ids.users[personIndex]!,
  });
  return {
    admin: { adminAccessId: "50000000-0000-4000-8000-000000000401", kind: "admin", personId: ids.personIds[8]!, source: "database", userId: ids.users[8]! } as StorageAdminActor,
    customerA: customer(0),
    customerB: customer(1),
    foreignOwner: business(7, 5, "OWNER"),
    manager: business(3, 1, "MANAGER"),
    owner: business(2, 0, "OWNER"),
    receptionist: business(4, 2, "RECEPTIONIST"),
    revoked: business(6, 4, "MANAGER"),
    staff: business(5, 3, "STAFF"),
  };
}

main();
