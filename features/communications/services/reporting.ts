import "server-only";

import { Prisma } from "@prisma/client";

import type {
  AttemptSummaryDto,
  DeliverySummaryDto,
} from "@/features/communications/domain/contracts";
import { communicationError } from "@/features/communications/domain/errors";
import {
  decodeCursor,
  encodeCursor,
  listAttemptsSchema,
  listDeliveriesSchema,
  parseOrValidationError,
  targetSearchSchema,
} from "@/features/communications/domain/validation";
import {
  assertCommunicationAdminCurrent,
  type CommunicationAdminContext,
} from "@/features/communications/services/admin-actor";
import { prisma } from "@/lib/db/prisma";

export async function getDeliveryPage(
  context: CommunicationAdminContext,
  rawInput: unknown,
): Promise<{ kind: "DELIVERY_PAGE"; items: DeliverySummaryDto[]; nextCursor: string | null }> {
  const input = parseOrValidationError(listDeliveriesSchema, rawInput);
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  return prisma.$transaction(async (transaction) => {
    await assertCommunicationAdminCurrent(transaction, context, "NOTIFICATIONS_VIEW");
    const campaign = await transaction.communicationCampaign.findUnique({
      where: { id: input.campaignId },
      select: { id: true },
    });
    if (!campaign) communicationError("NOT_FOUND", "Campaign was not found.");
    const rows = await transaction.outboundDelivery.findMany({
      where: {
        campaignId: input.campaignId,
        ...(input.status ? { status: input.status } : {}),
        ...(cursor ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.pageSize + 1,
    });
    const visible = rows.slice(0, input.pageSize);
    const next = rows.length > input.pageSize ? visible.at(-1) : null;
    return {
      kind: "DELIVERY_PAGE",
      items: visible.map((delivery): DeliverySummaryDto => ({
        kind: "DELIVERY_SUMMARY",
        id: delivery.id,
        campaignId: delivery.campaignId,
        personId: delivery.personId,
        channel: delivery.channel,
        locale: delivery.locale as DeliverySummaryDto["locale"],
        status: delivery.status,
        attemptCount: delivery.attemptCount,
        nextAttemptAt: delivery.nextAttemptAt?.toISOString() ?? null,
        providerName: delivery.providerName,
        providerAcceptedId: delivery.providerMessageId,
        safeProviderCode: delivery.lastProviderCode,
        suppressionReason: delivery.suppressionReason,
        createdAt: delivery.createdAt.toISOString(),
      })),
      nextCursor: next ? encodeCursor(next.createdAt, next.id) : null,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function getAttemptPage(
  context: CommunicationAdminContext,
  rawInput: unknown,
): Promise<{ items: AttemptSummaryDto[]; nextCursor: string | null }> {
  const input = parseOrValidationError(listAttemptsSchema, rawInput);
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  return prisma.$transaction(async (transaction) => {
    await assertCommunicationAdminCurrent(transaction, context, "NOTIFICATIONS_VIEW");
    const delivery = await transaction.outboundDelivery.findUnique({
      where: { id: input.deliveryId },
      select: { id: true },
    });
    if (!delivery) communicationError("NOT_FOUND", "Delivery was not found.");
    const rows = await transaction.outboundDeliveryAttempt.findMany({
      where: {
        deliveryId: input.deliveryId,
        ...(cursor ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.pageSize + 1,
    });
    const visible = rows.slice(0, input.pageSize);
    const next = rows.length > input.pageSize ? visible.at(-1) : null;
    return {
      items: visible.map((attempt): AttemptSummaryDto => ({
        kind: "ATTEMPT_SUMMARY",
        id: attempt.id,
        deliveryId: attempt.deliveryId,
        attemptNumber: attempt.attemptNumber,
        outcome: attempt.outcome,
        providerName: attempt.providerName,
        safeProviderCode: attempt.safeProviderCode,
        retryable: attempt.retryable,
        startedAt: attempt.startedAt.toISOString(),
        finishedAt: attempt.finishedAt?.toISOString() ?? null,
        nextAttemptAt: attempt.nextAttemptAt?.toISOString() ?? null,
      })),
      nextCursor: next ? encodeCursor(next.createdAt, next.id) : null,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function searchCommunicationTargets(
  context: CommunicationAdminContext,
  rawInput: unknown,
): Promise<Array<{ id: string; label: string; kind: "USER" | "BUSINESS" }>> {
  const input = parseOrValidationError(targetSearchSchema, rawInput);
  return prisma.$transaction(async (transaction) => {
    await assertCommunicationAdminCurrent(transaction, context, "NOTIFICATIONS_SEND");
    if (input.kind === "USER") {
      const rows = await transaction.person.findMany({
        where: {
          deletedAt: null,
          isOnboarded: true,
          status: "ACTIVE",
          OR: [
            ...(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.query) ? [{ id: input.query }] : []),
            { displayName: { contains: input.query, mode: "insensitive" } },
            { firstName: { contains: input.query, mode: "insensitive" } },
            { lastName: { contains: input.query, mode: "insensitive" } },
          ],
        },
        select: { id: true, displayName: true, firstName: true, lastName: true },
        orderBy: [{ firstName: "asc" }, { id: "asc" }],
        take: input.limit,
      });
      return rows.map((row) => ({
        id: row.id,
        kind: "USER" as const,
        label: row.displayName ?? [row.firstName, row.lastName].filter(Boolean).join(" "),
      }));
    }
    const rows = await transaction.organization.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        status: "ACTIVE",
        OR: [
          ...(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.query) ? [{ id: input.query }] : []),
          { name: { contains: input.query, mode: "insensitive" } },
          { slug: { contains: input.query, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: input.limit,
    });
    return rows.map((row) => ({ id: row.id, kind: "BUSINESS" as const, label: row.name }));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
