import "server-only";

import { PlatformJobMutationAction, PlatformJobType, Prisma } from "@prisma/client";

import { platformJobHash } from "@/features/platform-jobs/domain/canonical";
import { requiredPlatformJobPermissions } from "@/features/platform-jobs/domain/authority";
import { PLATFORM_JOB_LIMITS } from "@/features/platform-jobs/domain/contracts";
import { platformJobError } from "@/features/platform-jobs/domain/errors";
import { isPlatformJobCancellable, isPlatformJobRequeueable } from "@/features/platform-jobs/domain/lifecycle";
import { platformHealthPayload } from "@/features/platform-jobs/domain/registry";
import { assertPlatformJobAdminCurrent, type PlatformJobAdminContext } from "@/features/platform-jobs/services/admin-context";
import { enqueuePlatformJob } from "@/features/platform-jobs/services/jobs";
import { lockPlatformJob, runPlatformJobSerializable } from "@/features/platform-jobs/services/transaction";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function triggerPlatformJob(
  context: PlatformJobAdminContext,
  input: { idempotencyKey: string; jobType: PlatformJobType },
) {
  assertUuid(input.idempotencyKey, "idempotency key");
  if (input.jobType !== "PLATFORM_HEALTH_PROBE") {
    platformJobError("VALIDATION_ERROR", "This job type is not manually triggerable in Gate 6A.");
  }
  const requestHash = platformJobHash({ action: "MANUAL_TRIGGER", jobType: input.jobType, version: 1 });
  return runPlatformJobSerializable(async (transaction) => {
    const current = await assertPlatformJobAdminCurrent(transaction, context, "PLATFORM_JOBS_MANAGE");
    const replay = await mutationReplay(transaction, current.userId, input.idempotencyKey, "MANUAL_TRIGGER", requestHash);
    if (replay) return { ...replay, replay: true as const };
    const deduplicationKey = `manual:${platformJobHash(current.userId).slice(0, 16)}:${input.idempotencyKey}`;
    const created = await enqueuePlatformJob(transaction, {
      availableAt: new Date(),
      createdByAdminUserId: current.userId,
      createdByPersonId: current.personId,
      deduplicationKey,
      jobType: input.jobType,
      payload: platformHealthPayload(),
      payloadVersion: 1,
      source: "ADMIN_MANUAL",
    });
    const result = {
      jobId: created.job.id,
      jobType: created.job.jobType,
      status: created.job.status,
      version: created.job.version,
    };
    await createMutation(transaction, current, {
      action: "MANUAL_TRIGGER",
      idempotencyKey: input.idempotencyKey,
      jobId: created.job.id,
      requestHash,
      result,
    });
    return { ...result, replay: false as const };
  });
}

export async function cancelPlatformJob(
  context: PlatformJobAdminContext,
  input: { expectedVersion: number; idempotencyKey: string; jobId: string },
) {
  assertUuid(input.jobId, "job ID");
  assertUuid(input.idempotencyKey, "idempotency key");
  assertVersion(input.expectedVersion);
  const requestHash = platformJobHash({ action: "CANCEL", expectedVersion: input.expectedVersion, jobId: input.jobId });
  return runPlatformJobSerializable(async (transaction) => {
    const current = await assertPlatformJobAdminCurrent(transaction, context, "PLATFORM_JOBS_MANAGE");
    await lockPlatformJob(transaction, input.jobId);
    const job = await transaction.platformJob.findUnique({ where: { id: input.jobId } });
    if (!job) platformJobError("NOT_FOUND", "The platform job was not found.");
    await assertPlatformJobAdminCurrent(transaction, current, requiredPlatformJobPermissions(job.jobType));
    const replay = await mutationReplay(transaction, current.userId, input.idempotencyKey, "CANCEL", requestHash);
    if (replay) return { ...replay, replay: true as const };
    if (job.version !== input.expectedVersion) platformJobError("CONFLICT", "The platform job version changed.");
    if (!isPlatformJobCancellable(job.status)) platformJobError("JOB_NOT_CANCELLABLE", "The platform job is no longer cancellable.");
    const now = new Date();
    const updated = await transaction.platformJob.update({
      where: { id: job.id },
      data: { cancelledAt: now, status: "CANCELLED", updatedAt: now, version: { increment: 1 } },
    });
    const result = { jobId: updated.id, status: updated.status, version: updated.version };
    await createMutation(transaction, current, {
      action: "CANCEL",
      idempotencyKey: input.idempotencyKey,
      jobId: updated.id,
      requestHash,
      result,
    });
    return { ...result, replay: false as const };
  });
}

