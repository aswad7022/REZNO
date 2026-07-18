import "server-only";

import { randomUUID } from "node:crypto";

import {
  Prisma,
  type CommunicationCampaign,
  type CommunicationCampaignStatus,
  type OutboundDeliveryStatus,
} from "@prisma/client";
import { z } from "zod";

import type {
  AudiencePreviewDto,
  CampaignDetailDto,
  CampaignPageDto,
  CampaignSummaryDto,
  DeliveryCounters,
} from "@/features/communications/domain/contracts";
import { communicationError } from "@/features/communications/domain/errors";
import {
  communicationAdminCursorScope,
  communicationCursorFilterFingerprint,
  decodeCampaignCursor,
  encodeCampaignCursor,
} from "@/features/communications/domain/cursor";
import {
  assertCampaignEditable,
  assertScheduleAllowed,
  communicationRequestHash,
  countersFromGroups,
  createCampaignSchema,
  emptyDeliveryCounters,
  listCampaignsSchema,
  localizedContentSchema,
  parseOrValidationError,
  previewAudienceSchema,
  scheduleCampaignSchema,
  updateCampaignSchema,
  cancelCampaignSchema,
} from "@/features/communications/domain/validation";
import {
  assertCommunicationAdminCurrent,
  type CommunicationAdminContext,
} from "@/features/communications/services/admin-actor";
import { previewAudience as evaluatePreview } from "@/features/communications/services/audience";
import { communicationSerializable } from "@/features/communications/services/transaction";
import { prisma } from "@/lib/db/prisma";

const CAMPAIGN_TARGET_TYPE = "CommunicationCampaign";

export async function createCampaign(
  context: CommunicationAdminContext,
  rawInput: unknown,
): Promise<CampaignSummaryDto> {
  const input = parseOrValidationError(createCampaignSchema, rawInput);
  const requestHash = communicationRequestHash({
    action: "COMMUNICATION_CAMPAIGN_CREATE",
    actor: context.userId,
    definition: campaignDefinitionForHash(input),
    expectedVersion: 0,
  });

  return communicationSerializable(async (transaction) => {
    const currentContext = await assertCommunicationAdminCurrent(
      transaction,
      context,
      "NOTIFICATIONS_SEND",
    );
    await lockCampaignMutationKey(transaction, currentContext.userId, input.idempotencyKey);
    const replay = await mutationReplay(
      transaction,
      currentContext,
      input.idempotencyKey,
      "COMMUNICATION_CAMPAIGN_CREATE",
      requestHash,
    );
    if (replay) return replay;

    const campaign = await transaction.communicationCampaign.create({
      data: {
        id: randomUUID(),
        createdByAdminUserId: currentContext.userId,
        updatedByAdminUserId: currentContext.userId,
        ...campaignDefinitionData(input),
      },
    });
    const result = campaignSummary(campaign, emptyDeliveryCounters());
    await recordCampaignMutation(transaction, {
      action: "COMMUNICATION_CAMPAIGN_CREATE",
      afterStatus: campaign.status,
      beforeStatus: null,
      campaign,
      context: currentContext,
      expectedVersion: 0,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result,
    });
    return result;
  });
}

export async function updateCampaign(
  context: CommunicationAdminContext,
  rawInput: unknown,
): Promise<CampaignSummaryDto> {
  const input = parseOrValidationError(updateCampaignSchema, rawInput);
  const requestHash = communicationRequestHash({
    action: "COMMUNICATION_CAMPAIGN_UPDATE",
    actor: context.userId,
    campaignId: input.campaignId,
    definition: campaignDefinitionForHash(input),
    expectedVersion: input.expectedVersion,
  });
  return mutateExistingCampaign({
    action: "COMMUNICATION_CAMPAIGN_UPDATE",
    context,
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    campaignId: input.campaignId,
    requestHash,
    mutate: async (transaction, campaign, currentContext) => {
      assertCampaignEditable(campaign.status);
      return transaction.communicationCampaign.update({
        where: { id: campaign.id },
        data: {
          ...campaignDefinitionData(input),
          updatedByAdminUserId: currentContext.userId,
          version: { increment: 1 },
        },
      });
    },
  });
}

export async function scheduleCampaign(
  context: CommunicationAdminContext,
  rawInput: unknown,
  now = new Date(),
): Promise<CampaignSummaryDto> {
  const input = parseOrValidationError(scheduleCampaignSchema, rawInput);
  const scheduledAt = assertScheduleAllowed(input.scheduledAt, now);
  const requestHash = communicationRequestHash({
    action: "COMMUNICATION_CAMPAIGN_SCHEDULE",
    actor: context.userId,
    campaignId: input.campaignId,
    expectedVersion: input.expectedVersion,
    scheduledAt: scheduledAt.toISOString(),
  });
  return mutateExistingCampaign({
    action: "COMMUNICATION_CAMPAIGN_SCHEDULE",
    context,
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    campaignId: input.campaignId,
    requestHash,
    mutate: async (transaction, campaign, currentContext) => {
      assertCampaignEditable(campaign.status);
      return transaction.communicationCampaign.update({
        where: { id: campaign.id },
        data: {
          scheduledAt,
          status: "SCHEDULED",
          updatedByAdminUserId: currentContext.userId,
          version: { increment: 1 },
        },
      });
    },
  });
}

