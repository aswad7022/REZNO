import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import { CommunicationDomainError } from "../../features/communications/domain/errors";
import {
  communicationAdminCursorScope,
  communicationCursorFilterFingerprint,
  encodeAttemptCursor,
} from "../../features/communications/domain/cursor";
import {
  getCampaignDetail,
  getCampaignPage,
  previewCampaignAudience,
} from "../../features/communications/services/campaigns";
import { getOutboundPreferences } from "../../features/communications/services/preferences";
import { setCommunicationEndpointDiagnosticsTestHook } from "../../features/communications/services/endpoints";
import {
  getAttemptPage,
  getDeliveryPage,
  searchCommunicationTargets,
} from "../../features/communications/services/reporting";
import { getExactPostgresTime } from "../../lib/db/postgres-timestamp";
import { prisma } from "../../lib/db/prisma";
import {
  OUTBOUND_STAGE4C_FIXTURE,
  validateOutboundStage4cEnvironment,
} from "./outbound-communications-stage4c-seed-safety";

const FULL_ADMIN_USER_ID = "4c000000-0000-4000-8000-000000000001";
const FULL_ADMIN_PERSON_ID = "4c000000-0000-4000-8000-000000000002";
const VIEW_ADMIN_USER_ID = "4c000000-0000-4000-8000-000000000003";
const VIEW_ADMIN_PERSON_ID = "4c000000-0000-4000-8000-000000000004";
const REVOKED_ADMIN_USER_ID = "4c000000-0000-4000-8000-000000000005";
const REVOKED_ADMIN_PERSON_ID = "4c000000-0000-4000-8000-000000000006";
const CUSTOMER_USER_ID = "4c000000-0000-4000-8000-000000000007";
const CUSTOMER_PERSON_ID = "4c000000-0000-4000-8000-000000000008";
const ORGANIZATION_ID = "4c000000-0000-4000-8000-000000000011";
const BROADCAST_CREATE_KEY = "4c100000-0000-4000-8000-00000000001e";
let smokeCheckpoint = "bootstrap";

