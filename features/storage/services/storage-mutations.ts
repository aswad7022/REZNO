import "server-only";

import {
  Prisma,
  type StorageMutationAction,
  type StoragePurpose,
  type UploadSession,
} from "@prisma/client";

import { storedAssetDetailDto, uploadSessionDto } from "@/features/storage/domain/contracts";
import { storageError } from "@/features/storage/domain/errors";
import {
  ACTIVE_SESSION_RESERVATION_STATES,
  purposeQuotaPermits,
} from "@/features/storage/domain/quota";
import {
  STORAGE_SESSION_TTL_MS,
  STORAGE_TARGET_TTL_SECONDS,
  STORAGE_QUOTA_LIMITS,
  STORAGE_INSPECTION_POLICY_VERSION,
  generateStorageObjectKey,
  isUuid,
  normalizeChecksum,
  sanitizeStorageDisplayName,
  storageRequestHash,
} from "@/features/storage/domain/policy";
import {
  canManageOrganizationStorage,
  isStorageMimeType,
  isStoragePurpose,
  storagePurposePolicy,
} from "@/features/storage/domain/purpose-registry";
import {
  NotConfiguredMalwareScanner,
  inspectStaticRaster,
  type MalwareScanner,
} from "@/features/storage/inspection/image-inspector";
import { configuredStorageProvider, storageProviderFor } from "@/features/storage/providers/registry";
import { callStorageProvider, type StorageProviderOutcome } from "@/features/storage/providers/provider";
import {
  assertStorageActorCurrent,
  assertStorageAdminCurrent,
  type StorageActor,
  type StorageAdminActor,
} from "@/features/storage/services/actor";
import {
  readPurposeQuotaUsage,
  storageQuotaOwnerFilter,
} from "@/features/storage/services/storage-quota";
import { storageSerializable } from "@/features/storage/services/transaction";

export type StorageOperationActor = StorageActor | StorageAdminActor;
type UploadSessionDto = ReturnType<typeof uploadSessionDto>;
type UploadFinalizeResult = {
  type: "UPLOAD_FINALIZE_RESULT";
  asset: ReturnType<typeof storedAssetDetailDto>;
  sessionId: string;
  sessionVersion: number;
};

export type CreateUploadSessionInput = {
  displayName?: unknown;
  expectedChecksumSha256?: unknown;
  expectedMimeType: unknown;
  expectedSizeBytes: unknown;
  idempotencyKey: string;
  purpose: StoragePurpose;
};

let malwareScanner: MalwareScanner = new NotConfiguredMalwareScanner();

export function setStorageMalwareScannerForTests(scanner: MalwareScanner | undefined) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Storage scanner test configuration is unavailable in production.");
  }
  malwareScanner = scanner ?? new NotConfiguredMalwareScanner();
}

export function configuredStorageMalwareScanner() {
  return malwareScanner;
}

