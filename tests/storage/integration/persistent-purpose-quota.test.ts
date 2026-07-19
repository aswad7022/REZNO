import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Prisma, type StoredAssetState, type StoragePurpose } from "@prisma/client";
import sharp from "sharp";

import { StorageDomainError } from "../../../features/storage/domain/errors";
import { generateStorageObjectKey, sha256Hex } from "../../../features/storage/domain/policy";
import { DeterministicStorageProvider } from "../../../features/storage/providers/deterministic";
import { setStorageProviderForTests } from "../../../features/storage/providers/registry";
import { deleteStoredAsset } from "../../../features/storage/services/storage-assets";
import {
  createUploadSession,
  finalizeUpload,
  issueUploadTarget,
} from "../../../features/storage/services/storage-mutations";
import { getStorageQuotaStatus } from "../../../features/storage/services/storage-query";
import type { StorageActor } from "../../../features/storage/services/actor";
import { prisma } from "../../../lib/db/prisma";
import { createStorageFixture, resetStorageTestDatabase } from "../helpers/storage-fixture";

const rejects = (code: string) => (error: unknown) => error instanceof StorageDomainError && error.code === code;

test("persistent per-purpose storage quotas are authoritative", { concurrency: false }, async (t) => {
  const provider = new DeterministicStorageProvider();
  const png = await sharp({ create: { background: "blue", channels: 3, height: 4, width: 5 } }).png().toBuffer();
  const invalidRaster = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3]);
  setStorageProviderForTests(provider);

  t.after(async () => {
    setStorageProviderForTests(undefined);
    await resetStorageTestDatabase();
    await prisma.$disconnect();
  });

  await t.test("Customer N-1 plus two concurrent reservations admits exactly one", async () => {
    await resetStorageTestDatabase();
    const fixture = await createStorageFixture("purpose-quota-customer");
    await seedProviderResidentAssets(fixture.actors.customer, "CUSTOMER_AVATAR", 4, png);

    const firstKey = randomUUID();
    const firstInput = sessionInput("CUSTOMER_AVATAR", png, firstKey);
    const secondKey = randomUUID();
    const secondInput = sessionInput("CUSTOMER_AVATAR", png, secondKey);
    const attempts = await runTogether([
      () => createUploadSession(fixture.actors.customer, firstInput),
      () => createUploadSession(fixture.actors.customer, secondInput),
    ]);
    const fulfilled = attempts.filter((result) => result.status === "fulfilled");
    const rejected = attempts.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0]?.status === "rejected" && rejects("STORAGE_QUOTA_EXCEEDED")(rejected[0].reason));

    const admitted = fulfilled[0]!.value;
    const firstMutation = await prisma.storageMutation.findUnique({
      where: { actorPersonId_idempotencyKey: { actorPersonId: fixture.actors.customer.personId, idempotencyKey: firstKey } },
    });
    const admittedInput = firstMutation?.targetId === admitted.id ? firstInput : secondInput;
    assert.equal((await createUploadSession(fixture.actors.customer, admittedInput)).id, admitted.id);
    assert.equal(await prisma.uploadSession.count({
      where: {
        ownerPersonId: fixture.actors.customer.personId,
        purpose: "CUSTOMER_AVATAR",
        state: { in: ["CREATED", "TARGET_ISSUED", "UPLOADED"] },
      },
    }), 1);

    const deniedKey = firstKey === admittedInput.idempotencyKey ? secondKey : firstKey;
    assert.equal(await prisma.storageMutation.count({
      where: { actorPersonId: fixture.actors.customer.personId, idempotencyKey: deniedKey },
    }), 0);
    await assert.rejects(createUploadSession(fixture.actors.customer, {
      ...admittedInput,
      expectedSizeBytes: png.byteLength + 1,
    }), rejects("IDEMPOTENCY_CONFLICT"));

    const reservedStatus = purposeStatus(await getStorageQuotaStatus(fixture.actors.customer), "CUSTOMER_AVATAR");
    assert.deepEqual(reservedStatus, { limit: 5, purpose: "CUSTOMER_AVATAR", reserved: 1, stored: 4, used: 5 });

    const target = await issueUploadTarget(fixture.actors.customer, {
      expectedVersion: admitted.version,
      idempotencyKey: randomUUID(),
      sessionId: admitted.id,
    });
    const session = await prisma.uploadSession.findUniqueOrThrow({ where: { id: admitted.id } });
    provider.putObject({ bytes: png, contentType: "image/png", objectKey: session.objectKey });
    const finalized = await finalizeUpload(fixture.actors.customer, {
      expectedVersion: target.sessionVersion,
      idempotencyKey: randomUUID(),
      sessionId: admitted.id,
    });
    assert.equal(finalized.asset.state, "READY");
    assert.deepEqual(
      purposeStatus(await getStorageQuotaStatus(fixture.actors.customer), "CUSTOMER_AVATAR"),
      { limit: 5, purpose: "CUSTOMER_AVATAR", reserved: 0, stored: 5, used: 5 },
    );
    await assert.rejects(
      createUploadSession(fixture.actors.customer, sessionInput("CUSTOMER_AVATAR", png)),
      rejects("STORAGE_QUOTA_EXCEEDED"),
    );
  });

  await t.test("Owner and Manager share Business capacity while Organizations remain isolated", async () => {
    await resetStorageTestDatabase();
    const fixture = await createStorageFixture("purpose-quota-business");
    await seedProviderResidentAssets(fixture.actors.owner, "BUSINESS_LOGO", 4, png);

    const attempts = await runTogether([
      () => createUploadSession(fixture.actors.owner, sessionInput("BUSINESS_LOGO", png)),
      () => createUploadSession(fixture.actors.manager, sessionInput("BUSINESS_LOGO", png)),
    ]);
    assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = attempts.find((result) => result.status === "rejected");
    assert.ok(rejected?.status === "rejected" && rejects("STORAGE_QUOTA_EXCEEDED")(rejected.reason));

    const ownerStatus = purposeStatus(await getStorageQuotaStatus(fixture.actors.owner), "BUSINESS_LOGO");
    const managerStatus = purposeStatus(await getStorageQuotaStatus(fixture.actors.manager), "BUSINESS_LOGO");
    assert.deepEqual(ownerStatus, { limit: 5, purpose: "BUSINESS_LOGO", reserved: 1, stored: 4, used: 5 });
    assert.deepEqual(managerStatus, ownerStatus);

    const foreign = await createUploadSession(fixture.actors.foreignOwner, sessionInput("BUSINESS_LOGO", png));
    assert.equal(foreign.purpose, "BUSINESS_LOGO");
    assert.deepEqual(
      purposeStatus(await getStorageQuotaStatus(fixture.actors.foreignOwner), "BUSINESS_LOGO"),
      { limit: 5, purpose: "BUSINESS_LOGO", reserved: 1, stored: 0, used: 1 },
    );
  });

  await t.test("expired, aborted, and finalized sessions do not reserve slots", async () => {
    await resetStorageTestDatabase();
    const fixture = await createStorageFixture("purpose-quota-terminal");
    const now = new Date();
    const active = await createUploadSession(fixture.actors.customer, sessionInput("CUSTOMER_AVATAR", png));
    await prisma.uploadSession.update({
      where: { id: active.id },
      data: { expiresAt: new Date(now.getTime() - 1), state: "CREATED" },
    });
    await createRawSession(fixture.actors.customer, "CUSTOMER_AVATAR", "ABORTED", {
      abortedAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    });
    await createRawSession(fixture.actors.customer, "CUSTOMER_AVATAR", "FINALIZED", {
      expiresAt: new Date(now.getTime() + 60_000),
      finalizedAt: now,
    });
    assert.deepEqual(
      purposeStatus(await getStorageQuotaStatus(fixture.actors.customer), "CUSTOMER_AVATAR"),
      { limit: 5, purpose: "CUSTOMER_AVATAR", reserved: 0, stored: 0, used: 0 },
    );
    assert.equal((await createUploadSession(fixture.actors.customer, sessionInput("CUSTOMER_AVATAR", png))).state, "CREATED");
  });

  await t.test("historical overallocation fails finalization closed and remains retryable", async () => {
    await resetStorageTestDatabase();
    const fixture = await createStorageFixture("purpose-quota-history");
    const assets = await seedProviderResidentAssets(fixture.actors.customer, "CUSTOMER_AVATAR", 5, png);
    const session = await createRawSession(fixture.actors.customer, "CUSTOMER_AVATAR", "TARGET_ISSUED", {
      expectedBytes: png,
      expiresAt: new Date(Date.now() + 60_000),
    });
    provider.putObject({ bytes: png, contentType: "image/png", objectKey: session.objectKey });
    const finalizeKey = randomUUID();
    await assert.rejects(finalizeUpload(fixture.actors.customer, {
      expectedVersion: session.version,
      idempotencyKey: finalizeKey,
      sessionId: session.id,
    }), rejects("STORAGE_QUOTA_EXCEEDED"));
    assert.equal(await prisma.storedAsset.count({ where: { uploadSessionId: session.id } }), 0);
    assert.equal((await prisma.uploadSession.findUniqueOrThrow({ where: { id: session.id } })).state, "TARGET_ISSUED");

    await deleteStoredAsset(fixture.actors.customer, {
      assetId: assets[0]!.id,
      expectedVersion: assets[0]!.version,
      idempotencyKey: randomUUID(),
    });
    const finalized = await finalizeUpload(fixture.actors.customer, {
      expectedVersion: session.version,
      idempotencyKey: finalizeKey,
      sessionId: session.id,
    });
    assert.equal(finalized.asset.state, "READY");
    assert.equal(await prisma.storedAsset.count({
      where: {
        ownerPersonId: fixture.actors.customer.personId,
        purpose: "CUSTOMER_AVATAR",
        state: { not: "DELETED" },
      },
    }), 5);
  });

  await t.test("concurrent create and finalize cannot exceed an exact-limit purpose", async () => {
    await resetStorageTestDatabase();
    const fixture = await createStorageFixture("purpose-quota-race");
    await seedProviderResidentAssets(fixture.actors.customer, "CUSTOMER_AVATAR", 4, png);
    const session = await createRawSession(fixture.actors.customer, "CUSTOMER_AVATAR", "TARGET_ISSUED", {
      expectedBytes: png,
      expiresAt: new Date(Date.now() + 60_000),
    });
    provider.putObject({ bytes: png, contentType: "image/png", objectKey: session.objectKey });
    const results = await runTogether([
      () => finalizeUpload(fixture.actors.customer, {
        expectedVersion: session.version,
        idempotencyKey: randomUUID(),
        sessionId: session.id,
      }),
      () => createUploadSession(fixture.actors.customer, sessionInput("CUSTOMER_AVATAR", png)),
    ]);
    assert.equal(results[0]?.status, "fulfilled");
    assert.ok(results[1]?.status === "rejected" && rejects("STORAGE_QUOTA_EXCEEDED")(results[1].reason));
    assert.deepEqual(
      purposeStatus(await getStorageQuotaStatus(fixture.actors.customer), "CUSTOMER_AVATAR"),
      { limit: 5, purpose: "CUSTOMER_AVATAR", reserved: 0, stored: 5, used: 5 },
    );
  });

  await t.test("REJECTED remains quota-counted beyond 24 hours until confirmed deletion", async () => {
    await resetStorageTestDatabase();
    const fixture = await createStorageFixture("purpose-quota-rejected");
    const seeded = await seedProviderResidentAssets(fixture.actors.customer, "CUSTOMER_AVATAR", 4, png);
    await prisma.storedAsset.update({
      where: { id: seeded[0]!.id },
      data: { quarantinedAt: new Date(), readyAt: null, state: "QUARANTINED" },
    });

    const created = await createUploadSession(fixture.actors.customer, sessionInput("CUSTOMER_AVATAR", invalidRaster));
    const target = await issueUploadTarget(fixture.actors.customer, {
      expectedVersion: created.version,
      idempotencyKey: randomUUID(),
      sessionId: created.id,
    });
    const session = await prisma.uploadSession.findUniqueOrThrow({ where: { id: created.id } });
    provider.putObject({ bytes: invalidRaster, contentType: "image/png", objectKey: session.objectKey });
    const rejected = await finalizeUpload(fixture.actors.customer, {
      expectedVersion: target.sessionVersion,
      idempotencyKey: randomUUID(),
      sessionId: session.id,
    });
    assert.equal(rejected.asset.state, "REJECTED");
    assert.deepEqual(
      purposeStatus(await getStorageQuotaStatus(fixture.actors.customer), "CUSTOMER_AVATAR"),
      { limit: 5, purpose: "CUSTOMER_AVATAR", reserved: 0, stored: 5, used: 5 },
    );
    await assert.rejects(
      createUploadSession(fixture.actors.customer, sessionInput("CUSTOMER_AVATAR", png)),
      rejects("STORAGE_QUOTA_EXCEEDED"),
    );

    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await prisma.storedAsset.update({ where: { id: rejected.asset.id }, data: { createdAt: old, rejectedAt: old } });
    await assert.rejects(
      createUploadSession(fixture.actors.customer, sessionInput("CUSTOMER_AVATAR", png)),
      rejects("STORAGE_QUOTA_EXCEEDED"),
    );

    provider.setDeleteOutcomes(session.objectKey, ["TRANSIENT_FAILURE", "READY"]);
    const deleteKey = randomUUID();
    await assert.rejects(deleteStoredAsset(fixture.actors.customer, {
      assetId: rejected.asset.id,
      expectedVersion: rejected.asset.version,
      idempotencyKey: deleteKey,
    }), rejects("STORAGE_PROVIDER_FAILURE"));
    assert.equal((await prisma.storedAsset.findUniqueOrThrow({ where: { id: rejected.asset.id } })).state, "DELETE_PENDING");
    assert.equal(provider.hasObject(session.objectKey), true);
    assert.equal(purposeStatus(await getStorageQuotaStatus(fixture.actors.customer), "CUSTOMER_AVATAR").used, 5);
    await assert.rejects(
      createUploadSession(fixture.actors.customer, sessionInput("CUSTOMER_AVATAR", png)),
      rejects("STORAGE_QUOTA_EXCEEDED"),
    );

    const deleted = await deleteStoredAsset(fixture.actors.customer, {
      assetId: rejected.asset.id,
      expectedVersion: rejected.asset.version,
      idempotencyKey: deleteKey,
    });
    assert.equal(deleted.state, "DELETED");
    assert.equal(provider.hasObject(session.objectKey), false);
    assert.deepEqual(
      purposeStatus(await getStorageQuotaStatus(fixture.actors.customer), "CUSTOMER_AVATAR"),
      { limit: 5, purpose: "CUSTOMER_AVATAR", reserved: 0, stored: 4, used: 4 },
    );
    assert.equal((await createUploadSession(fixture.actors.customer, sessionInput("CUSTOMER_AVATAR", png))).state, "CREATED");
  });

  await t.test("revised provider-resident and reservation queries use existing indexes", async () => {
    await resetStorageTestDatabase();
    const fixture = await createStorageFixture("purpose-quota-plans");
    await seedProviderResidentAssets(fixture.actors.customer, "CUSTOMER_AVATAR", 1, png);
    await seedProviderResidentAssets(fixture.actors.foreignCustomer, "CUSTOMER_AVATAR", 24, png);
    await seedProviderResidentAssets(fixture.actors.owner, "BUSINESS_LOGO", 1, png);
    await seedProviderResidentAssets(fixture.actors.foreignOwner, "BUSINESS_LOGO", 24, png);
    await Promise.all([
      createRawSession(fixture.actors.customer, "CUSTOMER_AVATAR", "CREATED", { expiresAt: new Date(Date.now() + 60_000) }),
      ...Array.from({ length: 24 }, () => createRawSession(fixture.actors.foreignCustomer, "CUSTOMER_AVATAR", "CREATED", { expiresAt: new Date(Date.now() + 60_000) })),
      createRawSession(fixture.actors.owner, "BUSINESS_LOGO", "CREATED", { expiresAt: new Date(Date.now() + 60_000) }),
      ...Array.from({ length: 24 }, () => createRawSession(fixture.actors.foreignOwner, "BUSINESS_LOGO", "CREATED", { expiresAt: new Date(Date.now() + 60_000) })),
    ]);
    await prisma.$executeRawUnsafe('ANALYZE "StoredAsset", "UploadSession"');
    const plans = await prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL enable_seqscan = off`;
      await transaction.$executeRaw`SET LOCAL enable_bitmapscan = off`;
      return Promise.all([
        transaction.$queryRaw(Prisma.sql`EXPLAIN (FORMAT JSON) SELECT count(*) FROM "StoredAsset" WHERE "ownerPersonId" = ${fixture.actors.customer.personId}::uuid AND "organizationId" IS NULL AND "purpose" = 'CUSTOMER_AVATAR' AND "state" IN ('PENDING_UPLOAD','UPLOADED','PENDING_INSPECTION','READY','QUARANTINED','REJECTED','DELETE_PENDING')`),
        transaction.$queryRaw(Prisma.sql`EXPLAIN (FORMAT JSON) SELECT count(*) FROM "StoredAsset" WHERE "organizationId" = ${fixture.organization.id}::uuid AND "purpose" = 'BUSINESS_LOGO' AND "state" IN ('PENDING_UPLOAD','UPLOADED','PENDING_INSPECTION','READY','QUARANTINED','REJECTED','DELETE_PENDING')`),
        transaction.$queryRaw(Prisma.sql`EXPLAIN (FORMAT JSON) SELECT count(*) FROM "UploadSession" WHERE "ownerPersonId" = ${fixture.actors.customer.personId}::uuid AND "organizationId" IS NULL AND "purpose" = 'CUSTOMER_AVATAR' AND "state" IN ('CREATED','TARGET_ISSUED','UPLOADED') AND "expiresAt" > now()`),
        transaction.$queryRaw(Prisma.sql`EXPLAIN (FORMAT JSON) SELECT count(*) FROM "UploadSession" WHERE "organizationId" = ${fixture.organization.id}::uuid AND "purpose" = 'BUSINESS_LOGO' AND "state" IN ('CREATED','TARGET_ISSUED','UPLOADED') AND "expiresAt" > now()`),
      ]);
    });
    const serialized = plans.map((plan) => JSON.stringify(plan));
    assert.match(serialized[0]!, /StoredAsset_ownerPersonId_purpose_state_idx/);
    assert.match(serialized[1]!, /StoredAsset_organizationId_purpose_state_idx/);
    assert.match(serialized[2]!, /UploadSession_ownerPersonId_state_expiresAt_idx/);
    assert.match(serialized[3]!, /UploadSession_organizationId_state_expiresAt_idx/);
  });
});

function sessionInput(purpose: StoragePurpose, bytes: Uint8Array, idempotencyKey = randomUUID()) {
  return {
    expectedChecksumSha256: sha256Hex(bytes),
    expectedMimeType: "image/png",
    expectedSizeBytes: bytes.byteLength,
    idempotencyKey,
    purpose,
  };
}

async function seedProviderResidentAssets(
  actor: StorageActor,
  purpose: StoragePurpose,
  count: number,
  bytes: Uint8Array,
  state: StoredAssetState = "READY",
) {
  const assets = [];
  for (let index = 0; index < count; index += 1) {
    const session = await createRawSession(actor, purpose, "FINALIZED", {
      expectedBytes: bytes,
      expiresAt: new Date(Date.now() + 60_000),
      finalizedAt: new Date(),
    });
    const timestamp = new Date();
    assets.push(await prisma.storedAsset.create({
      data: {
        checksumSha256: sha256Hex(bytes),
        createdByPersonId: actor.personId,
        deleteRequestedAt: state === "DELETE_PENDING" ? timestamp : null,
        deletedAt: state === "DELETED" ? timestamp : null,
        inspectionOutcome: state === "REJECTED" ? "INVALID_STRUCTURE" : state === "QUARANTINED" ? "INSPECTION_FAILED" : "VALID",
        mimeType: "image/png",
        objectKey: session.objectKey,
        organizationId: actor.kind === "business" ? actor.organizationId : null,
        ownerPersonId: actor.kind === "customer" ? actor.personId : null,
        provider: "DETERMINISTIC_TEST",
        providerObjectVersion: randomUUID(),
        purpose,
        quarantinedAt: state === "QUARANTINED" ? timestamp : null,
        readyAt: state === "READY" ? timestamp : null,
        rejectedAt: state === "REJECTED" ? timestamp : null,
        scannerOutcome: "SCANNER_NOT_CONFIGURED",
        sizeBytes: bytes.byteLength,
        state,
        uploadSessionId: session.id,
        visibility: actor.kind === "customer" ? "PRIVATE" : "PUBLIC",
      },
    }));
  }
  return assets;
}

function createRawSession(
  actor: StorageActor,
  purpose: StoragePurpose,
  state: "CREATED" | "TARGET_ISSUED" | "FINALIZED" | "ABORTED",
  timestamps: { abortedAt?: Date; expectedBytes?: Uint8Array; expiresAt: Date; finalizedAt?: Date },
) {
  return prisma.uploadSession.create({
    data: {
      abortedAt: timestamps.abortedAt,
      actorMembershipId: actor.kind === "business" ? actor.membershipId : null,
      actorPersonId: actor.personId,
      actorRoleId: actor.kind === "business" ? actor.roleId : null,
      expectedChecksumSha256: timestamps.expectedBytes ? sha256Hex(timestamps.expectedBytes) : null,
      expectedMimeType: "image/png",
      expectedSizeBytes: timestamps.expectedBytes?.byteLength ?? 91,
      expiresAt: timestamps.expiresAt,
      finalizedAt: timestamps.finalizedAt,
      objectKey: generateStorageObjectKey(purpose),
      organizationId: actor.kind === "business" ? actor.organizationId : null,
      ownerPersonId: actor.kind === "customer" ? actor.personId : null,
      provider: "DETERMINISTIC_TEST",
      purpose,
      state,
      targetIssuedAt: state === "TARGET_ISSUED" ? new Date() : null,
      visibility: actor.kind === "customer" ? "PRIVATE" : "PUBLIC",
    },
  });
}

async function runTogether<const T extends readonly unknown[]>(
  operations: { [K in keyof T]: () => Promise<T[K]> },
): Promise<{ [K in keyof T]: PromiseSettledResult<T[K]> }> {
  let waiting = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  return Promise.allSettled(operations.map(async (operation) => {
    waiting += 1;
    if (waiting === operations.length) release();
    await gate;
    return operation();
  })) as Promise<{ [K in keyof T]: PromiseSettledResult<T[K]> }>;
}

function purposeStatus(
  status: Awaited<ReturnType<typeof getStorageQuotaStatus>>,
  purpose: StoragePurpose,
) {
  return status.purposeAssets.find((row) => row.purpose === purpose)!;
}
