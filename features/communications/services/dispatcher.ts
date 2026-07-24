import "server-only";

import { randomUUID } from "node:crypto";

import {
  Prisma,
  type CommunicationCampaign,
  type NotificationCategory,
  type OutboundDelivery,
} from "@prisma/client";

import {
  outboundChannels,
  type CampaignLocalizedContent,
  type CampaignSummaryDto,
  type DispatchResultDto,
  type OutboundChannel,
} from "@/features/communications/domain/contracts";
import {
  CommunicationOperationRetryableError,
  communicationError,
} from "@/features/communications/domain/errors";
import {
  campaignFinalStatus,
  communicationRequestHash,
  countersFromGroups,
  emptyDeliveryCounters,
  manualDispatchSchema,
  parseOrValidationError,
  retryDelayMilliseconds,
  safeEmailHtml,
  sendCampaignSchema,
} from "@/features/communications/domain/validation";
import {
  resolveOutboundProvider,
  type ProviderSendResult,
  type SafeProviderMessage,
} from "@/features/communications/providers/provider";
import {
  assertCommunicationAdminCurrent,
  type CommunicationAdminContext,
} from "@/features/communications/services/admin-actor";
import {
  assertAudienceWithinLimit,
  type EvaluatedRecipient,
} from "@/features/communications/services/audience";
import {
  lockCampaignMutationKey,
  mutationReplay,
  recordCampaignMutation,
} from "@/features/communications/services/campaigns";
import {
  resolvePersonEndpoint,
  resolvePersonEndpointsBulk,
  type ResolvedEndpoint,
} from "@/features/communications/services/endpoints";
import { communicationSerializable } from "@/features/communications/services/transaction";
import { createCanonicalNotifications } from "@/features/notifications/services/producer";
import { notificationEventKey } from "@/features/notifications/domain/contracts";
import { prisma } from "@/lib/db/prisma";

const CLAIM_LEASE_MS = 5 * 60_000;
export const DELIVERY_INSERT_CHUNK_SIZE = 1_000;

type DeliveryAutomationTestPhase =
  | "AFTER_CLAIM_BEFORE_ATTEMPT"
  | "AFTER_ATTEMPT_BEFORE_PROVIDER"
  | "AFTER_PROVIDER_BEFORE_FINALIZE";

type DeliveryAutomationTestHook = (event: {
  deliveryId: string;
  phase: DeliveryAutomationTestPhase;
}) => Promise<void> | void;

let deliveryAutomationTestHook: DeliveryAutomationTestHook | undefined;

export function setDeliveryAutomationTestHook(
  hook: DeliveryAutomationTestHook | undefined,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Delivery automation test hooks are unavailable in production.");
  }
  deliveryAutomationTestHook = hook;
}

export type SnapshotDiagnostics = {
  deliveryInsertChunkCount: number;
  deliveryRowCount: number;
  elapsedMs: number;
  endpointQueryCount: number;
  recipientCount: number;
  selectedChannels: OutboundChannel[];
};

type SnapshotDiagnosticsTestHook = (diagnostics: SnapshotDiagnostics) => Promise<void> | void;
let snapshotDiagnosticsTestHook: SnapshotDiagnosticsTestHook | undefined;
export type CommunicationExecutionGuard = (
  transaction: Prisma.TransactionClient,
) => Promise<void>;

export function setCommunicationSnapshotDiagnosticsTestHook(
  hook: SnapshotDiagnosticsTestHook | undefined,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Communication snapshot diagnostics hooks are unavailable in production.");
  }
  snapshotDiagnosticsTestHook = hook;
}

export async function sendCampaignNow(
  context: CommunicationAdminContext,
  rawInput: unknown,
  now = new Date(),
  executionGuard?: CommunicationExecutionGuard,
): Promise<CampaignSummaryDto> {
  const input = parseOrValidationError(sendCampaignSchema, rawInput);
  const requestHash = communicationRequestHash({
    action: "COMMUNICATION_CAMPAIGN_SEND_NOW",
    actor: context.userId,
    campaignId: input.campaignId,
    expectedVersion: input.expectedVersion,
  });
  return communicationSerializable(async (transaction) => {
    const currentContext = await assertCommunicationAdminCurrent(
      transaction,
      context,
      "NOTIFICATIONS_SEND",
    );
    await executionGuard?.(transaction);
    await lockCampaignMutationKey(transaction, currentContext.userId, input.idempotencyKey);
    const replay = await mutationReplay(
      transaction,
      currentContext,
      input.idempotencyKey,
      "COMMUNICATION_CAMPAIGN_SEND_NOW",
      requestHash,
    );
    if (replay) return replay;
    const campaign = await lockCampaign(transaction, input.campaignId);
    if (campaign.version !== input.expectedVersion) {
      communicationError("STALE_VERSION", "Campaign changed. Refresh and retry.");
    }
    if (campaign.status === "CANCELLED") communicationError("CAMPAIGN_CANCELLED", "Campaign is cancelled.");
    if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") {
      communicationError("CAMPAIGN_NOT_EDITABLE", "Campaign dispatch already started.");
    }
    return enqueueCampaign(transaction, {
      action: "COMMUNICATION_CAMPAIGN_SEND_NOW",
      campaign,
      context: currentContext,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      now,
      requestHash,
      executionGuard,
    });
  });
}