export async function cancelCampaign(
  context: CommunicationAdminContext,
  rawInput: unknown,
  now = new Date(),
): Promise<CampaignSummaryDto> {
  const input = parseOrValidationError(cancelCampaignSchema, rawInput);
  const requestHash = communicationRequestHash({
    action: "COMMUNICATION_CAMPAIGN_CANCEL",
    actor: context.userId,
    campaignId: input.campaignId,
    expectedVersion: input.expectedVersion,
    reason: input.reason,
  });
  return mutateExistingCampaign({
    action: "COMMUNICATION_CAMPAIGN_CANCEL",
    context,
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    campaignId: input.campaignId,
    requestHash,
    mutate: async (transaction, campaign, currentContext) => {
      if (campaign.status === "CANCELLED") {
        communicationError("CAMPAIGN_CANCELLED", "The campaign is already cancelled.");
      }
      if (["COMPLETED", "PARTIAL_FAILURE", "FAILED"].includes(campaign.status)) {
        communicationError("CAMPAIGN_NOT_EDITABLE", "A terminal campaign cannot be cancelled.");
      }
      await transaction.outboundDelivery.updateMany({
        where: {
          campaignId: campaign.id,
          status: { in: ["PENDING", "RETRY_SCHEDULED"] },
        },
        data: {
          status: "CANCELLED",
          claimOwner: null,
          claimedAt: null,
          claimExpiresAt: null,
          nextAttemptAt: null,
        },
      });
      return transaction.communicationCampaign.update({
        where: { id: campaign.id },
        data: {
          cancelledAt: now,
          cancellationReason: input.reason,
          status: "CANCELLED",
          updatedByAdminUserId: currentContext.userId,
          version: { increment: 1 },
        },
      });
    },
  });
}

