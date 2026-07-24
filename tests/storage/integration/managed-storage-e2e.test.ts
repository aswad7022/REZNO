import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { Prisma } from "@prisma/client";

import { setStorageCursorSigningSecretForTests } from "../../../features/storage/domain/cursor-signing";
import { StorageDomainError } from "../../../features/storage/domain/errors";
import { generateStorageObjectKey, sha256Hex } from "../../../features/storage/domain/policy";
import { DeterministicStorageProvider } from "../../../features/storage/providers/deterministic";
import { setStorageProviderForTests } from "../../../features/storage/providers/registry";
import { createDownloadTarget, deleteStoredAsset } from "../../../features/storage/services/storage-assets";
import { rejectStoredAsset, runManualStorageCleanup } from "../../../features/storage/services/storage-admin";
import {
  createUploadSession,
  finalizeUpload,
  issueUploadTarget,
  setStorageMalwareScannerForTests,
} from "../../../features/storage/services/storage-mutations";
import { getStorageQuotaStatus, listStoredAssets, listUploadSessions } from "../../../features/storage/services/storage-query";
import { prisma } from "../../../lib/db/prisma";
import { createStorageFixture, resetStorageTestDatabase } from "../helpers/storage-fixture";

const cursorSecret = "gate-5a-integration-cursor-secret-with-strong-entropy-2026-07-19-!";
const rejects = (code: string) => (error: unknown) => error instanceof StorageDomainError && error.code === code;