export async function createUploadSession(
  actor: StorageOperationActor,
  input: CreateUploadSessionInput,
) {
  assertIdempotencyKey(input.idempotencyKey);
  if (!isStoragePurpose(input.purpose)) {
    storageError("VALIDATION_ERROR", "Storage purpose is invalid.");
  }
  const policy = storagePurposePolicy(input.purpose);
  assertActorPurpose(actor, policy.ownerFamily);
  if (!isStorageMimeType(input.expectedMimeType)) {
    storageError("UNSUPPORTED_MEDIA_TYPE", "Only JPEG, PNG, and WebP are supported.");
  }
  const expectedMimeType = input.expectedMimeType;
  if (!Number.isSafeInteger(input.expectedSizeBytes) || Number(input.expectedSizeBytes) <= 0) {
    storageError("VALIDATION_ERROR", "expectedSizeBytes must be a positive safe integer.");
  }
  const expectedSizeBytes = Number(input.expectedSizeBytes);
  if (expectedSizeBytes > policy.maxBytes) {
    storageError("FILE_TOO_LARGE", "The file exceeds the purpose size limit.");
  }
  const displayName = sanitizeStorageDisplayName(input.displayName);
  const expectedChecksumSha256 = normalizeChecksum(input.expectedChecksumSha256);
  const provider = configuredStorageProvider();
  const requestHash = storageRequestHash({
    action: "CREATE_SESSION",
    actor: actorScope(actor),
    displayName,
    expectedChecksumSha256,
    expectedMimeType,
    expectedSizeBytes,
    purpose: input.purpose,
    visibility: policy.visibility,
  });

  return storageSerializable(async (transaction) => {
    await assertOperationActorCurrent(transaction, actor, "STORAGE_RECORDS_MANAGE");
    await lockScope(transaction, quotaScope(actor));
    const replay = await beginMutation(transaction, actor, "CREATE_SESSION", input.idempotencyKey, requestHash, null, "UploadSession");
    if (replay) return replay as UploadSessionDto;
    const now = await databaseNow(transaction);
    await assertCreateQuota(transaction, actor, input.purpose, expectedSizeBytes, now);
    if (provider.kind === "NOT_CONFIGURED") {
      storageError("STORAGE_PROVIDER_NOT_CONFIGURED", "Managed storage provider is not configured.");
    }
    const session = await transaction.uploadSession.create({
      data: {
        actorMembershipId: actor.kind === "business" ? actor.membershipId : null,
        actorPersonId: actor.personId,
        actorRoleId: actor.kind === "business" ? actor.roleId : null,
        displayName,
        expectedChecksumSha256,
        expectedMimeType,
        expectedSizeBytes,
        expiresAt: new Date(now.getTime() + STORAGE_SESSION_TTL_MS),
        objectKey: generateStorageObjectKey(input.purpose),
        organizationId: actor.kind === "business" ? actor.organizationId : null,
        ownerPersonId: actor.kind === "customer" ? actor.personId : null,
        provider: provider.kind,
        purpose: input.purpose,
        visibility: policy.visibility,
      },
    });
    const result = uploadSessionDto(session);
    await completeMutation(transaction, actor, input.idempotencyKey, session.id, result);
    await auditAdminOperation(transaction, actor, input.idempotencyKey, requestHash, "storage.session.create", "UploadSession", session.id, {
      purpose: session.purpose,
      state: session.state,
      visibility: session.visibility,
    }, session.updatedAt);
    return result;
  });
}