async function main() {
  validateOutboundStage4cEnvironment(process.env);
  const gate6cSuccessor = process.env.REZNO_STAGE6_GATE6C_SUCCESSOR === "true"
    && process.env.REZNO_STAGE6_GATE6C_CONFIRM === "REZNO_STAGE6_GATE6C_STAGING_ONLY";
  const expectedMigrations = gate6cSuccessor ? 48 : 38;
  smokeCheckpoint = "aggregate-queries";
  const [
    campaigns,
    acceptedGroups,
    attempts,
    suppressions,
    audits,
    migrations,
    broadcastMutation,
    viewAccess,
    revokedAccess,
    unsafeAudits,
  ] = await Promise.all([
    prisma.communicationCampaign.groupBy({
      by: ["status"],
      where: { createdByAdminUserId: FULL_ADMIN_USER_ID },
      _count: { _all: true },
    }),
    prisma.outboundDelivery.groupBy({
      by: ["channel"],
      where: {
        campaign: { createdByAdminUserId: FULL_ADMIN_USER_ID },
        providerName: "rezno-deterministic-sink",
        status: "ACCEPTED",
      },
      _count: { _all: true },
    }),
    prisma.outboundDeliveryAttempt.groupBy({
      by: ["outcome"],
      where: { delivery: { campaign: { createdByAdminUserId: FULL_ADMIN_USER_ID } } },
      _count: { _all: true },
    }),
    prisma.outboundDelivery.groupBy({
      by: ["suppressionReason"],
      where: {
        campaign: { createdByAdminUserId: FULL_ADMIN_USER_ID },
        status: "SUPPRESSED",
      },
      _count: { _all: true },
    }),
    prisma.adminAuditLog.count({
      where: { adminUserId: FULL_ADMIN_USER_ID, action: { startsWith: "COMMUNICATION" } },
    }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "_prisma_migrations"
      WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
    `,
    prisma.communicationCampaignMutation.findUnique({
      where: {
        adminUserId_idempotencyKey: {
          adminUserId: FULL_ADMIN_USER_ID,
          idempotencyKey: BROADCAST_CREATE_KEY,
        },
      },
      select: { campaignId: true },
    }),
    prisma.adminAccess.findUnique({ where: { userId: VIEW_ADMIN_USER_ID } }),
    prisma.adminAccess.findUnique({ where: { userId: REVOKED_ADMIN_USER_ID } }),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM "AdminAuditLog"
      WHERE "adminUserId" = ${FULL_ADMIN_USER_ID}
        AND (
          COALESCE("metadata"::text, '') ~* 'stage4c\\.rezno\\.invalid|stage4c-push|\\+964'
          OR COALESCE("result"::text, '') ~* 'stage4c\\.rezno\\.invalid|stage4c-push|\\+964'
        )
    `),
  ]);

  assert.equal(Number(migrations[0]?.count), expectedMigrations);
  assert.ok(broadcastMutation);
  const [broadcastDeliveries, campaignCount, inAppCampaigns, inAppNotifications, notConfigured, transient, permanent] = await Promise.all([
    prisma.outboundDelivery.count({ where: { campaignId: broadcastMutation.campaignId } }),
    prisma.communicationCampaign.count({ where: { createdByAdminUserId: FULL_ADMIN_USER_ID } }),
    prisma.communicationCampaign.count({
      where: { createdByAdminUserId: FULL_ADMIN_USER_ID, inAppNotificationId: { not: null } },
    }),
    prisma.notification.count({
      where: { createdByUserId: FULL_ADMIN_USER_ID, eventType: "admin.communication_campaign" },
    }),
    prisma.outboundDelivery.count({
      where: { campaign: { createdByAdminUserId: FULL_ADMIN_USER_ID }, lastProviderCode: "PROVIDER_NOT_CONFIGURED", status: "PERMANENT_FAILURE" },
    }),
    prisma.outboundDelivery.count({
      where: { campaign: { createdByAdminUserId: FULL_ADMIN_USER_ID }, lastProviderCode: "SINK_TRANSIENT", status: "RETRY_SCHEDULED" },
    }),
    prisma.outboundDelivery.count({
      where: { campaign: { createdByAdminUserId: FULL_ADMIN_USER_ID }, lastProviderCode: "SINK_PERMANENT", status: "PERMANENT_FAILURE" },
    }),
  ]);

  const statuses = Object.fromEntries(campaigns.map((row) => [row.status, row._count._all]));
  const acceptedByChannel = Object.fromEntries(acceptedGroups.map((row) => [row.channel, row._count._all]));
  const outcomes = Object.fromEntries(attempts.map((row) => [row.outcome ?? "IN_PROGRESS", row._count._all]));
  const suppressedByReason = Object.fromEntries(suppressions.map((row) => [row.suppressionReason ?? "UNKNOWN", row._count._all]));

  smokeCheckpoint = "aggregate-assertions";
  assert.ok(campaignCount > 20);
  assert.ok(broadcastDeliveries > 20);
  assert.ok(statuses.DRAFT >= 20);
  assert.ok(statuses.SCHEDULED >= 1);
  assert.ok(statuses.CANCELLED >= 1);
  assert.ok(statuses.COMPLETED >= 1);
  assert.ok(statuses.FAILED >= 1);
  smokeCheckpoint = "accepted-channel-assertions";
  assert.ok(acceptedByChannel.EMAIL >= 1);
  assert.ok(acceptedByChannel.SMS >= 1);
  assert.ok(acceptedByChannel.PUSH >= 1);
  assert.ok(outcomes.ACCEPTED >= 3);
  assert.ok(outcomes.TRANSIENT_FAILURE >= 1);
  assert.ok(outcomes.PERMANENT_FAILURE >= 1);
  assert.ok(outcomes.NOT_CONFIGURED >= 1);
  smokeCheckpoint = "suppression-assertions";
  assert.ok(suppressedByReason.UNVERIFIED_ENDPOINT >= 1);
  assert.ok(suppressedByReason.PREFERENCE_DISABLED >= 1);
  smokeCheckpoint = "provider-outcome-assertions";
  assert.equal(notConfigured, 1);
  // Gate 6C deliberately consumes the one retryable Gate 4C fixture delivery.
  // Its successor smoke therefore proves the retry left RETRY_SCHEDULED, while
  // the original Gate 4C smoke continues to prove the pre-automation state.
  assert.equal(transient, gate6cSuccessor ? 0 : 1);
  assert.equal(permanent, 1);
  assert.equal(inAppCampaigns, inAppNotifications);
  smokeCheckpoint = "audit-access-assertions";
  assert.ok(audits >= campaignCount);
  assert.deepEqual(viewAccess?.permissions, ["NOTIFICATIONS_VIEW"]);
  assert.equal(revokedAccess?.status, "REVOKED");
  assert.equal(Number(unsafeAudits[0]?.count), 0);

  const fullAccess = await prisma.adminAccess.findUniqueOrThrow({ where: { userId: FULL_ADMIN_USER_ID } });
  const fullContext = {
    userId: FULL_ADMIN_USER_ID,
    personId: FULL_ADMIN_PERSON_ID,
    source: "database" as const,
    adminAccessId: fullAccess.id,
  };
  const viewContext = {
    userId: VIEW_ADMIN_USER_ID,
    personId: VIEW_ADMIN_PERSON_ID,
    source: "database" as const,
    adminAccessId: viewAccess!.id,
  };
  const revokedContext = {
    userId: REVOKED_ADMIN_USER_ID,
    personId: REVOKED_ADMIN_PERSON_ID,
    source: "database" as const,
    adminAccessId: revokedAccess!.id,
  };
  smokeCheckpoint = "campaign-pagination";
  const firstCampaignPage = await getCampaignPage(fullContext, { cursor: null, pageSize: 20, status: null });
  assert.ok(firstCampaignPage.nextCursor);
  const secondCampaignPage = await getCampaignPage(fullContext, {
    cursor: firstCampaignPage.nextCursor,
    pageSize: 20,
    status: null,
  });
  assert.ok(
    new Set([...firstCampaignPage.items, ...secondCampaignPage.items].map((item) => item.id)).size
      >= Math.min(campaignCount, 40),
  );
  const draftCampaignPage = await getCampaignPage(fullContext, { cursor: null, pageSize: 10, status: "DRAFT" });
  assert.ok(draftCampaignPage.nextCursor);
  assert.ok((await getCampaignPage(fullContext, {
    cursor: draftCampaignPage.nextCursor, pageSize: 10, status: "DRAFT",
  })).items.every((item) => item.status === "DRAFT"));
  await assert.rejects(
    getCampaignPage(fullContext, { cursor: draftCampaignPage.nextCursor, pageSize: 10, status: null }),
    (error) => error instanceof CommunicationDomainError && error.code === "INVALID_CURSOR",
  );
  await assert.rejects(
    getCampaignPage(fullContext, { cursor: firstCampaignPage.nextCursor, pageSize: 5, status: null }),
    (error) => error instanceof CommunicationDomainError && error.code === "INVALID_CURSOR",
  );
  await assert.rejects(
    getCampaignPage(viewContext, { cursor: firstCampaignPage.nextCursor, pageSize: 20, status: null }),
    (error) => error instanceof CommunicationDomainError && error.code === "INVALID_CURSOR",
  );
  const tamperedCampaignCursor = bitFlipCursorMac(firstCampaignPage.nextCursor);
  await assert.rejects(
    getCampaignPage(fullContext, { cursor: tamperedCampaignCursor, pageSize: 20, status: null }),
    (error) => error instanceof CommunicationDomainError && error.code === "INVALID_CURSOR",
  );
  await assert.rejects(
    getCampaignPage(fullContext, {
      cursor: versionOneCursor(firstCampaignPage.nextCursor), pageSize: 20, status: null,
    }),
    (error) => error instanceof CommunicationDomainError && error.code === "INVALID_CURSOR",
  );
  await assert.rejects(
    getCampaignPage(fullContext, {
      cursor: forgeWithOldPublicChecksum(firstCampaignPage.nextCursor, {
        filterFingerprint: "0".repeat(64),
      }),
      pageSize: 20,
      status: null,
    }),
    (error) => error instanceof CommunicationDomainError && error.code === "INVALID_CURSOR",
  );
  assert.ok((await getCampaignPage(viewContext, { cursor: null, pageSize: 5, status: null })).items.length > 0);
  await assert.rejects(
    getCampaignPage(revokedContext, { cursor: firstCampaignPage.nextCursor, pageSize: 20, status: null }),
    (error) => error instanceof CommunicationDomainError && error.code === "FORBIDDEN",
  );

  smokeCheckpoint = "delivery-pagination";
  const deliveryPages: Array<Awaited<ReturnType<typeof getDeliveryPage>>> = [];
  let deliveryCursor: string | null = null;
  do {
    const page = await getDeliveryPage(fullContext, {
      campaignId: broadcastMutation.campaignId,
      cursor: deliveryCursor,
      pageSize: 20,
      status: null,
    });
    deliveryPages.push(page);
    deliveryCursor = page.nextCursor;
    assert.ok(deliveryPages.length <= 251, "Delivery pagination exceeded the 5,000-recipient safety ceiling.");
  } while (deliveryCursor);
  const firstDeliveryPage = deliveryPages[0]!;
  assert.ok(deliveryPages.length > 1);
  assert.equal(
    new Set(deliveryPages.flatMap((page) => page.items).map((item) => item.id)).size,
    broadcastDeliveries,
  );
  const suppressedDeliveryPage = await getDeliveryPage(fullContext, {
    campaignId: broadcastMutation.campaignId, cursor: null, pageSize: 20, status: "SUPPRESSED",
  });
  assert.ok(suppressedDeliveryPage.nextCursor);
  assert.ok((await getDeliveryPage(fullContext, {
    campaignId: broadcastMutation.campaignId,
    cursor: suppressedDeliveryPage.nextCursor,
    pageSize: 20,
    status: "SUPPRESSED",
  })).items.every((item) => item.status === "SUPPRESSED"));
  await assert.rejects(
    getDeliveryPage(fullContext, {
      campaignId: broadcastMutation.campaignId,
      cursor: suppressedDeliveryPage.nextCursor,
      pageSize: 20,
      status: null,
    }),
    (error) => error instanceof CommunicationDomainError && error.code === "INVALID_CURSOR",
  );
  smokeCheckpoint = "attempt-detail";
  const attemptedDelivery = await prisma.outboundDelivery.findFirstOrThrow({
    where: {
      campaign: { createdByAdminUserId: FULL_ADMIN_USER_ID },
      campaignId: { not: broadcastMutation.campaignId },
      attempts: { some: {} },
    },
    select: { id: true, campaignId: true },
  });
  assert.ok((await getAttemptPage(fullContext, {
    deliveryId: attemptedDelivery.id,
    cursor: null,
    pageSize: 20,
  })).items.length > 0);
  assert.equal((await getCampaignDetail(fullContext, attemptedDelivery.campaignId)).id, attemptedDelivery.campaignId);
  await assert.rejects(
    getDeliveryPage(fullContext, {
      campaignId: attemptedDelivery.campaignId,
      cursor: firstDeliveryPage.nextCursor,
      pageSize: 20,
      status: null,
    }),
    (error) => error instanceof CommunicationDomainError && error.code === "INVALID_CURSOR",
  );
  await assert.rejects(
    getDeliveryPage(fullContext, {
      campaignId: attemptedDelivery.campaignId,
      cursor: forgeWithOldPublicChecksum(firstDeliveryPage.nextCursor!, {
        parentId: attemptedDelivery.campaignId,
      }),
      pageSize: 20,
      status: null,
    }),
    (error) => error instanceof CommunicationDomainError && error.code === "INVALID_CURSOR",
  );
  const [attemptAnchor] = await prisma.$queryRaw<Array<{
    id: string;
    sortTimestamp: string;
  }>>(Prisma.sql`
    SELECT attempt."id", to_char(
      attempt."createdAt" AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ) AS "sortTimestamp"
    FROM "OutboundDeliveryAttempt" AS attempt
    WHERE attempt."deliveryId" = ${attemptedDelivery.id}::uuid
    ORDER BY attempt."createdAt" DESC, attempt."id" DESC
    LIMIT 1
  `);
  assert.ok(attemptAnchor);
  const otherAttemptedDelivery = await prisma.outboundDelivery.findFirstOrThrow({
    where: { id: { not: attemptedDelivery.id }, attempts: { some: {} } },
    select: { id: true },
  });
  const syntheticAttemptCursor = encodeAttemptCursor({
    adminScope: communicationAdminCursorScope(fullContext),
    filterFingerprint: communicationCursorFilterFingerprint({}),
    pageSize: 1,
    parentId: attemptedDelivery.id,
    snapshot: await prisma.$transaction((transaction) => getExactPostgresTime(transaction)),
    sortTimestamp: attemptAnchor.sortTimestamp,
    tieBreakerId: attemptAnchor.id,
  });
  await assert.rejects(
    getAttemptPage(fullContext, {
      deliveryId: otherAttemptedDelivery.id, cursor: syntheticAttemptCursor, pageSize: 1,
    }),
    (error) => error instanceof CommunicationDomainError && error.code === "INVALID_CURSOR",
  );
  await assert.rejects(
    getAttemptPage(fullContext, {
      deliveryId: otherAttemptedDelivery.id,
      cursor: forgeWithOldPublicChecksum(syntheticAttemptCursor, {
        parentId: otherAttemptedDelivery.id,
      }),
      pageSize: 1,
    }),
    (error) => error instanceof CommunicationDomainError && error.code === "INVALID_CURSOR",
  );

  smokeCheckpoint = "audience-preview";
  const endpointDiagnostics: Array<{ endpointQueryCount: number; personCount: number; selectedChannels: string[] }> = [];
  setCommunicationEndpointDiagnosticsTestHook((diagnostics) => {
    endpointDiagnostics.push(diagnostics);
  });
  const audiencePreviews = await Promise.all([
    previewCampaignAudience(fullContext, {
      audience: "CUSTOMERS", targetPersonId: null, targetOrganizationId: null,
      channels: ["IN_APP", "EMAIL", "SMS", "PUSH"], category: "ADMIN_ANNOUNCEMENT", mandatory: false,
    }),
    previewCampaignAudience(fullContext, {
      audience: "BUSINESS_OWNERS", targetPersonId: null, targetOrganizationId: null,
      channels: ["IN_APP"], category: "ADMIN_ANNOUNCEMENT", mandatory: false,
    }),
    previewCampaignAudience(fullContext, {
      audience: "RESTAURANTS", targetPersonId: null, targetOrganizationId: null,
      channels: ["IN_APP"], category: "ADMIN_ANNOUNCEMENT", mandatory: false,
    }),
    previewCampaignAudience(fullContext, {
      audience: "BUSINESS", targetPersonId: null, targetOrganizationId: ORGANIZATION_ID,
      channels: ["IN_APP"], category: "ADMIN_ANNOUNCEMENT", mandatory: false,
    }),
  ]);
  setCommunicationEndpointDiagnosticsTestHook(undefined);
  assert.ok(audiencePreviews.every((preview) => preview.evaluated > 0 && !preview.tooLarge));
  const outboundPreviewDiagnostics = endpointDiagnostics.find((item) => item.selectedChannels.length === 3);
  assert.ok(outboundPreviewDiagnostics);
  assert.ok(outboundPreviewDiagnostics.endpointQueryCount <= Math.ceil(outboundPreviewDiagnostics.personCount / 1_000));
  smokeCheckpoint = "preference-target-search";
  const preferences = await getOutboundPreferences({ personId: CUSTOMER_PERSON_ID, userId: CUSTOMER_USER_ID });
  assert.equal(preferences.endpoints.EMAIL.eligible, true);
  assert.equal(preferences.endpoints.PUSH.eligible, false);
  assert.ok((await searchCommunicationTargets(fullContext, { kind: "USER", query: "stage4c", limit: 5 })).length <= 5);
  assert.ok((await searchCommunicationTargets(fullContext, { kind: "BUSINESS", query: "Stage 4C", limit: 5 })).length <= 5);
  const safeServiceEvidence = JSON.stringify({
    firstCampaignPage,
    firstDeliveryPage,
    audiencePreviews,
    preferences,
  });
  assert.doesNotMatch(safeServiceEvidence, /@stage4c|\+964|stage4c-push|postgres(?:ql)?:\/\//i);

  smokeCheckpoint = "output-redaction";
  const output = {
    fixture: OUTBOUND_STAGE4C_FIXTURE,
    migrations: expectedMigrations,
    campaignCount,
    broadcastDeliveries,
    statuses,
    acceptedByChannel,
    attemptOutcomes: outcomes,
    suppressedByReason,
    providerNotConfigured: notConfigured,
    retryScheduled: transient,
    gate6cProcessedRetry: gate6cSuccessor,
    sinkPermanentFailure: permanent,
    inAppExactOnce: inAppCampaigns,
    campaignPagesVerified: 2,
    deliveryPagesVerified: deliveryPages.length,
    cursorScopeRejectionsVerified: true,
    authenticatedCursorRejectionsVerified: true,
    bulkEndpointQueries: outboundPreviewDiagnostics.endpointQueryCount,
    audienceFamiliesVerified: audiencePreviews.length,
    preferenceContractVerified: true,
    auditRows: audits,
    confirmedHumanDelivery: false,
    automaticProductionScheduler: false,
    physicalDeviceQa: false,
  };
  const serialized = JSON.stringify(output);
  assert.doesNotMatch(serialized, /postgres(?:ql)?:\/\/|DATABASE_URL|Authorization|@stage4c|\+964|stage4c-push/i);
  process.stdout.write(`${serialized}\n`);
}

main()
  .catch(() => {
    process.stderr.write(`Gate 4C staging smoke failed at ${smokeCheckpoint} with a sanitized error.\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

function versionOneCursor(cursor: string) {
  const envelope = decodeCursorEnvelope(cursor);
  delete envelope.mac;
  envelope.version = 1;
  envelope.checksum = oldPublicChecksum(envelope);
  return encodeCursorEnvelope(envelope);
}

function bitFlipCursorMac(cursor: string) {
  const envelope = decodeCursorEnvelope(cursor);
  const mac = String(envelope.mac);
  envelope.mac = `${mac[0] === "0" ? "1" : "0"}${mac.slice(1)}`;
  return encodeCursorEnvelope(envelope);
}

function forgeWithOldPublicChecksum(
  cursor: string,
  changes: Record<string, unknown>,
) {
  const envelope = { ...decodeCursorEnvelope(cursor), ...changes };
  envelope.mac = oldPublicChecksum(envelope);
  return encodeCursorEnvelope(envelope);
}

function oldPublicChecksum(envelope: Record<string, unknown>) {
  const legacyCore = {
    adminScope: envelope.adminScope,
    filterFingerprint: envelope.filterFingerprint,
    kind: envelope.kind,
    pageSize: envelope.pageSize,
    parentId: envelope.parentId,
    snapshotTimestamp: envelope.snapshotTimestamp,
    sortTimestamp: envelope.sortTimestamp,
    tieBreakerId: envelope.tieBreakerId,
  };
  return createHash("sha256")
    .update(`rezno-communications-cursor:${JSON.stringify(legacyCore)}`)
    .digest("hex");
}

function decodeCursorEnvelope(cursor: string) {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
}

function encodeCursorEnvelope(envelope: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
}