test("Gate 5A managed storage lifecycle is tenant-safe and exact", { concurrency: false }, async (t) => {
  await resetStorageTestDatabase();
  const fixture = await createStorageFixture("gate5a-e2e");
  const provider = new DeterministicStorageProvider();
  setStorageProviderForTests(provider);
  setStorageCursorSigningSecretForTests(cursorSecret);
  const png = await sharp({ create: { background: "blue", channels: 3, height: 4, width: 5 } }).png().toBuffer();
  const pngDigest = sha256Hex(png);
  let customerAssetId = "";
  let publicAssetId = "";

  t.after(async () => {
    setStorageProviderForTests(undefined);
    setStorageMalwareScannerForTests(undefined);
    setStorageCursorSigningSecretForTests(undefined);
    await resetStorageTestDatabase();
    await prisma.$disconnect();
  });

  await t.test("Customer session is exact, purpose-bound, and changed replay conflicts", async () => {
    const key = randomUUID();
    const input = {
      displayName: "avatar.png",
      expectedChecksumSha256: pngDigest,
      expectedMimeType: "image/png",
      expectedSizeBytes: png.byteLength,
      idempotencyKey: key,
      purpose: "CUSTOMER_AVATAR" as const,
    };
    const created = await createUploadSession(fixture.actors.customer, input);
    assert.deepEqual(await createUploadSession(fixture.actors.customer, input), created);
    assert.equal(await prisma.uploadSession.count({ where: { actorPersonId: fixture.actors.customer.personId } }), 1);
    await assert.rejects(createUploadSession(fixture.actors.customer, { ...input, expectedSizeBytes: png.byteLength + 1 }), rejects("IDEMPOTENCY_CONFLICT"));
    await assert.rejects(issueUploadTarget(fixture.actors.customer, {
      expectedVersion: created.version,
      idempotencyKey: key,
      sessionId: created.id,
    }), rejects("IDEMPOTENCY_CONFLICT"));
    await assert.rejects(createUploadSession(fixture.actors.customer, { ...input, idempotencyKey: randomUUID(), purpose: "PRODUCT_IMAGE" }), rejects("FORBIDDEN"));
  });

  await t.test("Owner and Manager are legal; Receptionist, Staff, revoked, and foreign scope are denied", async () => {
    for (const actor of [fixture.actors.owner, fixture.actors.manager]) {
      const result = await createUploadSession(actor, {
        expectedMimeType: "image/png",
        expectedSizeBytes: png.byteLength,
        idempotencyKey: randomUUID(),
        purpose: "BUSINESS_LOGO",
      });
      assert.equal(result.visibility, "PUBLIC");
    }
    for (const actor of [fixture.actors.receptionist, fixture.actors.staff]) {
      await assert.rejects(createUploadSession(actor, {
        expectedMimeType: "image/png",
        expectedSizeBytes: png.byteLength,
        idempotencyKey: randomUUID(),
        purpose: "BUSINESS_LOGO",
      }), rejects("FORBIDDEN"));
    }
    await assert.rejects(createUploadSession(fixture.actors.revoked, {
      expectedMimeType: "image/png",
      expectedSizeBytes: png.byteLength,
      idempotencyKey: randomUUID(),
      purpose: "BUSINESS_LOGO",
    }), rejects("FORBIDDEN"));
  });

  await t.test("quota status is explicit, owner-scoped, and uses bounded numeric DTOs", async () => {
    const customer = await getStorageQuotaStatus(fixture.actors.customer);
    assert.equal(customer.type, "STORAGE_QUOTA_STATUS");
    assert.equal(customer.activeSessions.limit, 5);
    assert.equal(customer.pendingBytes.limit, 25 * 1024 * 1024);
    assert.deepEqual(customer.purposeAssets.map((row) => row.purpose), ["CUSTOMER_AVATAR"]);
    assert.ok(customer.activeSessions.used >= 1);
    const business = await getStorageQuotaStatus(fixture.actors.owner);
    assert.equal(business.activeSessions.limit, 10);
    assert.ok(business.purposeAssets.every((row) => row.purpose !== "CUSTOMER_AVATAR"));
    const admin = await getStorageQuotaStatus(fixture.actors.admin);
    assert.deepEqual(admin.purposeAssets.map((row) => row.purpose), ["INTERNAL_STORAGE_TEST"]);
  });

  await t.test("membership revocation and Role-ID change invalidate issuance", async () => {
    const created = await createUploadSession(fixture.actors.owner, {
      expectedMimeType: "image/png",
      expectedSizeBytes: png.byteLength,
      idempotencyKey: randomUUID(),
      purpose: "BUSINESS_COVER",
    });
    await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { status: "INACTIVE" } });
    await assert.rejects(issueUploadTarget(fixture.actors.owner, {
      expectedVersion: created.version,
      idempotencyKey: randomUUID(),
      sessionId: created.id,
    }), rejects("FORBIDDEN"));
    await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { status: "ACTIVE" } });
    const replacementRole = await prisma.role.create({
      data: { isSystem: true, name: `replacement-${randomUUID()}`, organizationId: fixture.organization.id, systemRole: "OWNER" },
    });
    await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { roleId: replacementRole.id } });
    await assert.rejects(issueUploadTarget(fixture.actors.owner, {
      expectedVersion: created.version,
      idempotencyKey: randomUUID(),
      sessionId: created.id,
    }), rejects("FORBIDDEN"));
    await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { roleId: fixture.owner.role.id } });
  });

  await t.test("target issuance and successful finalization are exact-once", async () => {
    const created = await createUploadSession(fixture.actors.customer, {
      expectedChecksumSha256: pngDigest,
      expectedMimeType: "image/png",
      expectedSizeBytes: png.byteLength,
      idempotencyKey: randomUUID(),
      purpose: "CUSTOMER_AVATAR",
    });
    const targetKey = randomUUID();
    const target = await issueUploadTarget(fixture.actors.customer, { expectedVersion: created.version, idempotencyKey: targetKey, sessionId: created.id });
    const targetReplay = await issueUploadTarget(fixture.actors.customer, { expectedVersion: created.version, idempotencyKey: targetKey, sessionId: created.id });
    assert.equal(targetReplay.replayed, true);
    assert.equal(targetReplay.url, target.url);
    const row = await prisma.uploadSession.findUniqueOrThrow({ where: { id: created.id } });
    provider.putObject({ bytes: png, contentType: "image/png", objectKey: row.objectKey });
    const finalizeKey = randomUUID();
    const finalized = await finalizeUpload(fixture.actors.customer, { expectedVersion: row.version, idempotencyKey: finalizeKey, sessionId: row.id });
    const replay = await finalizeUpload(fixture.actors.customer, { expectedVersion: row.version, idempotencyKey: finalizeKey, sessionId: row.id });
    assert.deepEqual(replay, finalized);
    assert.equal(finalized.asset.state, "READY");
    assert.equal(finalized.asset.scannerOutcome, "SCANNER_NOT_CONFIGURED");
    assert.equal(await prisma.storedAsset.count({ where: { uploadSessionId: row.id } }), 1);
    customerAssetId = finalized.asset.id;
  });

  await t.test("adapter throws and unsafe targets are classified without raw provider leakage", async () => {
    const created = await createUploadSession(fixture.actors.customer, {
      expectedMimeType: "image/png",
      expectedSizeBytes: png.byteLength,
      idempotencyKey: randomUUID(),
      purpose: "CUSTOMER_AVATAR",
    });
    const throwingProvider = {
      kind: "DETERMINISTIC_TEST" as const,
      createUploadTarget: async () => { throw new Error("RAW_PROVIDER_ACCESS_KEY_SENTINEL"); },
      headObject: provider.headObject.bind(provider),
      getObjectForInspection: provider.getObjectForInspection.bind(provider),
      createDownloadTarget: provider.createDownloadTarget.bind(provider),
      deleteObject: provider.deleteObject.bind(provider),
    };
    setStorageProviderForTests(throwingProvider);
    await assert.rejects(
      issueUploadTarget(fixture.actors.customer, { expectedVersion: created.version, idempotencyKey: randomUUID(), sessionId: created.id }),
      (error: unknown) => error instanceof StorageDomainError
        && error.code === "STORAGE_PROVIDER_FAILURE"
        && !error.message.includes("RAW_PROVIDER_ACCESS_KEY_SENTINEL"),
    );
    const unsafeTargetProvider = {
      ...throwingProvider,
      createUploadTarget: async () => ({
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        headers: { authorization: "secret" },
        method: "PUT" as const,
        outcome: "READY" as const,
        providerUploadReference: "safe-reference",
        url: "javascript:alert(1)",
        writeOnce: true as const,
      }),
    };
    setStorageProviderForTests(unsafeTargetProvider);
    await assert.rejects(
      issueUploadTarget(fixture.actors.customer, { expectedVersion: created.version, idempotencyKey: randomUUID(), sessionId: created.id }),
      rejects("STORAGE_PROVIDER_FAILURE"),
    );
    setStorageProviderForTests(provider);
    await issueUploadTarget(fixture.actors.customer, {
      expectedVersion: created.version,
      idempotencyKey: randomUUID(),
      sessionId: created.id,
    });
    const session = await prisma.uploadSession.findUniqueOrThrow({ where: { id: created.id } });
    provider.putObject({ bytes: png, contentType: "image/png", objectKey: session.objectKey });
    setStorageProviderForTests({
      ...throwingProvider,
      createUploadTarget: provider.createUploadTarget.bind(provider),
      headObject: async () => ({
        checksumSha256: pngDigest,
        contentType: "image/png",
        objectVersion: "x".repeat(181),
        outcome: "READY" as const,
        sizeBytes: png.byteLength,
      }),
    });
    await assert.rejects(
      finalizeUpload(fixture.actors.customer, {
        expectedVersion: session.version,
        idempotencyKey: randomUUID(),
        sessionId: session.id,
      }),
      rejects("STORAGE_PROVIDER_FAILURE"),
    );
    assert.equal(await prisma.storedAsset.count({ where: { uploadSessionId: session.id } }), 0);
    setStorageProviderForTests(provider);
  });

  await t.test("missing, wrong size, wrong MIME, and wrong checksum produce no asset", async () => {
    for (const scenario of ["missing", "size", "mime", "checksum"] as const) {
      const expectedChecksum = scenario === "checksum" ? "f".repeat(64) : null;
      const created = await createUploadSession(fixture.actors.manager, {
        expectedChecksumSha256: expectedChecksum,
        expectedMimeType: "image/png",
        expectedSizeBytes: png.byteLength,
        idempotencyKey: randomUUID(),
        purpose: "SERVICE_IMAGE",
      });
      await issueUploadTarget(fixture.actors.manager, { expectedVersion: created.version, idempotencyKey: randomUUID(), sessionId: created.id });
      const session = await prisma.uploadSession.findUniqueOrThrow({ where: { id: created.id } });
      if (scenario !== "missing") {
        provider.putObject({
          bytes: scenario === "size" ? Buffer.concat([png, Buffer.from([0])]) : png,
          contentType: scenario === "mime" ? "image/jpeg" : "image/png",
          objectKey: session.objectKey,
        });
      }
      await assert.rejects(finalizeUpload(fixture.actors.manager, {
        expectedVersion: session.version,
        idempotencyKey: randomUUID(),
        sessionId: session.id,
      }), rejects("UPLOAD_OBJECT_MISMATCH"));
      assert.equal(await prisma.storedAsset.count({ where: { uploadSessionId: session.id } }), 0);
    }
  });

  await t.test("expiry and stale versions close the session without a partial asset", async () => {
    const expired = await createUploadSession(fixture.actors.customer, {
      expectedMimeType: "image/png",
      expectedSizeBytes: png.byteLength,
      idempotencyKey: randomUUID(),
      purpose: "CUSTOMER_AVATAR",
    });
    await prisma.uploadSession.update({ where: { id: expired.id }, data: { expiresAt: new Date("2026-07-18T00:00:00.000Z") } });
    await assert.rejects(issueUploadTarget(fixture.actors.customer, {
      expectedVersion: expired.version,
      idempotencyKey: randomUUID(),
      sessionId: expired.id,
    }), rejects("UPLOAD_SESSION_EXPIRED"));
    assert.equal(await prisma.storedAsset.count({ where: { uploadSessionId: expired.id } }), 0);

    const versioned = await createUploadSession(fixture.actors.owner, {
      expectedMimeType: "image/png",
      expectedSizeBytes: png.byteLength,
      idempotencyKey: randomUUID(),
      purpose: "BUSINESS_GALLERY_IMAGE",
    });
    await issueUploadTarget(fixture.actors.owner, {
      expectedVersion: versioned.version,
      idempotencyKey: randomUUID(),
      sessionId: versioned.id,
    });
    await assert.rejects(issueUploadTarget(fixture.actors.owner, {
      expectedVersion: versioned.version,
      idempotencyKey: randomUUID(),
      sessionId: versioned.id,
    }), rejects("STALE_VERSION"));
  });

  await t.test("concurrent finalization commits one asset and one atomic session transition", async () => {
    const created = await createUploadSession(fixture.actors.manager, {
      expectedMimeType: "image/png",
      expectedSizeBytes: png.byteLength,
      idempotencyKey: randomUUID(),
      purpose: "STORE_COVER",
    });
    await issueUploadTarget(fixture.actors.manager, {
      expectedVersion: created.version,
      idempotencyKey: randomUUID(),
      sessionId: created.id,
    });
    const session = await prisma.uploadSession.findUniqueOrThrow({ where: { id: created.id } });
    provider.putObject({ bytes: png, contentType: "image/png", objectKey: session.objectKey });
    const results = await Promise.allSettled([
      finalizeUpload(fixture.actors.manager, { expectedVersion: session.version, idempotencyKey: randomUUID(), sessionId: session.id }),
      finalizeUpload(fixture.actors.manager, { expectedVersion: session.version, idempotencyKey: randomUUID(), sessionId: session.id }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.equal(await prisma.storedAsset.count({ where: { uploadSessionId: session.id } }), 1);
    assert.equal((await prisma.uploadSession.findUniqueOrThrow({ where: { id: session.id } })).state, "FINALIZED");
  });

  await t.test("unsupported magic and malformed structures never become READY", async () => {
    const malformed = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3]);
    const created = await createUploadSession(fixture.actors.manager, {
      expectedMimeType: "image/png",
      expectedSizeBytes: malformed.byteLength,
      idempotencyKey: randomUUID(),
      purpose: "RESTAURANT_MENU_IMAGE",
    });
    await issueUploadTarget(fixture.actors.manager, {
      expectedVersion: created.version,
      idempotencyKey: randomUUID(),
      sessionId: created.id,
    });
    const session = await prisma.uploadSession.findUniqueOrThrow({ where: { id: created.id } });
    provider.putObject({ bytes: malformed, contentType: "image/png", objectKey: session.objectKey });
    const result = await finalizeUpload(fixture.actors.manager, {
      expectedVersion: session.version,
      idempotencyKey: randomUUID(),
      sessionId: session.id,
    });
    assert.equal(result.asset.state, "REJECTED");
    assert.equal(result.asset.inspectionOutcome, "INVALID_STRUCTURE");
    await assert.rejects(createDownloadTarget(fixture.actors.manager, result.asset.id), rejects("NOT_FOUND"));
  });

  await t.test("animated raster finalizes as REJECTED and is never downloadable", async () => {
    const frames = Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]);
    const animated = await sharp(frames, { raw: { channels: 4, height: 2, pageHeight: 1, width: 1 } })
      .webp({ delay: [100, 100], loop: 0 }).toBuffer();
    const created = await createUploadSession(fixture.actors.manager, {
      expectedMimeType: "image/webp",
      expectedSizeBytes: animated.byteLength,
      idempotencyKey: randomUUID(),
      purpose: "PRODUCT_IMAGE",
    });
    await issueUploadTarget(fixture.actors.manager, { expectedVersion: created.version, idempotencyKey: randomUUID(), sessionId: created.id });
    const session = await prisma.uploadSession.findUniqueOrThrow({ where: { id: created.id } });
    provider.putObject({ bytes: animated, contentType: "image/webp", objectKey: session.objectKey });
    const finalized = await finalizeUpload(fixture.actors.manager, { expectedVersion: session.version, idempotencyKey: randomUUID(), sessionId: session.id });
    assert.equal(finalized.asset.state, "REJECTED");
    assert.equal(finalized.asset.inspectionOutcome, "ANIMATED_NOT_ALLOWED");
    await assert.rejects(createDownloadTarget(null, finalized.asset.id), rejects("NOT_FOUND"));
  });

  await t.test("scanner uncertainty quarantines the asset and denies every download", async () => {
    setStorageMalwareScannerForTests({ inspect: async () => { throw new Error("scanner unavailable"); } });
    const created = await createUploadSession(fixture.actors.manager, {
      expectedMimeType: "image/png",
      expectedSizeBytes: png.byteLength,
      idempotencyKey: randomUUID(),
      purpose: "STORE_LOGO",
    });
    await issueUploadTarget(fixture.actors.manager, {
      expectedVersion: created.version,
      idempotencyKey: randomUUID(),
      sessionId: created.id,
    });
    const session = await prisma.uploadSession.findUniqueOrThrow({ where: { id: created.id } });
    provider.putObject({ bytes: png, contentType: "image/png", objectKey: session.objectKey });
    const finalized = await finalizeUpload(fixture.actors.manager, {
      expectedVersion: session.version,
      idempotencyKey: randomUUID(),
      sessionId: session.id,
    });
    assert.equal(finalized.asset.state, "QUARANTINED");
    assert.equal(finalized.asset.scannerOutcome, "SCAN_FAILED");
    await assert.rejects(createDownloadTarget(fixture.actors.manager, finalized.asset.id), rejects("NOT_FOUND"));
    await assert.rejects(createDownloadTarget(null, finalized.asset.id), rejects("NOT_FOUND"));
    setStorageMalwareScannerForTests(undefined);
  });

  await t.test("persistent active-session quota serializes concurrent requests", async () => {
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => createUploadSession(fixture.actors.foreignCustomer, {
      expectedMimeType: "image/png",
      expectedSizeBytes: png.byteLength,
      idempotencyKey: randomUUID(),
      purpose: "CUSTOMER_AVATAR",
    })));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 5);
    const rejected = results.find((result) => result.status === "rejected");
    assert.ok(rejected && rejected.status === "rejected" && rejects("STORAGE_QUOTA_EXCEEDED")(rejected.reason));
  });

  await t.test("private/public authorization, scope-bound pagination, and cursor invalidation", async () => {
    await assert.rejects(createDownloadTarget(fixture.actors.foreignCustomer, customerAssetId), rejects("NOT_FOUND"));
    await assert.rejects(createDownloadTarget(fixture.actors.admin, customerAssetId), rejects("NOT_FOUND"));
    assert.equal((await createDownloadTarget(fixture.actors.customer, customerAssetId)).assetId, customerAssetId);
    const created = await createUploadSession(fixture.actors.owner, {
      expectedMimeType: "image/png",
      expectedSizeBytes: png.byteLength,
      idempotencyKey: randomUUID(),
      purpose: "BUSINESS_LOGO",
    });
    await issueUploadTarget(fixture.actors.owner, { expectedVersion: created.version, idempotencyKey: randomUUID(), sessionId: created.id });
    const session = await prisma.uploadSession.findUniqueOrThrow({ where: { id: created.id } });
    provider.putObject({ bytes: png, contentType: "image/png", objectKey: session.objectKey });
    const finalized = await finalizeUpload(fixture.actors.owner, { expectedVersion: session.version, idempotencyKey: randomUUID(), sessionId: session.id });
    publicAssetId = finalized.asset.id;
    assert.equal((await createDownloadTarget(null, publicAssetId)).assetId, publicAssetId);

    await Promise.all(Array.from({ length: 2 }, () => createUploadSession(fixture.actors.admin, {
      expectedMimeType: "image/png",
      expectedSizeBytes: png.byteLength,
      idempotencyKey: randomUUID(),
      purpose: "INTERNAL_STORAGE_TEST",
    })));
    const first = await listUploadSessions(fixture.actors.admin, { limit: 1 });
    assert.ok(first.nextCursor);
    await assert.rejects(listUploadSessions(fixture.actors.viewAdmin, { cursor: first.nextCursor, limit: 1 }), rejects("INVALID_CURSOR"));
    const ownerPage = await listUploadSessions(fixture.actors.owner, { limit: 1 });
    assert.ok(ownerPage.nextCursor);
    const switchedMembership = await prisma.organizationMember.create({
      data: {
        organizationId: fixture.foreignOrganization.id,
        personId: fixture.owner.person.id,
        roleId: fixture.actors.foreignOwner.roleId,
      },
    });
    await assert.rejects(listUploadSessions({
      ...fixture.actors.owner,
      membershipId: switchedMembership.id,
      organizationId: fixture.foreignOrganization.id,
      roleId: fixture.actors.foreignOwner.roleId,
    }, { cursor: ownerPage.nextCursor, limit: 1 }), rejects("INVALID_CURSOR"));
    const assets = await listStoredAssets(fixture.actors.admin, { limit: 1 });
    assert.equal(assets.items.length, 1);
    if (assets.nextCursor) {
      await assert.rejects(listStoredAssets(fixture.actors.viewAdmin, { cursor: assets.nextCursor, limit: 1 }), rejects("INVALID_CURSOR"));
    }
  });

  await t.test("delete is immediately inaccessible and transient provider failure retries exactly", async () => {
    const asset = await prisma.storedAsset.findUniqueOrThrow({ where: { id: customerAssetId } });
    provider.setDeleteOutcomes(asset.objectKey, ["TRANSIENT_FAILURE", "READY"]);
    const key = randomUUID();
    await assert.rejects(deleteStoredAsset(fixture.actors.customer, { assetId: asset.id, expectedVersion: asset.version, idempotencyKey: key }), rejects("STORAGE_PROVIDER_FAILURE"));
    assert.equal((await prisma.storedAsset.findUniqueOrThrow({ where: { id: asset.id } })).state, "DELETE_PENDING");
    await assert.rejects(createDownloadTarget(fixture.actors.customer, asset.id), rejects("NOT_FOUND"));
    await assert.rejects(deleteStoredAsset(fixture.actors.customer, {
      assetId: asset.id,
      expectedVersion: asset.version,
      idempotencyKey: randomUUID(),
    }), rejects("STALE_VERSION"));
    assert.equal(provider.hasObject(asset.objectKey), true);
    const deleted = await deleteStoredAsset(fixture.actors.customer, { assetId: asset.id, expectedVersion: asset.version, idempotencyKey: key });
    assert.equal(deleted.state, "DELETED");
    assert.equal((await deleteStoredAsset(fixture.actors.customer, { assetId: asset.id, expectedVersion: asset.version, idempotencyKey: key })).state, "DELETED");
  });

  await t.test("bounded list, quota, expiry, cleanup, and mutation plans use Gate 5A indexes", async () => {
    const requiredExpiryIndex = await prisma.$queryRaw<Array<{
      columns: string[];
      indexName: string;
    }>>(Prisma.sql`
      SELECT
        index_class.relname AS "indexName",
        ARRAY_AGG(attribute.attname ORDER BY indexed_key.ordinality)::text[] AS "columns"
      FROM pg_class AS index_class
      JOIN pg_index AS index_info
        ON index_info.indexrelid = index_class.oid
      JOIN pg_class AS table_class
        ON table_class.oid = index_info.indrelid
      CROSS JOIN LATERAL unnest(index_info.indkey)
        WITH ORDINALITY AS indexed_key(attnum, ordinality)
      JOIN pg_attribute AS attribute
        ON attribute.attrelid = table_class.oid
        AND attribute.attnum = indexed_key.attnum
      WHERE table_class.relname = 'UploadSession'
        AND index_class.relname = 'UploadSession_state_expiresAt_id_idx'
      GROUP BY index_class.relname
    `);
    assert.deepEqual(requiredExpiryIndex, [{
      columns: ["state", "expiresAt", "id"],
      indexName: "UploadSession_state_expiresAt_id_idx",
    }]);
    const plans = await prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL enable_seqscan = off`;
      await transaction.$executeRaw`SET LOCAL enable_bitmapscan = off`;
      return Promise.all([
        transaction.$queryRaw(Prisma.sql`EXPLAIN (FORMAT JSON) SELECT "id" FROM "StoredAsset" WHERE "ownerPersonId" = ${fixture.actors.customer.personId}::uuid ORDER BY "createdAt" DESC, "id" DESC LIMIT 20`),
        transaction.$queryRaw(Prisma.sql`EXPLAIN (FORMAT JSON) SELECT "id" FROM "StoredAsset" WHERE "organizationId" = ${fixture.organization.id}::uuid ORDER BY "createdAt" DESC, "id" DESC LIMIT 20`),
        transaction.$queryRaw(Prisma.sql`EXPLAIN (FORMAT JSON) SELECT count(*), COALESCE(sum("expectedSizeBytes"), 0) FROM "UploadSession" WHERE "ownerPersonId" = ${fixture.actors.customer.personId}::uuid AND "state" IN ('CREATED','TARGET_ISSUED','UPLOADED') AND "expiresAt" > now()`),
        transaction.$queryRaw(Prisma.sql`EXPLAIN (FORMAT JSON) SELECT "id" FROM "UploadSession" WHERE "state" = 'EXPIRED' AND "expiresAt" <= now() ORDER BY "expiresAt", "id" LIMIT 50`),
        transaction.$queryRaw(Prisma.sql`EXPLAIN (FORMAT JSON) SELECT "id" FROM "StoredAsset" WHERE "state" = 'DELETE_PENDING' ORDER BY "deleteRequestedAt", "id" LIMIT 50`),
        transaction.$queryRaw(Prisma.sql`EXPLAIN (FORMAT JSON) SELECT "id" FROM "StorageMutation" WHERE "actorPersonId" = ${fixture.actors.customer.personId}::uuid AND "action" = 'CREATE_SESSION' AND "idempotencyKey" = ${randomUUID()}::uuid`),
        transaction.$queryRaw(Prisma.sql`EXPLAIN (FORMAT JSON) SELECT "id" FROM "StoredAsset" ORDER BY "createdAt" DESC, "id" DESC LIMIT 20`),
      ]);
    });
    const serialized = plans.map((plan) => JSON.stringify(plan));
    assert.match(serialized[0]!, /StoredAsset_ownerPersonId_createdAt_id_idx/);
    assert.match(serialized[1]!, /StoredAsset_organizationId_createdAt_id_idx/);
    assert.match(serialized[2]!, /UploadSession_ownerPersonId_(?:state_expiresAt|createdAt_id)_idx/);
    assert.match(
      serialized[3]!,
      /UploadSession_(?:provider_)?state_expiresAt_id_idx/,
    );
    assert.match(serialized[4]!, /StoredAsset_state_deleteRequestedAt_id_idx/);
    assert.match(serialized[5]!, /StorageMutation_actorPersonId_idempotencyKey_key/);
    assert.match(serialized[6]!, /StoredAsset_createdAt_id_idx/);
  });

  await t.test("Admin permission revocation fails closed and cleanup audit is redacted", async () => {
    const created = await createUploadSession(fixture.actors.admin, {
      expectedMimeType: "image/png",
      expectedSizeBytes: png.byteLength,
      idempotencyKey: randomUUID(),
      purpose: "INTERNAL_STORAGE_TEST",
    });
    await issueUploadTarget(fixture.actors.admin, {
      expectedVersion: created.version,
      idempotencyKey: randomUUID(),
      sessionId: created.id,
    });
    const session = await prisma.uploadSession.findUniqueOrThrow({ where: { id: created.id } });
    provider.putObject({ bytes: png, contentType: "image/png", objectKey: session.objectKey });
    const finalized = await finalizeUpload(fixture.actors.admin, {
      expectedVersion: session.version,
      idempotencyKey: randomUUID(),
      sessionId: session.id,
    });
    assert.equal((await createDownloadTarget(fixture.actors.viewAdmin, finalized.asset.id)).assetId, finalized.asset.id);
    await assert.rejects(rejectStoredAsset(fixture.actors.viewAdmin, {
      assetId: finalized.asset.id,
      expectedVersion: finalized.asset.version,
      idempotencyKey: randomUUID(),
    }), rejects("FORBIDDEN"));
    const rejectKey = randomUUID();
    const rejected = await rejectStoredAsset(fixture.actors.admin, {
      assetId: finalized.asset.id,
      expectedVersion: finalized.asset.version,
      idempotencyKey: rejectKey,
    });
    assert.equal(rejected.state, "REJECTED");
    assert.deepEqual(await rejectStoredAsset(fixture.actors.admin, {
      assetId: finalized.asset.id,
      expectedVersion: finalized.asset.version,
      idempotencyKey: rejectKey,
    }), rejected);
    await assert.rejects(createDownloadTarget(fixture.actors.admin, finalized.asset.id), rejects("NOT_FOUND"));
    const deletedInternal = await deleteStoredAsset(fixture.actors.admin, {
      assetId: rejected.id,
      expectedVersion: rejected.version,
      idempotencyKey: randomUUID(),
    });
    assert.equal(deletedInternal.state, "DELETED");
    assert.equal(deletedInternal.failureCode, "ADMIN_REJECTED");
    await prisma.adminAccess.update({ where: { id: fixture.adminAccess.id }, data: { status: "REVOKED" } });
    await assert.rejects(listStoredAssets(fixture.actors.admin), rejects("FORBIDDEN"));
    await prisma.adminAccess.update({ where: { id: fixture.adminAccess.id }, data: { status: "ACTIVE" } });
    await assert.rejects(runManualStorageCleanup(fixture.actors.viewAdmin, { idempotencyKey: randomUUID() }), rejects("FORBIDDEN"));
    await prisma.uploadSession.createMany({
      data: Array.from({ length: 11 }, () => ({
        actorPersonId: fixture.actors.customer.personId,
        expectedMimeType: "image/png",
        expectedSizeBytes: png.byteLength,
        expiresAt: new Date(Date.now() - 60_000),
        objectKey: generateStorageObjectKey("CUSTOMER_AVATAR"),
        ownerPersonId: fixture.actors.customer.personId,
        provider: "DETERMINISTIC_TEST" as const,
        purpose: "CUSTOMER_AVATAR" as const,
        state: "CREATED" as const,
        visibility: "PRIVATE" as const,
      })),
    });
    const cleanupKey = randomUUID();
    const result = await runManualStorageCleanup(fixture.actors.admin, { batchSize: 10, idempotencyKey: cleanupKey });
    assert.equal(result.type, "STORAGE_CLEANUP_RESULT");
    assert.equal(result.expiredSessions, 10);
    assert.ok(result.scannedOrphanSessions >= 1);
    assert.deepEqual(await runManualStorageCleanup(fixture.actors.admin, { batchSize: 10, idempotencyKey: cleanupKey }), result);
    const followup = await runManualStorageCleanup(fixture.actors.admin, { batchSize: 10, idempotencyKey: randomUUID() });
    assert.equal(followup.expiredSessions, 2);
    assert.equal(followup.scannedOrphanSessions, 0);
    const audit = await prisma.adminAuditLog.findUniqueOrThrow({ where: { adminUserId_idempotencyKey: { adminUserId: fixture.actors.admin.userId, idempotencyKey: cleanupKey } } });
    const serialized = JSON.stringify(audit);
    assert.doesNotMatch(serialized, /objectKey|checksum|signature|token|deterministic-storage/i);
  });
});