export async function getCampaignPage(
  context: CommunicationAdminContext,
  rawInput: unknown,
): Promise<CampaignPageDto> {
  const input = parseOrValidationError(listCampaignsSchema, rawInput);
  return prisma.$transaction(async (transaction) => {
    const currentContext = await assertCommunicationAdminCurrent(transaction, context, "NOTIFICATIONS_VIEW");
    const [{ authoritativeNow }] = await transaction.$queryRaw<Array<{ authoritativeNow: Date }>>(Prisma.sql`
      SELECT CURRENT_TIMESTAMP AS "authoritativeNow"
    `);
    if (!authoritativeNow) throw new Error("Communication snapshot time is unavailable.");
    const adminScope = communicationAdminCursorScope(currentContext);
    const filterFingerprint = communicationCursorFilterFingerprint({ status: input.status });
    const cursor = input.cursor ? decodeCampaignCursor(input.cursor, {
      adminScope,
      filterFingerprint,
      pageSize: input.pageSize,
    }, authoritativeNow) : null;
    const snapshot = cursor?.snapshotDate ?? authoritativeNow;
    const campaigns = await transaction.communicationCampaign.findMany({
      where: {
        ...(input.status ? { status: input.status } : {}),
        createdAt: { lte: snapshot },
        ...(cursor ? {
          OR: [
            { createdAt: { lt: cursor.sortDate } },
            { createdAt: cursor.sortDate, id: { lt: cursor.tieBreakerId } },
          ],
        } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.pageSize + 1,
    });
    const visible = campaigns.slice(0, input.pageSize);
    const counters = await deliveryCountersForCampaigns(transaction, visible.map((campaign) => campaign.id));
    const next = campaigns.length > input.pageSize ? visible.at(-1) : null;
    return {
      items: visible.map((campaign) => campaignSummary(
        campaign,
        counters.get(campaign.id) ?? emptyDeliveryCounters(),
      )),
      nextCursor: next ? encodeCampaignCursor({
        adminScope,
        filterFingerprint,
        pageSize: input.pageSize,
        snapshot,
        sortTimestamp: next.createdAt,
        tieBreakerId: next.id,
      }) : null,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function getCampaignDetail(
  context: CommunicationAdminContext,
  campaignId: string,
): Promise<CampaignDetailDto> {
  if (!z.uuid().safeParse(campaignId).success) communicationError("NOT_FOUND", "Campaign was not found.");
  return prisma.$transaction(async (transaction) => {
    await assertCommunicationAdminCurrent(transaction, context, "NOTIFICATIONS_VIEW");
    const campaign = await transaction.communicationCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) communicationError("NOT_FOUND", "Campaign was not found.");
    const counters = await deliveryCountersForCampaigns(transaction, [campaign.id]);
    return campaignDetail(campaign, counters.get(campaign.id) ?? emptyDeliveryCounters());
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function previewCampaignAudience(
  context: CommunicationAdminContext,
  rawInput: unknown,
): Promise<AudiencePreviewDto> {
  const input = parseOrValidationError(previewAudienceSchema, rawInput);
  return prisma.$transaction(async (transaction) => {
    await assertCommunicationAdminCurrent(transaction, context, "NOTIFICATIONS_SEND");
    return evaluatePreview(transaction, input);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function deliveryCountersForCampaigns(
  transaction: Prisma.TransactionClient,
  campaignIds: string[],
): Promise<Map<string, DeliveryCounters>> {
  if (campaignIds.length === 0) return new Map();
  const groups = await transaction.outboundDelivery.groupBy({
    by: ["campaignId", "status"],
    where: { campaignId: { in: campaignIds } },
    _count: { _all: true },
  });
  const byCampaign = new Map<string, Array<{ status: OutboundDeliveryStatus; _count: { _all: number } }>>();
  for (const group of groups) {
    const current = byCampaign.get(group.campaignId) ?? [];
    current.push({ status: group.status, _count: group._count });
    byCampaign.set(group.campaignId, current);
  }
  return new Map(Array.from(byCampaign, ([campaignId, values]) => [campaignId, countersFromGroups(values)]));
}

export async function recordCampaignMutation(
  transaction: Prisma.TransactionClient,
  input: {
    action: string;
    beforeStatus: CommunicationCampaignStatus | null;
    afterStatus: CommunicationCampaignStatus;
    campaign: CommunicationCampaign;
    context: CommunicationAdminContext;
    expectedVersion: number;
    idempotencyKey: string;
    requestHash: string;
    result: CampaignSummaryDto;
  },
) {
  const safeResult = input.result as unknown as Prisma.InputJsonValue;
  await transaction.communicationCampaignMutation.create({
    data: {
      action: input.action,
      adminUserId: input.context.userId,
      campaignId: input.campaign.id,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      result: safeResult,
      resultVersion: input.campaign.version,
    },
  });
  await transaction.adminAuditLog.create({
    data: {
      action: input.action,
      adminUserId: input.context.userId,
      idempotencyKey: input.idempotencyKey,
      metadata: {
        actorSource: input.context.source,
        adminAccessId: input.context.adminAccessId,
        statusBefore: input.beforeStatus,
        statusAfter: input.afterStatus,
        audience: input.campaign.audience,
        channels: input.campaign.channels,
        schedule: input.campaign.scheduledAt?.toISOString() ?? null,
        targetPersonId: input.campaign.targetPersonId,
        targetOrganizationId: input.campaign.targetOrganizationId,
        destinationKind: input.campaign.destinationKind,
        version: input.campaign.version,
      },
      requestHash: input.requestHash,
      result: safeResult,
      resultVersion: input.campaign.updatedAt,
      targetId: input.campaign.id,
      targetType: CAMPAIGN_TARGET_TYPE,
    },
  });
}

export async function mutationReplay(
  transaction: Prisma.TransactionClient,
  context: CommunicationAdminContext,
  idempotencyKey: string,
  action: string,
  requestHash: string,
): Promise<CampaignSummaryDto | null> {
  const existing = await transaction.communicationCampaignMutation.findUnique({
    where: { adminUserId_idempotencyKey: { adminUserId: context.userId, idempotencyKey } },
  });
  if (!existing) return null;
  if (existing.action !== action || existing.requestHash !== requestHash) {
    communicationError("IDEMPOTENCY_CONFLICT", "The Admin idempotency key was reused.");
  }
  return parseCampaignSummary(existing.result);
}

export async function lockCampaignMutationKey(
  transaction: Prisma.TransactionClient,
  actorId: string,
  idempotencyKey: string,
) {
  await transaction.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`communications:${actorId}:${idempotencyKey}`}, 0)
    ) IS NULL AS "acquired"
  `);
}

type ExistingMutationInput = {
  action: string;
  context: CommunicationAdminContext;
  expectedVersion: number;
  idempotencyKey: string;
  campaignId: string;
  requestHash: string;
  mutate: (
    transaction: Prisma.TransactionClient,
    campaign: CommunicationCampaign,
    context: CommunicationAdminContext,
  ) => Promise<CommunicationCampaign>;
};

async function mutateExistingCampaign(input: ExistingMutationInput): Promise<CampaignSummaryDto> {
  return communicationSerializable(async (transaction) => {
    const currentContext = await assertCommunicationAdminCurrent(
      transaction,
      input.context,
      "NOTIFICATIONS_SEND",
    );
    await lockCampaignMutationKey(transaction, currentContext.userId, input.idempotencyKey);
    const replay = await mutationReplay(
      transaction,
      currentContext,
      input.idempotencyKey,
      input.action,
      input.requestHash,
    );
    if (replay) return replay;

    await transaction.$queryRaw(Prisma.sql`
      SELECT campaign."id"
      FROM "CommunicationCampaign" AS campaign
      WHERE campaign."id" = ${input.campaignId}::uuid
      FOR UPDATE OF campaign
    `);
    const campaign = await transaction.communicationCampaign.findUnique({ where: { id: input.campaignId } });
    if (!campaign) communicationError("NOT_FOUND", "Campaign was not found.");
    if (campaign.version !== input.expectedVersion) {
      communicationError("STALE_VERSION", "Campaign changed. Refresh and retry.");
    }
    const updated = await input.mutate(transaction, campaign, currentContext);
    const counters = await deliveryCountersForCampaigns(transaction, [campaign.id]);
    const result = campaignSummary(updated, counters.get(campaign.id) ?? emptyDeliveryCounters());
    await recordCampaignMutation(transaction, {
      action: input.action,
      afterStatus: updated.status,
      beforeStatus: campaign.status,
      campaign: updated,
      context: currentContext,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      result,
    });
    return result;
  });
}

function campaignDefinitionData(input: {
  audience: CommunicationCampaign["audience"];
  targetPersonId: string | null;
  targetOrganizationId: string | null;
  channels: CommunicationCampaign["channels"];
  category: CommunicationCampaign["category"];
  priority: CommunicationCampaign["priority"];
  mandatory: boolean;
  destinationKind: CommunicationCampaign["destinationKind"];
  destinationTargetId: null;
  localizedContent: unknown;
}) {
  return {
    audience: input.audience,
    targetPersonId: input.targetPersonId,
    targetOrganizationId: input.targetOrganizationId,
    channels: input.channels,
    category: input.category,
    priority: input.priority,
    mandatory: input.mandatory,
    destinationKind: input.destinationKind,
    destinationTargetId: input.destinationTargetId,
    localizedContent: input.localizedContent as Prisma.InputJsonValue,
  };
}

function campaignDefinitionForHash(input: Parameters<typeof campaignDefinitionData>[0]) {
  return {
    audience: input.audience,
    targetPersonId: input.targetPersonId,
    targetOrganizationId: input.targetOrganizationId,
    channels: [...input.channels].sort(),
    category: input.category,
    priority: input.priority,
    mandatory: input.mandatory,
    destinationKind: input.destinationKind,
    destinationTargetId: input.destinationTargetId,
    localizedContent: input.localizedContent,
  };
}

function campaignSummary(
  campaign: CommunicationCampaign,
  counts: DeliveryCounters,
): CampaignSummaryDto {
  return {
    kind: "CAMPAIGN_SUMMARY",
    id: campaign.id,
    version: campaign.version,
    status: campaign.status,
    audience: campaign.audience,
    channels: campaign.channels,
    category: campaign.category,
    priority: campaign.priority,
    mandatory: campaign.mandatory,
    scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
    counts,
  };
}

function campaignDetail(
  campaign: CommunicationCampaign,
  counts: DeliveryCounters,
): CampaignDetailDto {
  return {
    ...campaignSummary(campaign, counts),
    kind: "CAMPAIGN_DETAIL",
    targetPersonId: campaign.targetPersonId,
    targetOrganizationId: campaign.targetOrganizationId,
    destinationKind: campaign.destinationKind,
    destinationTargetId: null,
    localizedContent: parseOrValidationError(localizedContentSchema, campaign.localizedContent),
    recipientEvaluationAt: campaign.recipientEvaluationAt?.toISOString() ?? null,
    dispatchStartedAt: campaign.dispatchStartedAt?.toISOString() ?? null,
    completedAt: campaign.completedAt?.toISOString() ?? null,
    cancelledAt: campaign.cancelledAt?.toISOString() ?? null,
    cancellationReason: campaign.cancellationReason,
    inAppNotificationId: campaign.inAppNotificationId,
  };
}

function parseCampaignSummary(value: Prisma.JsonValue): CampaignSummaryDto {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    communicationError("IDEMPOTENCY_CONFLICT", "The original campaign result is unavailable.");
  }
  const result = value as Record<string, Prisma.JsonValue>;
  if (result.kind !== "CAMPAIGN_SUMMARY" || typeof result.id !== "string" || typeof result.version !== "number") {
    communicationError("IDEMPOTENCY_CONFLICT", "The original campaign result is invalid.");
  }
  return value as unknown as CampaignSummaryDto;
}