export async function issueUploadTarget(
  actor: StorageOperationActor,
  input: { expectedVersion: number; idempotencyKey: string; sessionId: string },
) {
  validateVersionedInput(input);
  const requestHash = storageRequestHash({
    action: "ISSUE_UPLOAD_TARGET",
    actor: actorScope(actor),
    expectedVersion: input.expectedVersion,
    sessionId: input.sessionId,
  });
  const prepared = await storageSerializable(async (transaction) => {
    await assertOperationActorCurrent(transaction, actor, "STORAGE_RECORDS_MANAGE");
    await lockScope(transaction, mutationScope(actor, input.idempotencyKey));
    const existing = await findMutation(transaction, actor, "ISSUE_UPLOAD_TARGET", input.idempotencyKey, requestHash);
    const session = await ownedSession(transaction, actor, input.sessionId);
    if (existing?.status === "COMPLETED") {
      if (!session.targetIssuedAt) storageError("UPLOAD_SESSION_NOT_ACTIVE", "Upload target replay is unavailable.");
      return { replayed: true, session };
    }
    if (!existing) {
      await createMutation(transaction, actor, "ISSUE_UPLOAD_TARGET", input.idempotencyKey, requestHash, input.expectedVersion, "UploadSession", session.id);
    }
    const now = await databaseNow(transaction);
    assertSessionActive(session, input.expectedVersion, ["CREATED", "TARGET_ISSUED"], now);
    return { replayed: false, session, targetIssuedAt: now };
  });

  const targetIssuedAt = prepared.replayed
    ? prepared.session.targetIssuedAt!
    : prepared.targetIssuedAt!;
  const expiresAt = new Date(targetIssuedAt.getTime() + STORAGE_TARGET_TTL_SECONDS * 1000);
  const provider = storageProviderFor(prepared.session.provider);
  const target = await callStorageProvider(() => provider.createUploadTarget({
    contentType: prepared.session.expectedMimeType,
    expiresAt,
    objectKey: prepared.session.objectKey,
    sizeBytes: Number(prepared.session.expectedSizeBytes),
  }));
  if (target.outcome !== "READY") providerError(target.outcome);
  assertUploadTarget(target, expiresAt, prepared.session.expectedMimeType, Number(prepared.session.expectedSizeBytes));

  if (prepared.replayed) return uploadTargetDto(prepared.session, target, true);
  return storageSerializable(async (transaction) => {
    await assertOperationActorCurrent(transaction, actor, "STORAGE_RECORDS_MANAGE");
    const replay = await findMutation(transaction, actor, "ISSUE_UPLOAD_TARGET", input.idempotencyKey, requestHash);
    if (replay?.status === "COMPLETED") {
      const session = await ownedSession(transaction, actor, input.sessionId);
      return uploadTargetDto(session, target, true);
    }
    const updated = await transaction.uploadSession.updateMany({
      where: {
        id: prepared.session.id,
        state: { in: ["CREATED", "TARGET_ISSUED"] },
        version: input.expectedVersion,
      },
      data: {
        providerUploadReference: target.providerUploadReference,
        state: "TARGET_ISSUED",
        targetIssuedAt,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) storageError("STALE_VERSION", "Upload session changed before target issuance.");
    const session = await transaction.uploadSession.findUniqueOrThrow({ where: { id: prepared.session.id } });
    const safeResult = { sessionId: session.id, targetExpiresAt: target.expiresAt.toISOString(), version: session.version };
    await completeMutation(transaction, actor, input.idempotencyKey, session.id, safeResult);
    await auditAdminOperation(transaction, actor, input.idempotencyKey, requestHash, "storage.target.issue", "UploadSession", session.id, {
      purpose: session.purpose,
      state: session.state,
    }, session.updatedAt);
    return uploadTargetDto(session, target, false);
  });
}

export async function finalizeUpload(
  actor: StorageOperationActor,
  input: { expectedVersion: number; idempotencyKey: string; sessionId: string },
) {
  validateVersionedInput(input);
  const requestHash = storageRequestHash({
    action: "FINALIZE_UPLOAD",
    actor: actorScope(actor),
    expectedVersion: input.expectedVersion,
    sessionId: input.sessionId,
  });
  const prepared = await storageSerializable(async (transaction) => {
    await assertOperationActorCurrent(transaction, actor, "STORAGE_RECORDS_MANAGE");
    await lockScope(transaction, mutationScope(actor, input.idempotencyKey));
    const existing = await findMutation(transaction, actor, "FINALIZE_UPLOAD", input.idempotencyKey, requestHash);
    if (existing?.status === "COMPLETED" && existing.result) {
      return { replay: existing.result, session: null };
    }
    const session = await ownedSession(transaction, actor, input.sessionId);
    if (!existing) {
      await createMutation(transaction, actor, "FINALIZE_UPLOAD", input.idempotencyKey, requestHash, input.expectedVersion, "UploadSession", session.id);
    }
    const now = await databaseNow(transaction);
    assertSessionActive(session, input.expectedVersion, ["TARGET_ISSUED", "UPLOADED"], now);
    return { replay: null, session };
  });
  if (prepared.replay) return prepared.replay as UploadFinalizeResult;
  const session = prepared.session!;
  const provider = storageProviderFor(session.provider);
  const reference = { objectKey: session.objectKey, provider: session.provider } as const;
  const metadata = await callStorageProvider(() => provider.headObject(reference));
  if (metadata.outcome !== "READY") {
    if (metadata.outcome === "NOT_FOUND") storageError("UPLOAD_OBJECT_MISMATCH", "Uploaded object was not found.");
    providerError(metadata.outcome);
  }
  assertObjectMetadata(metadata);
  if (metadata.sizeBytes !== Number(session.expectedSizeBytes)
    || metadata.sizeBytes <= 0
    || metadata.contentType !== session.expectedMimeType
    || (session.expectedChecksumSha256
      && metadata.checksumSha256
      && metadata.checksumSha256 !== session.expectedChecksumSha256)) {
    storageError("UPLOAD_OBJECT_MISMATCH", "Uploaded object metadata does not match the session.");
  }
  const policy = storagePurposePolicy(session.purpose);
  if (metadata.sizeBytes > policy.maxBytes) storageError("FILE_TOO_LARGE", "Uploaded object exceeds the purpose size limit.");
  const content = await callStorageProvider(() => provider.getObjectForInspection({ ...reference, maxBytes: policy.maxBytes }));
  if (content.outcome !== "READY") {
    if (content.outcome === "NOT_FOUND") storageError("UPLOAD_OBJECT_MISMATCH", "Uploaded object disappeared before inspection.");
    providerError(content.outcome);
  }
  if (content.bytes.byteLength !== metadata.sizeBytes) {
    storageError("UPLOAD_OBJECT_MISMATCH", "Uploaded object size changed during finalization.");
  }
  const inspection = await inspectStaticRaster(content.bytes);
  if (session.expectedChecksumSha256 && inspection.checksumSha256 !== session.expectedChecksumSha256) {
    storageError("UPLOAD_OBJECT_MISMATCH", "Uploaded object checksum does not match the session.");
  }
  if (inspection.actualMimeType && inspection.actualMimeType !== session.expectedMimeType) {
    storageError("UPLOAD_OBJECT_MISMATCH", "Uploaded object content type does not match the session.");
  }
  let scannerOutcome: Awaited<ReturnType<MalwareScanner["inspect"]>>;
  try {
    scannerOutcome = await malwareScanner.inspect({
      bytes: content.bytes,
      checksumSha256: inspection.checksumSha256,
    });
    if (!["SCANNER_NOT_CONFIGURED", "CLEAN", "MALWARE_DETECTED", "SCAN_FAILED"].includes(scannerOutcome)) {
      scannerOutcome = "SCAN_FAILED";
    }
  } catch {
    scannerOutcome = "SCAN_FAILED";
  }
  const assetDisposition = disposition(inspection.outcome, scannerOutcome);
  const verifiedMetadata = await callStorageProvider(() => provider.headObject(reference));
  if (verifiedMetadata.outcome !== "READY"
    || !validObjectMetadata(verifiedMetadata)
    || verifiedMetadata.sizeBytes !== metadata.sizeBytes
    || verifiedMetadata.contentType !== metadata.contentType
    || verifiedMetadata.checksumSha256 !== metadata.checksumSha256
    || verifiedMetadata.objectVersion !== metadata.objectVersion) {
    storageError("UPLOAD_OBJECT_MISMATCH", "Uploaded object changed during finalization.");
  }

  return storageSerializable(async (transaction) => {
    await assertOperationActorCurrent(transaction, actor, "STORAGE_RECORDS_MANAGE");
    await lockScope(transaction, quotaScope(actor));
    const replay = await findMutation(transaction, actor, "FINALIZE_UPLOAD", input.idempotencyKey, requestHash);
    if (replay?.status === "COMPLETED" && replay.result) return replay.result as UploadFinalizeResult;
    const current = await ownedSession(transaction, actor, session.id);
    const now = await databaseNow(transaction);
    assertSessionActive(current, input.expectedVersion, ["TARGET_ISSUED", "UPLOADED"], now);
    await assertFinalizeQuota(transaction, actor, current, metadata.sizeBytes, now);
    const existingAsset = await transaction.storedAsset.findUnique({ where: { uploadSessionId: session.id } });
    if (existingAsset) storageError("UPLOAD_SESSION_NOT_ACTIVE", "Upload session already produced an asset.");
    const asset = await transaction.storedAsset.create({
      data: {
        checksumSha256: inspection.checksumSha256,
        createdByPersonId: actor.personId,
        deleteRequestedAt: null,
        deletedAt: null,
        displayName: session.displayName,
        failureCode: assetDisposition.failureCode,
        inspectionMetadata: {
          format: inspection.format,
          height: inspection.height,
          pages: inspection.pages,
          width: inspection.width,
        },
        inspectionOutcome: inspection.outcome,
        inspectionPolicyVersion: STORAGE_INSPECTION_POLICY_VERSION,
        mimeType: metadata.contentType,
        objectKey: session.objectKey,
        organizationId: session.organizationId,
        ownerPersonId: session.ownerPersonId,
        provider: session.provider,
        providerObjectVersion: metadata.objectVersion,
        purpose: session.purpose,
        quarantinedAt: assetDisposition.state === "QUARANTINED" ? now : null,
        readyAt: assetDisposition.state === "READY" ? now : null,
        rejectedAt: assetDisposition.state === "REJECTED" ? now : null,
        scannerOutcome,
        sizeBytes: metadata.sizeBytes,
        state: assetDisposition.state,
        uploadSessionId: session.id,
        visibility: session.visibility,
      },
    });
    const updated = await transaction.uploadSession.updateMany({
      where: { id: session.id, state: { in: ["TARGET_ISSUED", "UPLOADED"] }, version: input.expectedVersion },
      data: { finalizedAt: now, state: "FINALIZED", uploadedAt: now, version: { increment: 1 } },
    });
    if (updated.count !== 1) storageError("STALE_VERSION", "Upload session changed during finalization.");
    const result: UploadFinalizeResult = {
      type: "UPLOAD_FINALIZE_RESULT" as const,
      asset: storedAssetDetailDto(asset),
      sessionId: session.id,
      sessionVersion: input.expectedVersion + 1,
    };
    await completeMutation(transaction, actor, input.idempotencyKey, asset.id, result);
    await auditAdminOperation(transaction, actor, input.idempotencyKey, requestHash, "storage.upload.finalize", "StoredAsset", asset.id, {
      inspectionOutcome: asset.inspectionOutcome,
      purpose: asset.purpose,
      scannerOutcome: asset.scannerOutcome,
      state: asset.state,
      visibility: asset.visibility,
    }, asset.updatedAt);
    return result;
  });
}

export async function abortUpload(
  actor: StorageOperationActor,
  input: { expectedVersion: number; idempotencyKey: string; sessionId: string },
) {
  validateVersionedInput(input);
  const requestHash = storageRequestHash({ action: "ABORT_UPLOAD", actor: actorScope(actor), ...input });
  return storageSerializable(async (transaction) => {
    await assertOperationActorCurrent(transaction, actor, "STORAGE_RECORDS_MANAGE");
    await lockScope(transaction, mutationScope(actor, input.idempotencyKey));
    const replay = await beginMutation(transaction, actor, "ABORT_UPLOAD", input.idempotencyKey, requestHash, input.expectedVersion, "UploadSession", input.sessionId);
    if (replay) return replay as UploadSessionDto;
    const session = await ownedSession(transaction, actor, input.sessionId);
    const now = await databaseNow(transaction);
    assertSessionActive(session, input.expectedVersion, ["CREATED", "TARGET_ISSUED", "UPLOADED"], now);
    const changed = await transaction.uploadSession.updateMany({
      where: { id: session.id, state: { in: ["CREATED", "TARGET_ISSUED", "UPLOADED"] }, version: input.expectedVersion },
      data: { abortedAt: now, state: "ABORTED", version: { increment: 1 } },
    });
    if (changed.count !== 1) storageError("STALE_VERSION", "Upload session changed before abort.");
    const updated = await transaction.uploadSession.findUniqueOrThrow({ where: { id: session.id } });
    const result = uploadSessionDto(updated);
    await completeMutation(transaction, actor, input.idempotencyKey, session.id, result);
    await auditAdminOperation(transaction, actor, input.idempotencyKey, requestHash, "storage.session.abort", "UploadSession", session.id, {
      purpose: session.purpose,
      state: updated.state,
    }, updated.updatedAt);
    return result;
  });
}

function validateVersionedInput(input: { expectedVersion: number; idempotencyKey: string; sessionId: string }) {
  assertIdempotencyKey(input.idempotencyKey);
  if (!isUuid(input.sessionId)) storageError("VALIDATION_ERROR", "sessionId must be a UUID.");
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    storageError("VALIDATION_ERROR", "expectedVersion must be a positive integer.");
  }
}

function assertSessionActive(
  session: UploadSession,
  expectedVersion: number,
  states: UploadSession["state"][],
  now: Date,
) {
  if (session.version !== expectedVersion) storageError("STALE_VERSION", "Upload session version is stale.");
  if (session.expiresAt.getTime() <= now.getTime()) storageError("UPLOAD_SESSION_EXPIRED", "Upload session expired.");
  if (!states.includes(session.state)) storageError("UPLOAD_SESSION_NOT_ACTIVE", "Upload session is not active.");
}

async function ownedSession(
  transaction: Prisma.TransactionClient,
  actor: StorageOperationActor,
  sessionId: string,
) {
  const session = await transaction.uploadSession.findUnique({ where: { id: sessionId } });
  if (!session || session.actorPersonId !== actor.personId) storageError("NOT_FOUND", "Upload session was not found.");
  if (actor.kind === "business") {
    if (session.organizationId !== actor.organizationId
      || session.actorMembershipId !== actor.membershipId
      || session.actorRoleId !== actor.roleId) storageError("NOT_FOUND", "Upload session was not found.");
  } else if (session.organizationId !== null) {
    storageError("NOT_FOUND", "Upload session was not found.");
  }
  if (actor.kind === "customer" && session.ownerPersonId !== actor.personId) {
    storageError("NOT_FOUND", "Upload session was not found.");
  }
  if (actor.kind === "admin" && session.purpose !== "INTERNAL_STORAGE_TEST") {
    storageError("NOT_FOUND", "Upload session was not found.");
  }
  return session;
}

async function assertCreateQuota(
  transaction: Prisma.TransactionClient,
  actor: StorageOperationActor,
  purpose: StoragePurpose,
  newBytes: number,
  now: Date,
) {
  const limits = quotaFor(actor);
  const owner = storageQuotaOwnerFilter(actor);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [activeSessions, pending, dailySessions, purposeUsage] = await Promise.all([
    transaction.uploadSession.count({ where: { ...owner.session, expiresAt: { gt: now }, state: { in: [...ACTIVE_SESSION_RESERVATION_STATES] } } }),
    transaction.uploadSession.aggregate({
      where: { ...owner.session, expiresAt: { gt: now }, state: { in: [...ACTIVE_SESSION_RESERVATION_STATES] } },
      _sum: { expectedSizeBytes: true },
    }),
    transaction.uploadSession.count({ where: { ...owner.session, createdAt: { gte: dayAgo } } }),
    readPurposeQuotaUsage(transaction, actor, purpose, now),
  ]);
  if (activeSessions >= limits.activeSessions
    || Number(pending._sum.expectedSizeBytes ?? BigInt(0)) + newBytes > limits.pendingBytes
    || dailySessions >= limits.dailySessions
    || !purposeQuotaPermits({
      additionalReservations: 1,
      limit: storagePurposePolicy(purpose).maxActiveAssets,
      reserved: purposeUsage.reserved,
      stored: purposeUsage.stored,
    })) {
    storageError("STORAGE_QUOTA_EXCEEDED", "Storage quota is exceeded.");
  }
}

async function assertFinalizeQuota(
  transaction: Prisma.TransactionClient,
  actor: StorageOperationActor,
  session: UploadSession,
  bytes: number,
  now: Date,
) {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [result, purposeUsage] = await Promise.all([
    transaction.storedAsset.aggregate({
      where: { ...storageQuotaOwnerFilter(actor).asset, createdAt: { gte: dayAgo } },
      _sum: { sizeBytes: true },
    }),
    readPurposeQuotaUsage(transaction, actor, session.purpose, now),
  ]);
  if (!purposeQuotaPermits({
    limit: storagePurposePolicy(session.purpose).maxActiveAssets,
    reserved: purposeUsage.reserved,
    stored: purposeUsage.stored,
  })) {
    storageError("STORAGE_QUOTA_EXCEEDED", "Persistent storage purpose quota is exceeded.");
  }
  if (Number(result._sum.sizeBytes ?? BigInt(0)) + bytes > quotaFor(actor).dailyFinalizedBytes) {
    storageError("STORAGE_QUOTA_EXCEEDED", "Daily finalized storage quota is exceeded.");
  }
}

function quotaFor(actor: StorageOperationActor) {
  return actor.kind === "customer"
    ? STORAGE_QUOTA_LIMITS.person
    : actor.kind === "business" ? STORAGE_QUOTA_LIMITS.organization : STORAGE_QUOTA_LIMITS.internal;
}

function assertActorPurpose(actor: StorageOperationActor, ownerFamily: string) {
  if (actor.kind === "customer" && ownerFamily === "PERSON") return;
  if (actor.kind === "business" && ownerFamily === "ORGANIZATION" && canManageOrganizationStorage(actor.systemRole)) return;
  if (actor.kind === "admin" && ownerFamily === "PLATFORM_INTERNAL") return;
  storageError("FORBIDDEN", "The current actor cannot use this storage purpose.");
}

function disposition(
  inspection: Awaited<ReturnType<typeof inspectStaticRaster>>["outcome"],
  scanner: Awaited<ReturnType<MalwareScanner["inspect"]>>,
) {
  if (scanner === "MALWARE_DETECTED") return { failureCode: "MALWARE_DETECTED", state: "REJECTED" as const };
  if (scanner === "SCAN_FAILED") return { failureCode: "SCAN_FAILED", state: "QUARANTINED" as const };
  if (inspection === "VALID") return { failureCode: null, state: "READY" as const };
  if (inspection === "INSPECTION_FAILED") return { failureCode: inspection, state: "QUARANTINED" as const };
  return { failureCode: inspection, state: "REJECTED" as const };
}

function uploadTargetDto(
  session: UploadSession,
  target: { expiresAt: Date; headers: Readonly<Record<string, string>>; method: "PUT"; url: string },
  replayed: boolean,
) {
  return {
    type: "UPLOAD_TARGET" as const,
    expiresAt: target.expiresAt.toISOString(),
    headers: target.headers,
    method: target.method,
    replayed,
    sessionId: session.id,
    sessionVersion: session.version,
    url: target.url,
  };
}

async function beginMutation(
  transaction: Prisma.TransactionClient,
  actor: StorageOperationActor,
  action: StorageMutationAction,
  key: string,
  requestHash: string,
  expectedVersion: number | null,
  targetType: string,
  targetId?: string,
) {
  await lockScope(transaction, mutationScope(actor, key));
  const existing = await findMutation(transaction, actor, action, key, requestHash);
  if (existing?.status === "COMPLETED" && existing.result) return existing.result;
  if (!existing) await createMutation(transaction, actor, action, key, requestHash, expectedVersion, targetType, targetId);
  return null;
}

async function findMutation(
  transaction: Prisma.TransactionClient,
  actor: StorageOperationActor,
  action: StorageMutationAction,
  key: string,
  requestHash: string,
) {
  const existing = await transaction.storageMutation.findUnique({
    where: { actorPersonId_idempotencyKey: { actorPersonId: actor.personId, idempotencyKey: key } },
  });
  if (existing && (existing.action !== action
    || existing.requestHash !== requestHash
    || existing.organizationId !== actorOrganizationId(actor))) {
    storageError("IDEMPOTENCY_CONFLICT", "Idempotency key was used for a different storage request.");
  }
  return existing;
}

function createMutation(
  transaction: Prisma.TransactionClient,
  actor: StorageOperationActor,
  action: StorageMutationAction,
  idempotencyKey: string,
  requestHash: string,
  expectedVersion: number | null,
  targetType: string,
  targetId?: string,
) {
  return transaction.storageMutation.create({
    data: {
      action,
      actorPersonId: actor.personId,
      expectedVersion,
      idempotencyKey,
      organizationId: actorOrganizationId(actor),
      requestHash,
      targetId,
      targetType,
    },
  });
}

async function completeMutation(
  transaction: Prisma.TransactionClient,
  actor: StorageOperationActor,
  idempotencyKey: string,
  targetId: string,
  result: unknown,
) {
  await transaction.storageMutation.update({
    where: { actorPersonId_idempotencyKey: { actorPersonId: actor.personId, idempotencyKey } },
    data: { result: result as Prisma.InputJsonValue, status: "COMPLETED", targetId },
  });
}

async function auditAdminOperation(
  transaction: Prisma.TransactionClient,
  actor: StorageOperationActor,
  idempotencyKey: string,
  requestHash: string,
  action: string,
  targetType: "StoredAsset" | "UploadSession",
  targetId: string,
  metadata: Prisma.InputJsonObject,
  version: Date,
) {
  if (actor.kind !== "admin") return;
  await transaction.adminAuditLog.upsert({
    where: { adminUserId_idempotencyKey: { adminUserId: actor.userId, idempotencyKey } },
    create: {
      action,
      adminUserId: actor.userId,
      idempotencyKey,
      metadata,
      requestHash,
      result: { state: metadata.state ?? null },
      resultVersion: version,
      targetId,
      targetType,
    },
    update: {},
  });
}

async function assertOperationActorCurrent(
  transaction: Prisma.TransactionClient,
  actor: StorageOperationActor,
  permission: "STORAGE_RECORDS_VIEW" | "STORAGE_RECORDS_MANAGE",
) {
  return actor.kind === "admin"
    ? assertStorageAdminCurrent(transaction, actor, permission)
    : assertStorageActorCurrent(transaction, actor);
}

function assertIdempotencyKey(value: string) {
  if (!isUuid(value)) storageError("VALIDATION_ERROR", "idempotencyKey must be a UUID.");
}

function actorScope(actor: StorageOperationActor) {
  return {
    kind: actor.kind,
    organizationId: actorOrganizationId(actor),
    personId: actor.personId,
    ...(actor.kind === "business" ? { membershipId: actor.membershipId, roleId: actor.roleId } : {}),
  };
}

function actorOrganizationId(actor: StorageOperationActor) {
  return actor.kind === "business" ? actor.organizationId : null;
}

function quotaScope(actor: StorageOperationActor) {
  return actor.kind === "business"
    ? `storage-quota:organization:${actor.organizationId}`
    : `storage-quota:${actor.kind}:${actor.personId}`;
}

function mutationScope(actor: StorageOperationActor, key: string) {
  return `storage-mutation:${actor.personId}:${key}`;
}

async function lockScope(transaction: Prisma.TransactionClient, scope: string) {
  await transaction.$executeRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))
  `);
}

async function databaseNow(transaction: Prisma.TransactionClient) {
  const rows = await transaction.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS "now"`);
  if (!rows[0]) throw new Error("Database time is unavailable.");
  return rows[0].now;
}

