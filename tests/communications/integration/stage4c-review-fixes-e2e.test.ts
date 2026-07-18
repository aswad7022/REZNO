import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import { Prisma } from "@prisma/client";

import { CommunicationDomainError } from "../../../features/communications/domain/errors";
import { setCommunicationCursorSigningSecretForTests } from "../../../features/communications/domain/cursor-signing";
import {
  createCampaign,
  getCampaignPage,
  previewCampaignAudience,
} from "../../../features/communications/services/campaigns";
import {
  DELIVERY_INSERT_CHUNK_SIZE,
  sendCampaignNow,
  setCommunicationSnapshotDiagnosticsTestHook,
  type SnapshotDiagnostics,
} from "../../../features/communications/services/dispatcher";
import {
  ENDPOINT_RESOLUTION_CHUNK_SIZE,
  setCommunicationEndpointDiagnosticsTestHook,
} from "../../../features/communications/services/endpoints";
import { getAttemptPage, getDeliveryPage } from "../../../features/communications/services/reporting";
import { prisma } from "../../../lib/db/prisma";
import {
  campaignInput,
  createCommunicationFixture,
  resetCommunicationTestDatabase,
} from "../helpers/fixture";
import {
  ROTATED_COMMUNICATION_CURSOR_SECRET,
  TEST_COMMUNICATION_CURSOR_SECRET,
} from "../helpers/cursor-secret";

function rejectsWith(code: string) {
  return (error: unknown) => error instanceof CommunicationDomainError && error.code === code;
}

function allCampaignInput(overrides: Record<string, unknown> = {}) {
  return campaignInput({
    audience: "ALL",
    targetPersonId: null,
    targetOrganizationId: null,
    channels: ["EMAIL", "SMS"],
    ...overrides,
  });
}

function forgeWithOldPublicChecksum(
  cursor: string,
  changes: Record<string, unknown>,
) {
  const envelope = {
    ...JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>,
    ...changes,
  };
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
  envelope.mac = createHash("sha256")
    .update(`rezno-communications-cursor:${JSON.stringify(legacyCore)}`)
    .digest("hex");
  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
}

