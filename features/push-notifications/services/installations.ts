import "server-only";

import { Prisma } from "@prisma/client";

import type {
  RevokePushInstallationInput,
  RegisterPushInstallationInput,
} from "@/features/push-notifications/api/validation";
import type {
  PushInstallationDto,
  PushInstallationRevokedDto,
} from "@/features/push-notifications/domain/contracts";
import {
  deletePushTokenMaterial,
  encryptPushToken,
  pushRequestHash,
  pushSecretHash,
  pushTokenFingerprint,
} from "@/features/push-notifications/domain/crypto";
import { pushNotificationError } from "@/features/push-notifications/domain/errors";
import { prisma } from "@/lib/db/prisma";

type CustomerContext = { personId: string; userId: string };

export async function registerPushInstallation(
  context: CustomerContext,
  input: RegisterPushInstallationInput,
  now = new Date(),
): Promise<PushInstallationDto> {
  const secretHash = pushSecretHash(input.installationSecret);
  const tokenFingerprint = pushTokenFingerprint(input.provider, input.token);
  const requestHash = pushRequestHash({
    action: "REGISTER",
    appVersion: input.appVersion,
    installationId: input.installationId,
    permissionStatus: input.permissionStatus,
    platform: input.platform,
    provider: input.provider,
    tokenFingerprint,
    operationGeneration: input.operationGeneration,
  });
  const tokenCiphertext = encryptPushToken({
    installationId: input.installationId,
    provider: input.provider,
    token: input.token,
  });

  return prisma.$transaction(async (transaction) => {
    await lockInstallationMutation(
      transaction,
      input.installationId,
      tokenFingerprint,
      context.personId,
      input.idempotencyKey,
    );
    const replay = await replayMutation<PushInstallationDto>(
      transaction,
      context.personId,
      input.idempotencyKey,
      "REGISTER",
      requestHash,
    );
    if (replay) return { ...replay, replayed: true };
    await assertOperationGenerationCurrent(
      transaction,
      input.installationId,
      secretHash,
      input.operationGeneration,
    );

    const current = await transaction.pushInstallation.findUnique({
      where: { installationId: input.installationId },
    });
    if (current && current.installationSecretHash !== secretHash) {
      pushNotificationError(
        "INSTALLATION_OWNERSHIP_MISMATCH",
        "The installation identity could not be verified.",
      );
    }

    const activeTokenOwner = await transaction.pushInstallation.findFirst({
      where: {
        tokenFingerprint,
        status: "ACTIVE",
        ...(current ? { id: { not: current.id } } : {}),
      },
    });
    if (activeTokenOwner && activeTokenOwner.personId !== context.personId) {
      pushNotificationError(
        "TOKEN_ALREADY_REGISTERED",
        "The push token belongs to another active installation.",
      );
    }
    if (activeTokenOwner) {
      const deleted = deletePushTokenMaterial({
        installationId: activeTokenOwner.installationId,
        provider: activeTokenOwner.provider,
      });
      await transaction.pushInstallation.update({
        where: { id: activeTokenOwner.id },
        data: {
          ...deleted,
          invalidatedAt: null,
          revokedAt: now,
          status: "REVOKED",
        },
      });
    }

    const tokenVersion = current
      ? current.tokenFingerprint === tokenFingerprint
        && current.provider === input.provider
        ? current.tokenVersion
        : current.tokenVersion + 1
      : 1;
    const installation = current
      ? await transaction.pushInstallation.update({
        where: { id: current.id },
        data: {
          appVersion: input.appVersion,
          invalidatedAt: null,
          lastRegisteredAt: now,
          permissionStatus: input.permissionStatus,
          personId: context.personId,
          platform: input.platform,
          provider: input.provider,
          revokedAt: null,
          status: "ACTIVE",
          tokenCiphertext,
          tokenFingerprint,
          tokenVersion,
        },
      })
      : await transaction.pushInstallation.create({
        data: {
          appVersion: input.appVersion,
          installationId: input.installationId,
          installationSecretHash: secretHash,
          lastRegisteredAt: now,
          permissionStatus: input.permissionStatus,
          personId: context.personId,
          platform: input.platform,
          provider: input.provider,
          status: "ACTIVE",
          tokenCiphertext,
          tokenFingerprint,
          tokenVersion,
        },
      });
    const result: PushInstallationDto = {
      installationId: installation.installationId,
      kind: "PUSH_INSTALLATION",
      permissionStatus: installation.permissionStatus,
      platform: installation.platform,
      provider: installation.provider,
      registeredAt: installation.lastRegisteredAt.toISOString(),
      replayed: false,
      status: "ACTIVE",
      tokenVersion: installation.tokenVersion,
    };
    await transaction.pushInstallationMutation.create({
      data: {
        action: "REGISTER",
        idempotencyKey: input.idempotencyKey,
        installationId: input.installationId,
        installationSecretHash: secretHash,
        operationGeneration: input.operationGeneration,
        personId: context.personId,
        requestHash,
        result: result as unknown as Prisma.InputJsonValue,
      },
    });
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function revokePushInstallation(
  context: CustomerContext,
  input: RevokePushInstallationInput,
  now = new Date(),
): Promise<PushInstallationRevokedDto> {
  const secretHash = pushSecretHash(input.installationSecret);
  const requestHash = pushRequestHash({
    action: "REVOKE",
    installationId: input.installationId,
    operationGeneration: input.operationGeneration,
    secretHash,
  });
  return prisma.$transaction(async (transaction) => {
    await lockInstallationMutation(
      transaction,
      input.installationId,
      null,
      context.personId,
      input.idempotencyKey,
    );
    const replay = await replayMutation<PushInstallationRevokedDto>(
      transaction,
      context.personId,
      input.idempotencyKey,
      "REVOKE",
      requestHash,
    );
    if (replay) return { ...replay, replayed: true };
    await assertOperationGenerationCurrent(
      transaction,
      input.installationId,
      secretHash,
      input.operationGeneration,
    );
    const current = await transaction.pushInstallation.findUnique({
      where: { installationId: input.installationId },
    });
    if (
      current
      && (
        current.personId !== context.personId
        || current.installationSecretHash !== secretHash
      )
    ) {
      pushNotificationError(
        "INSTALLATION_OWNERSHIP_MISMATCH",
        "The installation identity could not be verified.",
      );
    }
    if (current?.status === "ACTIVE") {
      const deleted = deletePushTokenMaterial({
        installationId: current.installationId,
        provider: current.provider,
      });
      await transaction.pushInstallation.update({
        where: { id: current.id },
        data: {
          ...deleted,
          invalidatedAt: null,
          revokedAt: now,
          status: "REVOKED",
        },
      });
    }
    const result: PushInstallationRevokedDto = {
      installationId: input.installationId,
      kind: "PUSH_INSTALLATION_REVOKED",
      replayed: false,
      revoked: Boolean(current),
    };
    await transaction.pushInstallationMutation.create({
      data: {
        action: "REVOKE",
        idempotencyKey: input.idempotencyKey,
        installationId: input.installationId,
        installationSecretHash: secretHash,
        operationGeneration: input.operationGeneration,
        personId: context.personId,
        requestHash,
        result: result as unknown as Prisma.InputJsonValue,
      },
    });
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function assertOperationGenerationCurrent(
  transaction: Prisma.TransactionClient,
  installationId: string,
  installationSecretHash: string,
  operationGeneration: number,
) {
  const latest = await transaction.pushInstallationMutation.findFirst({
    where: { installationId, installationSecretHash },
    orderBy: [
      { operationGeneration: "desc" },
      { createdAt: "desc" },
      { id: "desc" },
    ],
    select: { operationGeneration: true },
  });
  if (latest && latest.operationGeneration >= operationGeneration) {
    pushNotificationError(
      "STALE_OPERATION",
      "The push installation operation is stale.",
    );
  }
}

async function replayMutation<T>(
  transaction: Prisma.TransactionClient,
  personId: string,
  idempotencyKey: string,
  action: "REGISTER" | "REVOKE",
  requestHash: string,
) {
  const existing = await transaction.pushInstallationMutation.findUnique({
    where: { personId_idempotencyKey: { personId, idempotencyKey } },
  });
  if (!existing) return null;
  if (existing.action !== action || existing.requestHash !== requestHash) {
    pushNotificationError(
      "IDEMPOTENCY_CONFLICT",
      "The push installation idempotency key was reused.",
    );
  }
  return existing.result as T;
}

async function lockInstallationMutation(
  transaction: Prisma.TransactionClient,
  installationId: string,
  tokenFingerprint: string | null,
  personId: string,
  idempotencyKey: string,
) {
  const keys = [
    `push-installation:${installationId}`,
    `push-mutation:${personId}:${idempotencyKey}`,
    ...(tokenFingerprint ? [`push-token:${tokenFingerprint}`] : []),
  ].sort();
  for (const key of keys) {
    await transaction.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
    `);
  }
}