export async function manuallyDispatchDue(
  context: CommunicationAdminContext,
  rawInput: unknown,
  now = new Date(),
): Promise<DispatchResultDto> {
  const input = parseOrValidationError(manualDispatchSchema, rawInput);
  const requestHash = communicationRequestHash({
    action: "COMMUNICATIONS_MANUAL_DISPATCH",
    actor: context.userId,
    batchSize: input.batchSize,
    claimOwner: input.claimOwner,
  });

  const prepared = await communicationSerializable(async (transaction) => {
    const currentContext = await assertCommunicationAdminCurrent(
      transaction,
      context,
      "COMMUNICATIONS_DISPATCH",
    );
    await lockCampaignMutationKey(transaction, currentContext.userId, input.idempotencyKey);
    const existing = await transaction.adminAuditLog.findUnique({
      where: {
        adminUserId_idempotencyKey: {
          adminUserId: currentContext.userId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) {
      if (existing.action !== "COMMUNICATIONS_MANUAL_DISPATCH" || existing.requestHash !== requestHash) {
        communicationError("IDEMPOTENCY_CONFLICT", "The manual dispatch idempotency key was reused.");
      }
      const result = dispatchResultFromAudit(existing.result);
      if (!result) {
        communicationError("RATE_LIMITED", "The original manual dispatch is still running.");
      }
      return { replay: true as const, result };
    }

    const due = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT campaign."id"
      FROM "CommunicationCampaign" AS campaign
      WHERE campaign."status" = 'SCHEDULED'
        AND campaign."scheduledAt" <= ${now}
      ORDER BY campaign."scheduledAt", campaign."id"
      FOR UPDATE SKIP LOCKED
      LIMIT 10
    `);
    let campaignsStarted = 0;
    for (const item of due) {
      const campaign = await transaction.communicationCampaign.findUnique({ where: { id: item.id } });
      if (!campaign || campaign.status !== "SCHEDULED") continue;
      const mutationKey = randomUUID();
      await enqueueCampaign(transaction, {
        action: "COMMUNICATION_CAMPAIGN_DUE_DISPATCH",
        campaign,
        context: currentContext,
        expectedVersion: campaign.version,
        idempotencyKey: mutationKey,
        now,
        requestHash: communicationRequestHash({
          action: "COMMUNICATION_CAMPAIGN_DUE_DISPATCH",
          campaignId: campaign.id,
          manualDispatchIdempotencyKey: input.idempotencyKey,
          version: campaign.version,
        }),
      });
      campaignsStarted += 1;
    }
    const safeResult = {
      kind: "DISPATCH_PREPARED",
      campaignsStarted,
      claimOwner: input.claimOwner,
      batchSize: input.batchSize,
    };
    const audit = await transaction.adminAuditLog.create({
      data: {
        action: "COMMUNICATIONS_MANUAL_DISPATCH",
        adminUserId: currentContext.userId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        result: safeResult,
        resultVersion: now,
        targetType: "CommunicationDispatcher",
        metadata: {
          actorSource: currentContext.source,
          adminAccessId: currentContext.adminAccessId,
          campaignsStarted,
          batchSize: input.batchSize,
        },
      },
      select: { id: true },
    });
    return { replay: false as const, auditId: audit.id, campaignsStarted };
  });

  if (prepared.replay) {
    return prepared.result;
  }
  await releaseExpiredClaims(now);
  const claimed = await claimDueDeliveries(input.claimOwner, input.batchSize, now);
  const processed = await processClaimedDeliveries(input.claimOwner, claimed, now);
  const result = {
    ...processed,
    campaignsStarted: prepared.campaignsStarted,
    deliveriesClaimed: claimed.length,
  };
  await communicationSerializable(async (transaction) => {
    await transaction.adminAuditLog.update({
      where: { id: prepared.auditId },
      data: {
        result: result as unknown as Prisma.InputJsonValue,
        resultVersion: new Date(),
      },
    });
  });
  return result;
}

export async function claimDueDeliveries(
  claimOwner: string,
  batchSize: number,
  now = new Date(),
): Promise<string[]> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{7,99}$/.test(claimOwner) || batchSize < 1 || batchSize > 50) {
    communicationError("VALIDATION_ERROR", "Delivery claim input is invalid.");
  }
  const claimExpiresAt = new Date(now.getTime() + CLAIM_LEASE_MS);
  return prisma.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH due AS (
        SELECT delivery."id"
        FROM "OutboundDelivery" AS delivery
        JOIN "CommunicationCampaign" AS campaign ON campaign."id" = delivery."campaignId"
        WHERE delivery."status" IN ('PENDING', 'RETRY_SCHEDULED')
          AND (delivery."nextAttemptAt" IS NULL OR delivery."nextAttemptAt" <= ${now})
          AND campaign."status" = 'DISPATCHING'
        ORDER BY delivery."nextAttemptAt" NULLS FIRST, delivery."id"
        FOR UPDATE OF delivery SKIP LOCKED
        LIMIT ${batchSize}
      )
      UPDATE "OutboundDelivery" AS delivery
      SET "status" = 'CLAIMED',
          "claimedAt" = ${now},
          "claimOwner" = ${claimOwner},
          "claimExpiresAt" = ${claimExpiresAt},
          "version" = delivery."version" + 1,
          "updatedAt" = ${now}
      FROM due
      WHERE delivery."id" = due."id"
      RETURNING delivery."id"
    `);
    return rows.map((row) => row.id);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function claimExactDeliveryForAutomation(input: {
  claimOwner: string;
  deliveryId: string;
  executionGuard: CommunicationExecutionGuard;
  expectedVersion: number;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const claimExpiresAt = new Date(now.getTime() + CLAIM_LEASE_MS);
  return prisma.$transaction(async (transaction) => {
    await input.executionGuard(transaction);
    const claimed = await transaction.$executeRaw(Prisma.sql`
      UPDATE "OutboundDelivery" AS delivery
      SET "status" = 'CLAIMED',
          "claimedAt" = ${now},
          "claimOwner" = ${input.claimOwner},
          "claimExpiresAt" = ${claimExpiresAt},
          "version" = delivery."version" + 1,
          "updatedAt" = ${now}
      FROM "CommunicationCampaign" AS campaign
      WHERE delivery."id" = ${input.deliveryId}::uuid
        AND delivery."version" = ${input.expectedVersion}
        AND delivery."campaignId" = campaign."id"
        AND delivery."status" IN ('PENDING', 'RETRY_SCHEDULED')
        AND (delivery."nextAttemptAt" IS NULL OR delivery."nextAttemptAt" <= ${now})
        AND campaign."status" = 'DISPATCHING'
    `);
    return claimed === 1;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function processExactDeliveryForAutomation(input: {
  claimOwner: string;
  deliveryId: string;
  executionGuard: CommunicationExecutionGuard;
  expectedVersion: number;
}) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{7,99}$/.test(input.claimOwner)) {
    communicationError("VALIDATION_ERROR", "Delivery claim input is invalid.");
  }
  const prepared = await prisma.$transaction(async (transaction) => {
    await input.executionGuard(transaction);
    await lockOutboundDelivery(transaction, input.deliveryId);
    const delivery = await transaction.outboundDelivery.findUnique({
      where: { id: input.deliveryId },
      include: {
        attempts: {
          where: { finishedAt: null },
          orderBy: [{ attemptNumber: "asc" }, { id: "asc" }],
          take: 2,
        },
        campaign: true,
      },
    });
    if (!delivery) return { kind: "ABSENT" as const };
    if (delivery.attempts.length > 1) {
      communicationError(
        "STALE_VERSION",
        "Delivery has multiple unfinished provider attempts.",
      );
    }
    if (terminalDeliveryStatus(delivery.status)) {
      return {
        kind: "TERMINAL" as const,
        outcome: "SUPERSEDED" as const,
        state: delivery.status,
      };
    }
    const now = await communicationDatabaseNow(transaction);
    if (delivery.campaign.status !== "DISPATCHING") {
      await suppressClaimedDelivery(
        transaction,
        delivery,
        delivery.campaign.status === "CANCELLED"
          ? "CAMPAIGN_CANCELLED"
          : "CAMPAIGN_NOT_DISPATCHING",
        now,
        "CANCELLED",
      );
      return {
        kind: "TERMINAL" as const,
        outcome: "COMPLETED" as const,
        state: "CANCELLED" as const,
      };
    }
    if (delivery.status === "CLAIMED") {
      const ownUnfinishedAttempt = delivery.attempts.some(
        (attempt) => attempt.claimOwner === input.claimOwner,
      );
      const ownClaim =
        delivery.claimOwner === input.claimOwner || ownUnfinishedAttempt;
      if (delivery.claimExpiresAt && delivery.claimExpiresAt > now) {
        return {
          kind: "RETRYABLE" as const,
          retryAfterSeconds: boundedDeliveryClaimRetrySeconds(
            now,
            delivery.claimExpiresAt,
          ),
          state: ownClaim ? "CLAIMED_BY_EXACT_JOB" : "CLAIMED_BY_OTHER_JOB",
        };
      }
      const claimExpiresAt = new Date(now.getTime() + CLAIM_LEASE_MS);
      const reclaimed = await transaction.outboundDelivery.update({
        where: { id: delivery.id },
        data: {
          claimedAt: now,
          claimExpiresAt,
          claimOwner: input.claimOwner,
          version: { increment: 1 },
        },
      });
      if (delivery.attempts[0]) {
        await transaction.outboundDeliveryAttempt.update({
          where: { id: delivery.attempts[0].id },
          data: { claimOwner: input.claimOwner },
        });
      }
      return {
        claimGeneration: reclaimed.version,
        kind: "CLAIMED" as const,
        recovered: true,
      };
    }
    if (delivery.version !== input.expectedVersion) {
      return {
        kind: "TERMINAL" as const,
        outcome: "STALE" as const,
        state: delivery.status,
      };
    }
    if (
      !["PENDING", "RETRY_SCHEDULED"].includes(delivery.status)
      || (delivery.nextAttemptAt && delivery.nextAttemptAt > now)
    ) {
      return {
        kind: "TERMINAL" as const,
        outcome: "INELIGIBLE" as const,
        state: delivery.status,
      };
    }
    const claimed = await transaction.outboundDelivery.update({
      where: { id: delivery.id },
      data: {
        claimedAt: now,
        claimExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS),
        claimOwner: input.claimOwner,
        status: "CLAIMED",
        version: { increment: 1 },
      },
    });
    return {
      claimGeneration: claimed.version,
      kind: "CLAIMED" as const,
      recovered: false,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (prepared.kind === "ABSENT") {
    return { outcome: "ABSENT" as const, state: "ABSENT" as const };
  }
  if (prepared.kind === "TERMINAL") {
    return { outcome: prepared.outcome, state: prepared.state };
  }
  if (prepared.kind === "RETRYABLE") {
    throw new CommunicationOperationRetryableError(
      prepared.retryAfterSeconds,
      prepared.state,
    );
  }

  await deliveryAutomationTestHook?.({
    deliveryId: input.deliveryId,
    phase: "AFTER_CLAIM_BEFORE_ATTEMPT",
  });
  let providerPreparation: Awaited<ReturnType<typeof prepareProviderMessage>>;
  try {
    providerPreparation = await prepareProviderMessage(
      input.deliveryId,
      input.claimOwner,
      new Date(),
      input.executionGuard,
      prepared.claimGeneration,
    );
  } catch (error) {
    await recoverDeliveryAfterInterruption(
      input.deliveryId,
      input.claimOwner,
      prepared.claimGeneration,
      "AUTHORITY_OR_PREPARATION_INTERRUPTED",
    );
    throw error;
  }
  if (!providerPreparation) {
    const current = await prisma.outboundDelivery.findUnique({
      where: { id: input.deliveryId },
      select: { status: true },
    });
    return {
      outcome: "COMPLETED" as const,
      state: current?.status ?? "ABSENT",
    };
  }
  await deliveryAutomationTestHook?.({
    deliveryId: input.deliveryId,
    phase: "AFTER_ATTEMPT_BEFORE_PROVIDER",
  });
  try {
    await prisma.$transaction(
      (transaction) => input.executionGuard(transaction),
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  } catch (error) {
    await recoverDeliveryAfterInterruption(
      input.deliveryId,
      input.claimOwner,
      providerPreparation.claimGeneration,
      "AUTHORITY_REVOKED",
    );
    throw error;
  }
  const provider = resolveOutboundProvider(providerPreparation.message.channel);
  let providerResult: ProviderSendResult;
  try {
    providerResult = sanitizeProviderResult(
      await provider.send(providerPreparation.message),
    );
  } catch {
    providerResult = {
      outcome: "TRANSIENT_FAILURE",
      providerName: "provider-adapter",
      providerMessageId: null,
      retryable: true,
      safeCode: "PROVIDER_EXCEPTION",
    };
  }
  await deliveryAutomationTestHook?.({
    deliveryId: input.deliveryId,
    phase: "AFTER_PROVIDER_BEFORE_FINALIZE",
  });
  let state: "ACCEPTED" | "RETRY_SCHEDULED" | "PERMANENT_FAILURE";
  try {
    state = await finalizeProviderAttempt({
      attemptId: providerPreparation.attemptId,
      claimGeneration: providerPreparation.claimGeneration,
      claimOwner: input.claimOwner,
      deliveryId: input.deliveryId,
      executionGuard: input.executionGuard,
      now: new Date(),
      providerResult,
    });
  } catch (error) {
    await recoverDeliveryAfterInterruption(
      input.deliveryId,
      input.claimOwner,
      providerPreparation.claimGeneration,
      "PROVIDER_RESULT_UNAPPLIED",
    );
    throw error;
  }
  return { outcome: "COMPLETED" as const, state };
}

export async function releaseExpiredClaims(
  now = new Date(),
  executionGuard?: CommunicationExecutionGuard,
): Promise<number> {
  return prisma.$transaction(async (transaction) => {
    await executionGuard?.(transaction);
    const expired = await transaction.outboundDelivery.findMany({
      where: { status: "CLAIMED", claimExpiresAt: { lt: now } },
      select: { id: true, attemptCount: true },
      take: 50,
      orderBy: [{ claimExpiresAt: "asc" }, { id: "asc" }],
    });
    for (const delivery of expired) {
      const nextDelay = delivery.attemptCount > 0
        ? retryDelayMilliseconds(delivery.attemptCount)
        : 60_000;
      const nextAttemptAt = nextDelay === null ? null : new Date(now.getTime() + nextDelay);
      await transaction.outboundDelivery.update({
        where: { id: delivery.id },
        data: {
          status: nextDelay === null ? "PERMANENT_FAILURE" : "RETRY_SCHEDULED",
          failedAt: nextDelay === null ? now : null,
          nextAttemptAt,
          claimOwner: null,
          claimedAt: null,
          claimExpiresAt: null,
          lastProviderCode: "CLAIM_EXPIRED",
          version: { increment: 1 },
        },
      });
      await transaction.outboundDeliveryAttempt.updateMany({
        where: { deliveryId: delivery.id, finishedAt: null },
        data: {
          finishedAt: now,
          outcome: "TRANSIENT_FAILURE",
          retryable: nextDelay !== null,
          nextAttemptAt,
          safeProviderCode: "CLAIM_EXPIRED",
          sanitizedMetadata: { reason: "claim_lease_expired" },
        },
      });
    }
    return expired.length;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function processClaimedDeliveries(
  claimOwner: string,
  deliveryIds: string[],
  now = new Date(),
  executionGuard?: CommunicationExecutionGuard,
): Promise<DispatchResultDto> {
  const result = emptyDispatchResult();
  for (const deliveryId of deliveryIds) {
    const prepared = await prepareProviderMessage(
      deliveryId,
      claimOwner,
      now,
      executionGuard,
    );
    if (!prepared) {
      result.suppressed += 1;
      continue;
    }
    const provider = resolveOutboundProvider(prepared.message.channel);
    let providerResult;
    try {
      providerResult = sanitizeProviderResult(await provider.send(prepared.message));
    } catch {
      providerResult = {
        outcome: "TRANSIENT_FAILURE" as const,
        providerName: "provider-adapter",
        providerMessageId: null,
        retryable: true,
        safeCode: "PROVIDER_EXCEPTION",
      };
    }
    const status = await finalizeProviderAttempt({
      attemptId: prepared.attemptId,
      claimGeneration: prepared.claimGeneration,
      claimOwner,
      deliveryId,
      now: new Date(),
      providerResult,
      executionGuard,
    });
    result.attemptsFinalized += 1;
    if (status === "ACCEPTED") result.providerAccepted += 1;
    else if (status === "RETRY_SCHEDULED") result.retryScheduled += 1;
    else result.permanentFailure += 1;
  }
  return result;
}

function sanitizeProviderResult(value: ProviderSendResult): ProviderSendResult {
  const outcomes = new Set(["ACCEPTED", "TRANSIENT_FAILURE", "PERMANENT_FAILURE", "NOT_CONFIGURED"]);
  const providerNameSafe = /^[a-z0-9][a-z0-9._-]{0,79}$/.test(value.providerName);
  const codeSafe = /^[A-Z0-9][A-Z0-9_.:-]{0,79}$/.test(value.safeCode);
  const messageIdSafe = value.providerMessageId === null
    || /^[A-Za-z0-9][A-Za-z0-9._:~-]{0,190}$/.test(value.providerMessageId);
  const retrySafe = value.outcome === "TRANSIENT_FAILURE" ? value.retryable : !value.retryable;
  if (!outcomes.has(value.outcome) || !providerNameSafe || !codeSafe || !messageIdSafe || !retrySafe) {
    return {
      outcome: "TRANSIENT_FAILURE",
      providerName: "provider-adapter",
      providerMessageId: null,
      retryable: true,
      safeCode: "INVALID_PROVIDER_RESULT",
    };
  }
  return value;
}

async function enqueueCampaign(
  transaction: Prisma.TransactionClient,
  input: {
    action: string;
    campaign: CommunicationCampaign;
    context: CommunicationAdminContext;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    requestHash: string;
    executionGuard?: CommunicationExecutionGuard;
  },
): Promise<CampaignSummaryDto> {
  await input.executionGuard?.(transaction);
  const snapshotStartedAt = Date.now();
  const recipients = await assertAudienceWithinLimit(transaction, input.campaign);
  let inAppNotificationId: string | null = input.campaign.inAppNotificationId;
  if (input.campaign.channels.includes("IN_APP")) {
    const content = parseCampaignContent(input.campaign.localizedContent);
    const fallback = content.EN.inApp!;
    const eventKey = notificationEventKey({
      audience: input.campaign.audience,
      businessId: input.campaign.targetOrganizationId ?? undefined,
      eventType: "admin.communication_campaign",
      recipientPersonId: input.campaign.targetPersonId ?? undefined,
      sourceId: input.campaign.id,
      sourceType: "ADMIN_ANNOUNCEMENT",
    });
    await createCanonicalNotifications(transaction, [{
      audience: input.campaign.audience,
      body: fallback.body,
      category: input.campaign.category,
      createdByUserId: input.context.userId,
      destinationKind: input.campaign.destinationKind,
      eventKey,
      eventType: "admin.communication_campaign",
      localizedContent: {
        AR: content.AR.inApp!,
        EN: content.EN.inApp!,
        CKB: content.CKB.inApp!,
      },
      mandatory: input.campaign.mandatory,
      occurredAt: input.now,
      priority: input.campaign.priority,
      recipientPersonId: input.campaign.targetPersonId ?? undefined,
      businessId: input.campaign.targetOrganizationId ?? undefined,
      sourceId: input.campaign.id,
      sourceType: "ADMIN_ANNOUNCEMENT",
      title: fallback.title,
    }], { producedAt: input.now });
    const notification = await transaction.notification.findUnique({
      where: { eventKey },
      select: { id: true },
    });
    inAppNotificationId = notification?.id ?? null;
  }

  const selectedOutbound = outboundChannels.filter((channel) => input.campaign.channels.includes(channel));
  const endpointCandidates = recipients.filter((recipient) =>
    recipient.active && selectedOutbound.some((channel) => recipient.outboundEnabled[channel]));
  const endpointResolution = await resolvePersonEndpointsBulk(
    transaction,
    endpointCandidates.map((recipient) => recipient.personId),
    selectedOutbound,
  );
  const deliveries: Prisma.OutboundDeliveryCreateManyInput[] = [];
  for (const recipient of recipients) {
    for (const channel of selectedOutbound) {
      deliveries.push(snapshotDelivery(
        input.campaign,
        recipient,
        channel,
        endpointResolution.byPerson.get(recipient.personId)?.[channel] ?? null,
        input.now,
      ));
    }
  }
  const deliveryChunks = chunks(deliveries, DELIVERY_INSERT_CHUNK_SIZE);
  for (const deliveryChunk of deliveryChunks) {
    await transaction.outboundDelivery.createMany({ data: deliveryChunk, skipDuplicates: true });
  }
  await snapshotDiagnosticsTestHook?.({
    deliveryInsertChunkCount: deliveryChunks.length,
    deliveryRowCount: deliveries.length,
    elapsedMs: Date.now() - snapshotStartedAt,
    endpointQueryCount: endpointResolution.diagnostics.endpointQueryCount,
    recipientCount: recipients.length,
    selectedChannels: selectedOutbound,
  });
  const groups = await transaction.outboundDelivery.groupBy({
    by: ["status"],
    where: { campaignId: input.campaign.id },
    _count: { _all: true },
  });
  const counts = countersFromGroups(groups);
  const final = campaignFinalStatus(counts, Boolean(inAppNotificationId));
  await input.executionGuard?.(transaction);
  const updated = await transaction.communicationCampaign.update({
    where: { id: input.campaign.id },
    data: {
      completedAt: final ? input.now : null,
      dispatchStartedAt: input.now,
      inAppNotificationId,
      recipientEvaluationAt: input.now,
      scheduledAt: input.campaign.scheduledAt,
      status: final ?? "DISPATCHING",
      updatedByAdminUserId: input.context.userId,
      version: { increment: 1 },
    },
  });
  const result = summaryFromCampaign(updated, counts);
  await recordCampaignMutation(transaction, {
    action: input.action,
    afterStatus: updated.status,
    beforeStatus: input.campaign.status,
    campaign: updated,
    context: input.context,
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    result,
  });
  return result;
}

export function snapshotDelivery(
  campaign: CommunicationCampaign,
  recipient: EvaluatedRecipient,
  channel: OutboundChannel,
  endpoint: ResolvedEndpoint | null,
  now: Date,
): Prisma.OutboundDeliveryCreateManyInput {
  const suppressionReason = !recipient.active
    ? "RECIPIENT_INACTIVE"
    : !recipient.outboundEnabled[channel]
      ? "PREFERENCE_DISABLED"
      : !endpoint?.eligible
        ? endpoint?.reason ?? "MISSING_ENDPOINT"
        : null;
  return {
    campaignId: campaign.id,
    personId: recipient.personId,
    channel,
    locale: recipient.locale,
    endpointType: endpoint?.endpointType ?? endpointType(channel),
    endpointFingerprint: endpoint?.fingerprint ?? null,
    status: suppressionReason ? "SUPPRESSED" : "PENDING",
    suppressionReason,
    nextAttemptAt: suppressionReason ? null : now,
  };
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size));
  }
  return result;
}

async function prepareProviderMessage(
  deliveryId: string,
  claimOwner: string,
  now: Date,
  executionGuard?: CommunicationExecutionGuard,
  expectedClaimGeneration?: number,
): Promise<{
  attemptId: string;
  claimGeneration: number;
  message: SafeProviderMessage;
} | null> {
  return prisma.$transaction(async (transaction) => {
    await executionGuard?.(transaction);
    const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT delivery."id"
      FROM "OutboundDelivery" AS delivery
      WHERE delivery."id" = ${deliveryId}::uuid
      FOR UPDATE OF delivery
    `);
    if (!rows[0]) return null;
    const delivery = await transaction.outboundDelivery.findUnique({
      where: { id: deliveryId },
      include: { campaign: true },
    });
    if (
      !delivery
      || delivery.status !== "CLAIMED"
      || delivery.claimOwner !== claimOwner
      || (
        expectedClaimGeneration !== undefined
        && delivery.version !== expectedClaimGeneration
      )
    ) {
      if (expectedClaimGeneration !== undefined) {
        throw new CommunicationOperationRetryableError(
          1,
          "CLAIM_GENERATION_CHANGED",
        );
      }
      return null;
    }
    if (delivery.campaign.status === "CANCELLED") {
      await suppressClaimedDelivery(transaction, delivery, "CAMPAIGN_CANCELLED", now, "CANCELLED");
      return null;
    }
    const eligible = await isRecipientCurrent(transaction, delivery.campaign, delivery.personId);
    const preferenceEnabled = delivery.campaign.mandatory
      || await outboundPreferenceEnabled(transaction, delivery.personId, delivery.channel as OutboundChannel, delivery.campaign.category);
    const endpoint = eligible && preferenceEnabled
      ? await resolvePersonEndpoint(transaction, delivery.personId, delivery.channel as OutboundChannel)
      : null;
    const reason = !eligible
      ? "RECIPIENT_INVALIDATED"
      : !preferenceEnabled
        ? "PREFERENCE_DISABLED"
        : !endpoint?.eligible
          ? endpoint?.reason ?? "MISSING_ENDPOINT"
          : endpoint.fingerprint !== delivery.endpointFingerprint
            ? "ENDPOINT_CHANGED"
            : null;
    if (reason || !endpoint?.endpoint) {
      await suppressClaimedDelivery(transaction, delivery, reason ?? "MISSING_ENDPOINT", now, "SUPPRESSED");
      return null;
    }
    const unfinished = await transaction.outboundDeliveryAttempt.findMany({
      where: { deliveryId: delivery.id, finishedAt: null },
      orderBy: [{ attemptNumber: "asc" }, { id: "asc" }],
      take: 2,
    });
    if (unfinished.length > 1) {
      communicationError(
        "STALE_VERSION",
        "Delivery has multiple unfinished provider attempts.",
      );
    }
    let attempt = unfinished[0];
    if (attempt) {
      if (attempt.attemptNumber !== delivery.attemptCount) {
        communicationError(
          "STALE_VERSION",
          "Delivery attempt fencing is inconsistent.",
        );
      }
      if (attempt.claimOwner !== claimOwner) {
        attempt = await transaction.outboundDeliveryAttempt.update({
          where: { id: attempt.id },
          data: { claimOwner },
        });
      }
    } else {
      const attemptNumber = delivery.attemptCount + 1;
      if (attemptNumber > 5) {
        await suppressClaimedDelivery(transaction, delivery, "MAX_ATTEMPTS", now, "PERMANENT_FAILURE");
        return null;
      }
      attempt = await transaction.outboundDeliveryAttempt.create({
        data: {
          deliveryId: delivery.id,
          attemptNumber,
          claimOwner,
          startedAt: now,
          sanitizedMetadata: { providerIdempotencyScope: "delivery" },
        },
      });
      const advancedDelivery = await transaction.outboundDelivery.update({
        where: { id: delivery.id },
        data: { attemptCount: attemptNumber, version: { increment: 1 } },
      });
      return {
        attemptId: attempt.id,
        claimGeneration: advancedDelivery.version,
        message: providerMessage(delivery, endpoint.endpoint),
      };
    }
    return {
      attemptId: attempt.id,
      claimGeneration: delivery.version,
      message: providerMessage(delivery, endpoint.endpoint),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function finalizeProviderAttempt(input: {
  attemptId: string;
  claimGeneration: number;
  claimOwner: string;
  deliveryId: string;
  now: Date;
  providerResult: Awaited<ReturnType<ReturnType<typeof resolveOutboundProvider>["send"]>>;
  executionGuard?: CommunicationExecutionGuard;
}): Promise<"ACCEPTED" | "RETRY_SCHEDULED" | "PERMANENT_FAILURE"> {
  return prisma.$transaction(async (transaction) => {
    await input.executionGuard?.(transaction);
    await transaction.$queryRaw(Prisma.sql`
      SELECT delivery."id"
      FROM "OutboundDelivery" AS delivery
      WHERE delivery."id" = ${input.deliveryId}::uuid
      FOR UPDATE OF delivery
    `);
    const delivery = await transaction.outboundDelivery.findUnique({ where: { id: input.deliveryId } });
    const attempt = await transaction.outboundDeliveryAttempt.findUnique({ where: { id: input.attemptId } });
    if (!delivery || !attempt) {
      communicationError("NOT_FOUND", "Delivery attempt was not found.");
    }
    if (
      attempt.finishedAt
      || attempt.claimOwner !== input.claimOwner
      || delivery.claimOwner !== input.claimOwner
      || delivery.version !== input.claimGeneration
    ) {
      throw new CommunicationOperationRetryableError(
        1,
        "CLAIM_GENERATION_CHANGED",
      );
    }
    const accepted = input.providerResult.outcome === "ACCEPTED";
    const transient = input.providerResult.outcome === "TRANSIENT_FAILURE" && input.providerResult.retryable;
    const delay = transient ? retryDelayMilliseconds(delivery.attemptCount) : null;
    const status = accepted
      ? "ACCEPTED"
      : delay !== null
        ? "RETRY_SCHEDULED"
        : "PERMANENT_FAILURE";
    const nextAttemptAt = delay === null ? null : new Date(input.now.getTime() + delay);
    await transaction.outboundDeliveryAttempt.update({
      where: { id: attempt.id },
      data: {
        finishedAt: input.now,
        outcome: input.providerResult.outcome,
        providerName: input.providerResult.providerName,
        providerMessageId: input.providerResult.providerMessageId,
        retryable: status === "RETRY_SCHEDULED",
        nextAttemptAt,
        safeProviderCode: input.providerResult.safeCode,
        sanitizedMetadata: { classification: input.providerResult.outcome },
      },
    });
    await transaction.outboundDelivery.update({
      where: { id: delivery.id },
      data: {
        acceptedAt: accepted ? input.now : null,
        failedAt: status === "PERMANENT_FAILURE" ? input.now : null,
        status,
        nextAttemptAt,
        claimOwner: null,
        claimedAt: null,
        claimExpiresAt: null,
        providerName: input.providerResult.providerName,
        providerMessageId: input.providerResult.providerMessageId,
        lastProviderCode: input.providerResult.safeCode,
        version: { increment: 1 },
      },
    });
    await finalizeCampaignState(transaction, delivery.campaignId, input.now);
    return status;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function finalizeCampaignState(
  transaction: Prisma.TransactionClient,
  campaignId: string,
  now: Date,
) {
  const campaign = await transaction.communicationCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status === "CANCELLED") return;
  const groups = await transaction.outboundDelivery.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { _all: true },
  });
  const final = campaignFinalStatus(countersFromGroups(groups), Boolean(campaign.inAppNotificationId));
  if (final) {
    await transaction.communicationCampaign.update({
      where: { id: campaignId },
      data: { status: final, completedAt: now },
    });
  }
}

async function suppressClaimedDelivery(
  transaction: Prisma.TransactionClient,
  delivery: OutboundDelivery,
  reason: string,
  now: Date,
  status: "SUPPRESSED" | "CANCELLED" | "PERMANENT_FAILURE",
) {
  await transaction.outboundDeliveryAttempt.updateMany({
    where: {
      deliveryId: delivery.id,
      finishedAt: null,
    },
    data: {
      finishedAt: now,
      nextAttemptAt: null,
      outcome: "PERMANENT_FAILURE",
      retryable: false,
      safeProviderCode: reason.slice(0, 80),
      sanitizedMetadata: { classification: "DOMAIN_SUPPRESSED" },
    },
  });
  await transaction.outboundDelivery.update({
    where: { id: delivery.id },
    data: {
      status,
      suppressionReason: reason,
      failedAt: status === "PERMANENT_FAILURE" ? now : null,
      claimOwner: null,
      claimedAt: null,
      claimExpiresAt: null,
      nextAttemptAt: null,
      version: { increment: 1 },
    },
  });
  await finalizeCampaignState(transaction, delivery.campaignId, now);
}

async function recoverDeliveryAfterInterruption(
  deliveryId: string,
  claimOwner: string,
  claimGeneration: number,
  safeCode: string,
) {
  return prisma.$transaction(async (transaction) => {
    await lockOutboundDelivery(transaction, deliveryId);
    const delivery = await transaction.outboundDelivery.findUnique({
      where: { id: deliveryId },
      include: { campaign: { select: { status: true } } },
    });
    if (
      !delivery
      || delivery.status !== "CLAIMED"
      || delivery.claimOwner !== claimOwner
      || delivery.version !== claimGeneration
    ) return;
    const now = await communicationDatabaseNow(transaction);
    const cancelled = delivery.campaign.status === "CANCELLED";
    const delay = cancelled
      ? null
      : delivery.attemptCount > 0
        ? retryDelayMilliseconds(delivery.attemptCount)
        : 60_000;
    const nextAttemptAt =
      delay === null ? null : new Date(now.getTime() + delay);
    const status = cancelled
      ? "CANCELLED"
      : delay === null
        ? "PERMANENT_FAILURE"
        : "RETRY_SCHEDULED";
    await transaction.outboundDeliveryAttempt.updateMany({
      where: { deliveryId, finishedAt: null },
      data: {
        finishedAt: now,
        nextAttemptAt,
        outcome: cancelled ? "PERMANENT_FAILURE" : "TRANSIENT_FAILURE",
        retryable: status === "RETRY_SCHEDULED",
        safeProviderCode: (
          cancelled ? "CAMPAIGN_CANCELLED" : safeCode
        ).slice(0, 80),
        sanitizedMetadata: { classification: "AUTOMATION_INTERRUPTED" },
      },
    });
    await transaction.outboundDelivery.update({
      where: { id: delivery.id },
      data: {
        claimExpiresAt: null,
        claimedAt: null,
        claimOwner: null,
        failedAt: status === "PERMANENT_FAILURE" ? now : null,
        lastProviderCode: (
          cancelled ? "CAMPAIGN_CANCELLED" : safeCode
        ).slice(0, 80),
        nextAttemptAt,
        status,
        version: { increment: 1 },
      },
    });
    await finalizeCampaignState(transaction, delivery.campaignId, now);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function lockOutboundDelivery(
  transaction: Prisma.TransactionClient,
  deliveryId: string,
) {
  await transaction.$queryRaw(Prisma.sql`
    SELECT delivery."id"
    FROM "OutboundDelivery" AS delivery
    WHERE delivery."id" = ${deliveryId}::uuid
    FOR UPDATE OF delivery
  `);
}

async function communicationDatabaseNow(transaction: Prisma.TransactionClient) {
  const [clock] = await transaction.$queryRaw<Array<{ now: Date }>>(
    Prisma.sql`SELECT clock_timestamp() AS now`,
  );
  if (!clock?.now) {
    communicationError("STALE_VERSION", "Communication database time is unavailable.");
  }
  return clock.now;
}

function terminalDeliveryStatus(status: string) {
  return [
    "ACCEPTED",
    "PERMANENT_FAILURE",
    "SUPPRESSED",
    "CANCELLED",
  ].includes(status);
}

function boundedDeliveryClaimRetrySeconds(now: Date, expiresAt: Date) {
  return Math.max(
    1,
    Math.min(
      Math.ceil(CLAIM_LEASE_MS / 1_000),
      Math.ceil((expiresAt.getTime() - now.getTime()) / 1_000),
    ),
  );
}

async function isRecipientCurrent(
  transaction: Prisma.TransactionClient,
  campaign: CommunicationCampaign,
  personId: string,
): Promise<boolean> {
  const person = await transaction.person.findFirst({
    where: { id: personId, deletedAt: null, isOnboarded: true, status: "ACTIVE" },
    select: { id: true },
  });
  if (!person) return false;
  if (campaign.audience === "USER") return campaign.targetPersonId === personId;
  if (campaign.audience === "ALL" || campaign.audience === "CUSTOMERS") return true;
  const membership = await transaction.organizationMember.findFirst({
    where: {
      personId,
      deletedAt: null,
      status: "ACTIVE",
      ...(campaign.audience === "BUSINESS" ? { organizationId: campaign.targetOrganizationId! } : {}),
      organization: {
        deletedAt: null,
        isActive: true,
        status: "ACTIVE",
        ...(campaign.audience === "RESTAURANTS" ? { vertical: { in: ["RESTAURANT", "CAFE"] } } : {}),
      },
      role: {
        systemRole: campaign.audience === "BUSINESS_OWNERS"
          ? "OWNER"
          : { in: ["OWNER", "MANAGER", "RECEPTIONIST"] },
      },
    },
    select: { id: true },
  });
  return Boolean(membership);
}

async function outboundPreferenceEnabled(
  transaction: Prisma.TransactionClient,
  personId: string,
  channel: OutboundChannel,
  category: NotificationCategory,
) {
  const preference = await transaction.outboundPreference.findUnique({ where: { personId } });
  if (!preference) return false;
  if (channel === "EMAIL") return preference.emailCategories.includes(category);
  if (channel === "SMS") return preference.smsCategories.includes(category);
  return preference.pushCategories.includes(category);
}

function providerMessage(
  delivery: OutboundDelivery & { campaign: CommunicationCampaign },
  endpoint: string,
): SafeProviderMessage {
  const content = parseCampaignContent(delivery.campaign.localizedContent);
  const copy = content[delivery.locale as keyof CampaignLocalizedContent];
  const safePlatformHref = safeDestinationHref(delivery.campaign.destinationKind);
  const common = {
    channel: delivery.channel as OutboundChannel,
    deliveryId: delivery.id,
    providerIdempotencyKey: `communication-delivery:${delivery.id}`,
    endpoint,
    locale: delivery.locale as SafeProviderMessage["locale"],
    safePlatformHref,
  };
  if (delivery.channel === "EMAIL") {
    return {
      ...common,
      channel: "EMAIL",
      subject: copy.email!.subject,
      plainText: `${copy.email!.plainText}\n\n${safePlatformHref}`,
      safeHtml: safeEmailHtml(copy.email!.plainText, safePlatformHref),
    };
  }
  if (delivery.channel === "SMS") {
    return { ...common, channel: "SMS", plainText: `${copy.sms!.text}\n${safePlatformHref}` };
  }
  return { ...common, channel: "PUSH", subject: copy.push!.title, plainText: copy.push!.body };
}

function safeDestinationHref(destination: CommunicationCampaign["destinationKind"]): string {
  const paths: Partial<Record<CommunicationCampaign["destinationKind"], string>> = {
    NOTIFICATIONS: "/customer/notifications",
    CUSTOMER_ACCOUNT: "/customer/account",
    CUSTOMER_MESSAGES: "/customer/messages",
    BUSINESS_MESSAGES: "/business/messages",
    BUSINESS_NOTIFICATIONS: "/business/notifications",
  };
  const base = safeApplicationOrigin();
  return new URL(paths[destination] ?? "/customer/notifications", base).toString();
}

function safeApplicationOrigin(): string {
  const candidate = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL;
  if (!candidate) return "https://rezno.app";
  try {
    const url = new URL(candidate);
    const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !local) return "https://rezno.app";
    return url.origin;
  } catch {
    return "https://rezno.app";
  }
}

function parseCampaignContent(value: Prisma.JsonValue): CampaignLocalizedContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    communicationError("VALIDATION_ERROR", "Campaign content is unavailable.");
  }
  return value as unknown as CampaignLocalizedContent;
}

async function lockCampaign(
  transaction: Prisma.TransactionClient,
  campaignId: string,
): Promise<CommunicationCampaign> {
  await transaction.$queryRaw(Prisma.sql`
    SELECT campaign."id"
    FROM "CommunicationCampaign" AS campaign
    WHERE campaign."id" = ${campaignId}::uuid
    FOR UPDATE OF campaign
  `);
  const campaign = await transaction.communicationCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) communicationError("NOT_FOUND", "Campaign was not found.");
  return campaign;
}

function summaryFromCampaign(
  campaign: CommunicationCampaign,
  counts: ReturnType<typeof emptyDeliveryCounters>,
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

function endpointType(channel: OutboundChannel) {
  if (channel === "EMAIL") return "EMAIL";
  if (channel === "SMS") return "PHONE";
  return "PUSH_TOKEN";
}

function emptyDispatchResult(): DispatchResultDto {
  return {
    kind: "DISPATCH_RESULT",
    campaignsStarted: 0,
    deliveriesClaimed: 0,
    attemptsFinalized: 0,
    providerAccepted: 0,
    retryScheduled: 0,
    permanentFailure: 0,
    suppressed: 0,
  };
}

function dispatchResultFromAudit(value: Prisma.JsonValue | null): DispatchResultDto | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, Prisma.JsonValue>;
  if (record.kind !== "DISPATCH_RESULT") return null;
  const fields: Array<keyof Omit<DispatchResultDto, "kind">> = [
    "campaignsStarted",
    "deliveriesClaimed",
    "attemptsFinalized",
    "providerAccepted",
    "retryScheduled",
    "permanentFailure",
    "suppressed",
  ];
  if (fields.some((field) => !Number.isSafeInteger(record[field]) || Number(record[field]) < 0)) {
    return null;
  }
  return value as unknown as DispatchResultDto;
}