export async function requeuePlatformJob(
  context: PlatformJobAdminContext,
  input: { expectedVersion: number; idempotencyKey: string; jobId: string },
) {
  assertUuid(input.jobId, "job ID");
  assertUuid(input.idempotencyKey, "idempotency key");
  assertVersion(input.expectedVersion);
  const requestHash = platformJobHash({ action: "REQUEUE", expectedVersion: input.expectedVersion, jobId: input.jobId });
  return runPlatformJobSerializable(async (transaction) => {
    const current = await assertPlatformJobAdminCurrent(transaction, context, "PLATFORM_JOBS_MANAGE");
    await lockPlatformJob(transaction, input.jobId);
    const failed = await transaction.platformJob.findUnique({ where: { id: input.jobId } });
    if (!failed) platformJobError("NOT_FOUND", "The platform job was not found.");
    await assertPlatformJobAdminCurrent(transaction, current, requiredPlatformJobPermissions(failed.jobType));
    const replay = await mutationReplay(transaction, current.userId, input.idempotencyKey, "REQUEUE", requestHash);
    if (replay) return { ...replay, replay: true as const };
    if (failed.version !== input.expectedVersion) platformJobError("CONFLICT", "The platform job version changed.");
    if (!isPlatformJobRequeueable(failed.status)) platformJobError("JOB_NOT_REQUEUEABLE", "The platform job is not eligible for requeue.");
    const rootId = failed.requeueRootJobId ?? failed.id;
    if (rootId !== failed.id) await lockPlatformJob(transaction, rootId);
    const root = rootId === failed.id
      ? failed
      : await transaction.platformJob.findUnique({ where: { id: rootId } });
    if (!root) platformJobError("CONFLICT", "The requeue root is unavailable.");
    if (root.requeueCount >= PLATFORM_JOB_LIMITS.maxRequeues) {
      platformJobError("JOB_NOT_REQUEUEABLE", "The bounded requeue limit is exhausted.");
    }
    const sequence = root.requeueCount + 1;
    const created = await enqueuePlatformJob(transaction, {
      availableAt: new Date(),
      createdByAdminUserId: current.userId,
      createdByPersonId: current.personId,
      deduplicationKey: `requeue:${root.id}:${sequence}`,
      jobType: failed.jobType,
      maxAttempts: failed.maxAttempts,
      organizationId: failed.organizationId,
      payload: failed.payload,
      payloadVersion: failed.payloadVersion,
      priority: failed.priority,
      requeueRootJobId: root.id,
      requeueSequence: sequence,
      source: "ADMIN_MANUAL",
    });
    await transaction.platformJob.update({
      where: { id: root.id },
      data: { requeueCount: sequence, updatedAt: new Date(), version: { increment: 1 } },
    });
    const result = {
      jobId: failed.id,
      requeuedJobId: created.job.id,
      requeueSequence: sequence,
      status: created.job.status,
    };
    await createMutation(transaction, current, {
      action: "REQUEUE",
      idempotencyKey: input.idempotencyKey,
      jobId: failed.id,
      requestHash,
      result,
    });
    return { ...result, replay: false as const };
  });
}

async function mutationReplay(
  transaction: Prisma.TransactionClient,
  userId: string,
  idempotencyKey: string,
  action: PlatformJobMutationAction,
  requestHash: string,
) {
  const existing = await transaction.platformJobMutation.findUnique({
    where: { actorAdminUserId_idempotencyKey: { actorAdminUserId: userId, idempotencyKey } },
  });
  if (!existing) return null;
  if (existing.action !== action || existing.requestHash !== requestHash) {
    platformJobError("IDEMPOTENCY_CONFLICT", "The Admin idempotency key was reused with changed input.");
  }
  if (!existing.result || typeof existing.result !== "object" || Array.isArray(existing.result)) {
    platformJobError("CONFLICT", "The stored platform-job mutation result is invalid.");
  }
  return existing.result as Record<string, string | number | boolean | null>;
}

async function createMutation(
  transaction: Prisma.TransactionClient,
  context: PlatformJobAdminContext,
  input: {
    action: PlatformJobMutationAction;
    idempotencyKey: string;
    jobId: string;
    requestHash: string;
    result: Prisma.InputJsonObject;
  },
) {
  return transaction.platformJobMutation.create({
    data: {
      action: input.action,
      actorAdminUserId: context.userId,
      actorPersonId: context.personId,
      idempotencyKey: input.idempotencyKey,
      jobId: input.jobId,
      requestHash: input.requestHash,
      result: input.result,
    },
  });
}

function assertUuid(value: string, label: string) {
  if (!UUID.test(value)) platformJobError("VALIDATION_ERROR", `The ${label} is invalid.`);
}

function assertVersion(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 2_147_483_647) {
    platformJobError("VALIDATION_ERROR", "The expected version is invalid.");
  }
}