test("Gate 4C review fixes are bounded and scope-exact in PostgreSQL", { concurrency: false }, async (t) => {
  setCommunicationCursorSigningSecretForTests(TEST_COMMUNICATION_CURSOR_SECRET);
  await resetCommunicationTestDatabase();
  const fixture = await createCommunicationFixture("gate4c-review");
  const endpointDiagnostics: Array<{
    endpointQueryCount: number;
    personCount: number;
    pushResolverCallCount: number;
    queryChunkCount: number;
    selectedChannels: string[];
  }> = [];
  setCommunicationEndpointDiagnosticsTestHook((diagnostics) => {
    endpointDiagnostics.push(diagnostics);
  });

  t.after(async () => {
    setCommunicationCursorSigningSecretForTests(undefined);
    setCommunicationEndpointDiagnosticsTestHook(undefined);
    setCommunicationSnapshotDiagnosticsTestHook(undefined);
    await resetCommunicationTestDatabase();
    await prisma.$disconnect();
  });

  let bulkCampaignId = "";
  let rollbackCampaignId = "";

  await t.test("5,000-Person previews and snapshot use five endpoint queries and ten delivery inserts", async () => {
    const existingPeople = await prisma.person.count();
    const remaining = 5_000 - existingPeople;
    assert.ok(remaining > 0);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
      SELECT 'gate4c-review-bulk-' || series,
             'Gate 4C bulk ' || series,
             'gate4c-review-bulk-' || series || '@rezno.invalid',
             TRUE,
             CURRENT_TIMESTAMP,
             CURRENT_TIMESTAMP
      FROM generate_series(1, ${remaining}) AS series
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "Person" (
        "id", "authUserId", "firstName", "phone", "phoneVerifiedAt",
        "isOnboarded", "status", "createdAt", "updatedAt"
      )
      SELECT md5('gate4c-review-person-' || series)::uuid,
             'gate4c-review-bulk-' || series,
             'Gate 4C bulk',
             '+964770' || lpad(series::text, 7, '0'),
             CURRENT_TIMESTAMP,
             TRUE,
             'ACTIVE'::"EntityStatus",
             CURRENT_TIMESTAMP,
             CURRENT_TIMESTAMP
      FROM generate_series(1, ${remaining}) AS series
    `);
    await prisma.$executeRaw(Prisma.sql`
      WITH numbered AS (
        SELECT "id", row_number() OVER (ORDER BY "id") AS position
        FROM "Person"
        WHERE "authUserId" NOT LIKE 'gate4c-review-bulk-%'
      )
      UPDATE "Person" AS person
      SET "deletedAt" = NULL,
          "isOnboarded" = TRUE,
          "phone" = '+964750' || lpad(numbered.position::text, 7, '0'),
          "phoneVerifiedAt" = CURRENT_TIMESTAMP,
          "status" = 'ACTIVE'::"EntityStatus"
      FROM numbered
      WHERE person."id" = numbered."id"
    `);
    await prisma.user.updateMany({ data: { emailVerified: true } });
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OutboundPreference" (
        "id", "personId", "version", "emailCategories", "smsCategories",
        "pushCategories", "createdAt", "updatedAt"
      )
      SELECT gen_random_uuid(), person."id", 1,
             ARRAY['ADMIN_ANNOUNCEMENT']::"NotificationCategory"[],
             ARRAY['ADMIN_ANNOUNCEMENT']::"NotificationCategory"[],
             ARRAY[]::"NotificationCategory"[],
             CURRENT_TIMESTAMP,
             CURRENT_TIMESTAMP
      FROM "Person" AS person
      ON CONFLICT ("personId") DO UPDATE
      SET "emailCategories" = EXCLUDED."emailCategories",
          "smsCategories" = EXCLUDED."smsCategories",
          "pushCategories" = EXCLUDED."pushCategories",
          "updatedAt" = CURRENT_TIMESTAMP
    `);
    assert.equal(await prisma.person.count({
      where: { deletedAt: null, isOnboarded: true, status: "ACTIVE" },
    }), 5_000);

    endpointDiagnostics.length = 0;
    const email = await previewCampaignAudience(fixture.actors.full, {
      audience: "ALL", targetPersonId: null, targetOrganizationId: null,
      channels: ["EMAIL"], category: "ADMIN_ANNOUNCEMENT", mandatory: false,
    });
    const sms = await previewCampaignAudience(fixture.actors.full, {
      audience: "ALL", targetPersonId: null, targetOrganizationId: null,
      channels: ["SMS"], category: "ADMIN_ANNOUNCEMENT", mandatory: false,
    });
    const combined = await previewCampaignAudience(fixture.actors.full, {
      audience: "ALL", targetPersonId: null, targetOrganizationId: null,
      channels: ["EMAIL", "SMS"], category: "ADMIN_ANNOUNCEMENT", mandatory: false,
    });
    for (const preview of [email, sms]) {
      assert.equal(preview.evaluated, 5_000);
      assert.equal(preview.tooLarge, false);
      assert.equal(preview.samplePersonIds.length, 5);
    }
    assert.deepEqual(email.channels.EMAIL, { eligible: 5_000, missingEndpoint: 0, suppressed: 0 });
    assert.deepEqual(sms.channels.SMS, { eligible: 5_000, missingEndpoint: 0, suppressed: 0 });
    assert.deepEqual(combined.channels.EMAIL, email.channels.EMAIL);
    assert.deepEqual(combined.channels.SMS, sms.channels.SMS);
    assert.deepEqual(endpointDiagnostics.map((item) => item.endpointQueryCount), [5, 5, 5]);
    assert.deepEqual(endpointDiagnostics.map((item) => item.queryChunkCount), [5, 5, 5]);
    assert.ok(endpointDiagnostics.every((item) => item.personCount === 5_000));
    assert.equal(Math.ceil(5_000 / ENDPOINT_RESOLUTION_CHUNK_SIZE), 5);

    const optionalPerson = await prisma.person.findFirstOrThrow({ orderBy: { id: "asc" } });
    await prisma.outboundPreference.update({
      where: { personId: optionalPerson.id }, data: { smsCategories: [] },
    });
    const optional = await previewCampaignAudience(fixture.actors.full, {
      audience: "ALL", targetPersonId: null, targetOrganizationId: null,
      channels: ["SMS"], category: "ADMIN_ANNOUNCEMENT", mandatory: false,
    });
    assert.deepEqual(optional.channels.SMS, { eligible: 4_999, missingEndpoint: 0, suppressed: 1 });
    const mandatory = await previewCampaignAudience(fixture.actors.full, {
      audience: "ALL", targetPersonId: null, targetOrganizationId: null,
      channels: ["SMS"], category: "ACCOUNT", mandatory: true,
    });
    assert.deepEqual(mandatory.channels.SMS, { eligible: 5_000, missingEndpoint: 0, suppressed: 0 });
    await prisma.outboundPreference.update({
      where: { personId: optionalPerson.id }, data: { smsCategories: ["ADMIN_ANNOUNCEMENT"] },
    });

    const endpointCases = await prisma.person.findMany({ orderBy: { id: "asc" }, take: 2 });
    await prisma.person.update({ where: { id: endpointCases[0]!.id }, data: { phone: null } });
    await prisma.person.update({ where: { id: endpointCases[1]!.id }, data: { phoneVerifiedAt: null } });
    await prisma.user.update({
      where: { id: endpointCases[0]!.authUserId }, data: { email: `invalid-${randomUUID()}` },
    });
    await prisma.user.update({
      where: { id: endpointCases[1]!.authUserId }, data: { emailVerified: false },
    });
    const missingSms = await previewCampaignAudience(fixture.actors.full, {
      audience: "ALL", targetPersonId: null, targetOrganizationId: null,
      channels: ["SMS"], category: "ADMIN_ANNOUNCEMENT", mandatory: false,
    });
    const invalidEmail = await previewCampaignAudience(fixture.actors.full, {
      audience: "ALL", targetPersonId: null, targetOrganizationId: null,
      channels: ["EMAIL"], category: "ADMIN_ANNOUNCEMENT", mandatory: false,
    });
    assert.deepEqual(missingSms.channels.SMS, { eligible: 4_998, missingEndpoint: 2, suppressed: 0 });
    assert.deepEqual(invalidEmail.channels.EMAIL, { eligible: 4_998, missingEndpoint: 2, suppressed: 0 });
    await prisma.person.update({
      where: { id: endpointCases[0]!.id }, data: { phone: "+9647510000001", phoneVerifiedAt: new Date() },
    });
    await prisma.person.update({
      where: { id: endpointCases[1]!.id }, data: { phone: "+9647510000002", phoneVerifiedAt: new Date() },
    });
    await prisma.user.update({
      where: { id: endpointCases[0]!.authUserId },
      data: { email: `gate4c-review-restored-${randomUUID()}@rezno.invalid`, emailVerified: true },
    });
    await prisma.user.update({
      where: { id: endpointCases[1]!.authUserId }, data: { emailVerified: true },
    });

    const created = await createCampaign(fixture.actors.full, allCampaignInput());
    bulkCampaignId = created.id;
    let snapshotDiagnostics: SnapshotDiagnostics | undefined;
    setCommunicationSnapshotDiagnosticsTestHook((diagnostics) => { snapshotDiagnostics = diagnostics; });
    const sendInput = {
      campaignId: created.id,
      expectedVersion: created.version,
      idempotencyKey: randomUUID(),
    };
    const sent = await sendCampaignNow(fixture.actors.full, sendInput);
    assert.equal(sent.counts.total, 10_000);
    assert.ok(snapshotDiagnostics);
    assert.deepEqual(snapshotDiagnostics, {
      deliveryInsertChunkCount: 10,
      deliveryRowCount: 10_000,
      elapsedMs: snapshotDiagnostics.elapsedMs,
      endpointQueryCount: 5,
      recipientCount: 5_000,
      selectedChannels: ["EMAIL", "SMS"],
    });
    assert.ok(snapshotDiagnostics.elapsedMs < 30_000, `snapshot diagnostic elapsed ${snapshotDiagnostics.elapsedMs}ms`);
    assert.equal(Math.ceil(10_000 / DELIVERY_INSERT_CHUNK_SIZE), 10);
    assert.equal(await prisma.outboundDelivery.count({ where: { campaignId: created.id } }), 10_000);
    const uniqueRows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT count(*) AS count
      FROM (
        SELECT "campaignId", "personId", "channel"
        FROM "OutboundDelivery"
        WHERE "campaignId" = ${created.id}::uuid
        GROUP BY "campaignId", "personId", "channel"
      ) AS unique_delivery
    `);
    assert.equal(Number(uniqueRows[0]?.count), 10_000);
    assert.deepEqual(await sendCampaignNow(fixture.actors.full, sendInput), sent);
    assert.equal(await prisma.outboundDelivery.count({ where: { campaignId: created.id } }), 10_000);

    const rollback = await createCampaign(fixture.actors.full, allCampaignInput({ channels: ["EMAIL"] }));
    rollbackCampaignId = rollback.id;
    setCommunicationSnapshotDiagnosticsTestHook(() => { throw new Error("rollback-after-bulk-insert"); });
    await assert.rejects(sendCampaignNow(fixture.actors.full, {
      campaignId: rollback.id,
      expectedVersion: rollback.version,
      idempotencyKey: randomUUID(),
    }), /rollback-after-bulk-insert/);
    setCommunicationSnapshotDiagnosticsTestHook(undefined);
    assert.equal(await prisma.outboundDelivery.count({ where: { campaignId: rollback.id } }), 0);
    assert.equal((await prisma.communicationCampaign.findUniqueOrThrow({ where: { id: rollback.id } })).status, "DRAFT");
  });

  await t.test("typed Campaign, Delivery, and Attempt cursors preserve snapshots and reject scope reuse", async () => {
    for (let index = 0; index < 5; index += 1) {
      await createCampaign(fixture.actors.full, allCampaignInput({ channels: ["IN_APP"] }));
    }

    const campaignCountAtSnapshot = await prisma.communicationCampaign.count();
    let campaignPage = await getCampaignPage(fixture.actors.full, { cursor: null, pageSize: 2, status: null });
    const campaignCursor = campaignPage.nextCursor;
    assert.ok(campaignCursor);
    const campaignIds = campaignPage.items.map((item) => item.id);
    const postSnapshotCampaign = await createCampaign(fixture.actors.full, allCampaignInput({ channels: ["IN_APP"] }));
    while (campaignPage.nextCursor) {
      campaignPage = await getCampaignPage(fixture.actors.full, {
        cursor: campaignPage.nextCursor, pageSize: 2, status: null,
      });
      campaignIds.push(...campaignPage.items.map((item) => item.id));
    }
    assert.equal(campaignIds.length, campaignCountAtSnapshot);
    assert.equal(new Set(campaignIds).size, campaignCountAtSnapshot);
    assert.equal(campaignIds.includes(postSnapshotCampaign.id), false);

    const filteredCampaigns = await getCampaignPage(fixture.actors.full, {
      cursor: null, pageSize: 1, status: "DRAFT",
    });
    assert.ok(filteredCampaigns.nextCursor);
    const filteredContinuation = await getCampaignPage(fixture.actors.full, {
      cursor: filteredCampaigns.nextCursor, pageSize: 1, status: "DRAFT",
    });
    assert.equal(filteredContinuation.items.every((item) => item.status === "DRAFT"), true);
    await assert.rejects(getCampaignPage(fixture.actors.full, {
      cursor: filteredCampaigns.nextCursor, pageSize: 1, status: null,
    }), rejectsWith("INVALID_CURSOR"));
    await assert.rejects(getCampaignPage(fixture.actors.full, {
      cursor: campaignCursor, pageSize: 50, status: null,
    }), rejectsWith("INVALID_CURSOR"));
    await assert.rejects(getCampaignPage(fixture.actors.view, {
      cursor: campaignCursor, pageSize: 2, status: null,
    }), rejectsWith("INVALID_CURSOR"));
    await assert.rejects(getCampaignPage(fixture.actors.full, {
      cursor: forgeWithOldPublicChecksum(campaignCursor, {
        filterFingerprint: "0".repeat(64),
      }),
      pageSize: 2,
      status: null,
    }), rejectsWith("INVALID_CURSOR"));
    setCommunicationCursorSigningSecretForTests(ROTATED_COMMUNICATION_CURSOR_SECRET);
    try {
      await assert.rejects(getCampaignPage(fixture.actors.full, {
        cursor: campaignCursor, pageSize: 2, status: null,
      }), rejectsWith("INVALID_CURSOR"));
    } finally {
      setCommunicationCursorSigningSecretForTests(TEST_COMMUNICATION_CURSOR_SECRET);
    }

    const viewPage = await getCampaignPage(fixture.actors.view, { cursor: null, pageSize: 1, status: null });
    assert.ok(viewPage.nextCursor);
    await prisma.adminAccess.update({
      where: { id: fixture.actors.view.adminAccessId! }, data: { status: "REVOKED" },
    });
    await assert.rejects(getCampaignPage(fixture.actors.view, {
      cursor: "malformed-before-authorization", pageSize: 1, status: null,
    }), rejectsWith("FORBIDDEN"));
    await prisma.adminAccess.update({
      where: { id: fixture.actors.view.adminAccessId! }, data: { status: "ACTIVE", permissions: [] },
    });
    await assert.rejects(getCampaignPage(fixture.actors.view, {
      cursor: viewPage.nextCursor, pageSize: 1, status: null,
    }), rejectsWith("FORBIDDEN"));
    await prisma.adminAccess.update({
      where: { id: fixture.actors.view.adminAccessId! },
      data: { permissions: ["NOTIFICATIONS_VIEW"] },
    });

    const deliveryCountAtSnapshot = await prisma.outboundDelivery.count({ where: { campaignId: bulkCampaignId } });
    let deliveryPage = await getDeliveryPage(fixture.actors.full, {
      campaignId: bulkCampaignId, cursor: null, pageSize: 50, status: null,
    });
    const deliveryCursor = deliveryPage.nextCursor;
    assert.ok(deliveryCursor);
    const deliveryIds = deliveryPage.items.map((item) => item.id);
    const latePerson = await prisma.person.findFirstOrThrow({ orderBy: { id: "asc" } });
    const lateDelivery = await prisma.outboundDelivery.create({
      data: {
        campaignId: bulkCampaignId,
        personId: latePerson.id,
        channel: "PUSH",
        locale: "EN",
        endpointType: "PUSH_TOKEN",
        status: "SUPPRESSED",
        suppressionReason: "MISSING_ENDPOINT",
      },
    });
    let deliveryPages = 1;
    while (deliveryPage.nextCursor) {
      deliveryPage = await getDeliveryPage(fixture.actors.full, {
        campaignId: bulkCampaignId, cursor: deliveryPage.nextCursor, pageSize: 50, status: null,
      });
      deliveryPages += 1;
      deliveryIds.push(...deliveryPage.items.map((item) => item.id));
    }
    assert.ok(deliveryPages >= 18);
    assert.equal(deliveryIds.length, deliveryCountAtSnapshot);
    assert.equal(new Set(deliveryIds).size, deliveryCountAtSnapshot);
    assert.equal(deliveryIds.includes(lateDelivery.id), false);

    const pending = await getDeliveryPage(fixture.actors.full, {
      campaignId: bulkCampaignId, cursor: null, pageSize: 20, status: "PENDING",
    });
    assert.ok(pending.nextCursor);
    const pendingNext = await getDeliveryPage(fixture.actors.full, {
      campaignId: bulkCampaignId, cursor: pending.nextCursor, pageSize: 20, status: "PENDING",
    });
    assert.equal(pendingNext.items.every((item) => item.status === "PENDING"), true);
    await assert.rejects(getDeliveryPage(fixture.actors.full, {
      campaignId: bulkCampaignId, cursor: pending.nextCursor, pageSize: 20, status: "SUPPRESSED",
    }), rejectsWith("INVALID_CURSOR"));
    await assert.rejects(getDeliveryPage(fixture.actors.full, {
      campaignId: rollbackCampaignId, cursor: deliveryCursor, pageSize: 50, status: null,
    }), rejectsWith("INVALID_CURSOR"));
    await assert.rejects(getDeliveryPage(fixture.actors.view, {
      campaignId: bulkCampaignId, cursor: deliveryCursor, pageSize: 50, status: null,
    }), rejectsWith("INVALID_CURSOR"));
    await assert.rejects(getDeliveryPage(fixture.actors.full, {
      campaignId: rollbackCampaignId,
      cursor: forgeWithOldPublicChecksum(deliveryCursor, { parentId: rollbackCampaignId }),
      pageSize: 50,
      status: null,
    }), rejectsWith("INVALID_CURSOR"));

    const attemptDelivery = await prisma.outboundDelivery.findFirstOrThrow({
      where: { campaignId: bulkCampaignId }, orderBy: { id: "asc" },
    });
    await prisma.outboundDeliveryAttempt.createMany({
      data: Array.from({ length: 4 }, (_, index) => ({
        attemptNumber: index + 1,
        claimOwner: "dispatcher:cursor-review",
        deliveryId: attemptDelivery.id,
        startedAt: new Date(`2026-07-19T10:${String(index).padStart(2, "0")}:00.000Z`),
      })),
    });
    let attemptPage = await getAttemptPage(fixture.actors.full, {
      deliveryId: attemptDelivery.id, cursor: null, pageSize: 1,
    });
    const attemptCursor = attemptPage.nextCursor;
    assert.ok(attemptCursor);
    const attemptIds = attemptPage.items.map((item) => item.id);
    const lateAttempt = await prisma.outboundDeliveryAttempt.create({
      data: {
        attemptNumber: 5,
        claimOwner: "dispatcher:cursor-review",
        deliveryId: attemptDelivery.id,
        startedAt: new Date("2026-07-19T11:00:00.000Z"),
      },
    });
    let attemptPages = 1;
    while (attemptPage.nextCursor) {
      attemptPage = await getAttemptPage(fixture.actors.full, {
        deliveryId: attemptDelivery.id, cursor: attemptPage.nextCursor, pageSize: 1,
      });
      attemptPages += 1;
      attemptIds.push(...attemptPage.items.map((item) => item.id));
    }
    assert.equal(attemptPages, 4);
    assert.equal(attemptIds.length, 4);
    assert.equal(new Set(attemptIds).size, 4);
    assert.equal(attemptIds.includes(lateAttempt.id), false);
    const otherDelivery = await prisma.outboundDelivery.findFirstOrThrow({
      where: { campaignId: bulkCampaignId, id: { not: attemptDelivery.id } },
    });
    await assert.rejects(getAttemptPage(fixture.actors.full, {
      deliveryId: otherDelivery.id, cursor: attemptCursor, pageSize: 1,
    }), rejectsWith("INVALID_CURSOR"));
    await assert.rejects(getAttemptPage(fixture.actors.full, {
      deliveryId: attemptDelivery.id, cursor: attemptCursor, pageSize: 2,
    }), rejectsWith("INVALID_CURSOR"));
    await assert.rejects(getAttemptPage(fixture.actors.full, {
      deliveryId: otherDelivery.id,
      cursor: forgeWithOldPublicChecksum(attemptCursor, { parentId: otherDelivery.id }),
      pageSize: 1,
    }), rejectsWith("INVALID_CURSOR"));
  });
});
