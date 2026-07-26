import "server-only";

import { Prisma, type PushProvider } from "@prisma/client";

import type {
  PushReceiptEvent,
  PushReceiptIngestionResult,
} from "@/features/push-notifications/domain/contracts";
import {
  deletePushTokenMaterial,
  pushRequestHash,
} from "@/features/push-notifications/domain/crypto";
import { pushNotificationError } from "@/features/push-notifications/domain/errors";
import { prisma } from "@/lib/db/prisma";

export async function ingestPushProviderReceipts(
  provider: PushProvider,
  events: readonly PushReceiptEvent[],
  receivedAt = new Date(),
): Promise<PushReceiptIngestionResult> {
  const result: PushReceiptIngestionResult = {
    accepted: 0,
    kind: "PUSH_RECEIPTS_INGESTED",
    replayed: 0,
    unknown: 0,
  };
  for (const event of events) {
    const outcome = await ingestOne(provider, event, receivedAt);
    result[outcome] += 1;
  }
  return result;
}

async function ingestOne(
  provider: PushProvider,
  event: PushReceiptEvent,
  receivedAt: Date,
): Promise<"accepted" | "replayed" | "unknown"> {
  const requestHash = pushRequestHash({
    eventId: event.eventId,
    occurredAt: event.occurredAt.toISOString(),
    provider,
    providerMessageId: event.providerMessageId,
    safeCode: event.safeCode,
    status: event.status,
  });
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`push-receipt:${provider}:${event.eventId}`}, 0)
      )
    `);
    const existing = await transaction.pushProviderReceipt.findUnique({
      where: {
        provider_providerEventId: {
          provider,
          providerEventId: event.eventId,
        },
      },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        pushNotificationError(
          "RECEIPT_REJECTED",
          "The provider event identifier was reused.",
        );
      }
      return "replayed";
    }
    const providerName = provider.toLowerCase();
    const targets = await transaction.pushDeliveryTarget.findMany({
      where: {
        providerMessageId: event.providerMessageId,
        providerName,
      },
      include: {
        installation: {
          select: { id: true, installationId: true, provider: true },
        },
      },
      orderBy: { id: "asc" },
      take: 2,
    });
    if (targets.length !== 1 || targets[0].installation.provider !== provider) {
      await transaction.pushProviderReceipt.create({
        data: {
          provider,
          providerEventId: event.eventId,
          providerOccurredAt: event.occurredAt,
          receivedAt,
          requestHash,
          safeCode: event.safeCode,
          status: event.status,
          targetId: null,
        },
      });
      return "unknown";
    }
    const target = targets[0];
    await transaction.$queryRaw(Prisma.sql`
      SELECT target."id"
      FROM "PushDeliveryTarget" AS target
      WHERE target."id" = ${target.id}::uuid
      FOR UPDATE OF target
    `);
    const latest = await transaction.pushProviderReceipt.findFirst({
      where: { targetId: target.id },
      orderBy: [
        { providerOccurredAt: "desc" },
        { receivedAt: "desc" },
        { id: "desc" },
      ],
    });
    await transaction.pushProviderReceipt.create({
      data: {
        provider,
        providerEventId: event.eventId,
        providerOccurredAt: event.occurredAt,
        receivedAt,
        requestHash,
        safeCode: event.safeCode,
        status: event.status,
        targetId: target.id,
      },
    });
    const stale = latest && latest.providerOccurredAt > event.occurredAt;
    const delivered = target.status === "DELIVERED";
    if (stale || (delivered && event.status !== "DELIVERED")) return "accepted";
    const nextStatus = event.status === "DELIVERED"
      ? "DELIVERED"
      : event.status === "INVALID_TOKEN"
        ? "INVALID_TOKEN"
        : event.status === "TRANSIENT_FAILURE" && target.attemptCount < 3
          ? "RETRY_SCHEDULED"
          : "PERMANENT_FAILURE";
    await transaction.pushDeliveryTarget.update({
      where: { id: target.id },
      data: {
        deliveredAt: nextStatus === "DELIVERED" ? event.occurredAt : null,
        failedAt: nextStatus === "DELIVERED" || nextStatus === "RETRY_SCHEDULED"
          ? null
          : event.occurredAt,
        lastSafeCode: event.safeCode,
        status: nextStatus,
      },
    });
    if (nextStatus === "INVALID_TOKEN") {
      const deleted = deletePushTokenMaterial({
        installationId: target.installation.installationId,
        provider: target.installation.provider,
      });
      await transaction.pushInstallation.updateMany({
        where: {
          id: target.installation.id,
          status: "ACTIVE",
          tokenVersion: target.installationTokenVersion,
        },
        data: {
          ...deleted,
          invalidatedAt: event.occurredAt,
          revokedAt: null,
          status: "INVALIDATED",
        },
      });
    }
    return "accepted";
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}