function providerError(outcome: Exclude<StorageProviderOutcome, "READY">): never {
  if (outcome === "NOT_CONFIGURED") {
    storageError("STORAGE_PROVIDER_NOT_CONFIGURED", "Managed storage provider is not configured.");
  }
  storageError("STORAGE_PROVIDER_FAILURE", "Managed storage provider request failed.");
}

function assertUploadTarget(
  target: { expiresAt: Date; headers: Readonly<Record<string, string>>; method: "PUT"; providerUploadReference: string; url: string; writeOnce: true },
  requestedExpiry: Date,
  contentType: string,
  sizeBytes: number,
) {
  const headerEntries = Object.entries(target.headers);
  const headers = new Map(headerEntries.map(([key, value]) => [key.toLowerCase(), value]));
  const headerKeys = [...headers.keys()].sort();
  if (target.method !== "PUT"
    || target.writeOnce !== true
    || target.expiresAt.getTime() !== requestedExpiry.getTime()
    || !safeHttpsTarget(target.url)
    || !/^[A-Za-z0-9._:-]{1,180}$/.test(target.providerUploadReference)
    || headers.size !== headerEntries.length
    || headerKeys.some((key) => key !== "content-length" && key !== "content-type" && key !== "if-none-match")
    || headers.get("content-length") !== String(sizeBytes)
    || headers.get("content-type") !== contentType
    || headers.get("if-none-match") !== "*") {
    storageError("STORAGE_PROVIDER_FAILURE", "Managed storage provider returned an unsafe upload target.");
  }
}

function safeHttpsTarget(value: string) {
  if (value.length > 8_192) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

function assertObjectMetadata(metadata: {
  checksumSha256: string | null;
  objectVersion: string | null;
  sizeBytes: number;
}) {
  if (!validObjectMetadata(metadata)) {
    storageError("STORAGE_PROVIDER_FAILURE", "Managed storage provider returned unsafe object metadata.");
  }
}

function validObjectMetadata(metadata: {
  checksumSha256: string | null;
  objectVersion: string | null;
  sizeBytes: number;
}) {
  return Number.isSafeInteger(metadata.sizeBytes)
    && metadata.sizeBytes > 0
    && (metadata.checksumSha256 === null || /^[a-f0-9]{64}$/.test(metadata.checksumSha256))
    && (metadata.objectVersion === null || /^[A-Za-z0-9._:-]{1,180}$/.test(metadata.objectVersion));
}
