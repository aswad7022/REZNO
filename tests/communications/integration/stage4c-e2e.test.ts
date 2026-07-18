import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Prisma } from "@prisma/client";

import { CommunicationDomainError } from "../../../features/communications/domain/errors";
import { DeterministicSinkProvider, setCommunicationTestProviderFactory } from "../../../features/communications/providers/provider";
import { setCommunicationAuthorizationTestHook } from "../../../features/communications/services/admin-actor";
import {
  cancelCampaign,
  createCampaign,
  getCampaignDetail,
  getCampaignPage,
  previewCampaignAudience,
  scheduleCampaign,
  updateCampaign,
} from "../../../features/communications/services/campaigns";
import {
  claimDueDeliveries,
  manuallyDispatchDue,
  processClaimedDeliveries,
  releaseExpiredClaims,
  sendCampaignNow,
} from "../../../features/communications/services/dispatcher";
import { setCommunicationTestPushEndpointResolver } from "../../../features/communications/services/endpoints";
import { getOutboundPreferences, updateOutboundPreferences } from "../../../features/communications/services/preferences";
import { getAttemptPage, getDeliveryPage } from "../../../features/communications/services/reporting";
import { prisma } from "../../../lib/db/prisma";
import {
  campaignInput,
  createCommunicationFixture,
  resetCommunicationTestDatabase,
} from "../helpers/fixture";

function rejectsWith(code: string) {
  return (error: unknown) => error instanceof CommunicationDomainError && error.code === code;
}

test("Gate 4C campaigns, authorization, snapshot, and deterministic delivery are PostgreSQL exact", { concurrency: false }, async (t) => {
  await resetCommunicationTestDatabase();
  const fixture = await createCommunicationFixture();
  setCommunicationTestPushEndpointResolver((personIds) => new Map(
    personIds.map((personId) => [personId, `test-push:${personId}`]),
  ));
  setCommunicationTestProviderFactory((channel) => new DeterministicSinkProvider(channel));

  t.after(async () => {
    setCommunicationAuthorizationTestHook(undefined);
    setCommunicationTestProviderFactory(undefined);
    setCommunicationTestPushEndpointResolver(undefined);
    await resetCommunicationTestDatabase();
    await prisma.$disconnect();
  });

  await t.test("create/update/schedule are UUID-idempotent and versioned", async () => {
    const raw = campaignInput({ targetPersonId: fixture.people.customer.person.id });
    const created = await createCampaign(fixture.actors.full, raw);
    const replay = await createCampaign(fixture.actors.full, raw);
    assert.deepEqual(replay, created);
    assert.equal(await prisma.communicationCampaign.count({ where: { id: created.id } }), 1);
    assert.equal(await prisma.communicationCampaignMutation.count({ where: { campaignId: created.id } }), 1);
    assert.equal(await prisma.adminAuditLog.count({ where: { targetId: created.id } }), 1);
    await assert.rejects(
      createCampaign(fixture.actors.full, { ...raw, priority: "IMPORTANT" }),
      rejectsWith("IDEMPOTENCY_CONFLICT"),
    );

    const updated = await updateCampaign(fixture.actors.full, {
      ...raw,
      campaignId: created.id,
      expectedVersion: created.version,
      idempotencyKey: randomUUID(),
      priority: "IMPORTANT",
    });
    assert.equal(updated.version, 2);
    await assert.rejects(updateCampaign(fixture.actors.full, {
      ...raw,
      campaignId: created.id,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
    }), rejectsWith("STALE_VERSION"));

    const scheduled = await scheduleCampaign(fixture.actors.full, {
      campaignId: created.id,
      expectedVersion: updated.version,
      idempotencyKey: randomUUID(),
      scheduledAt: "2026-08-01T12:00:00.000Z",
    }, new Date("2026-07-18T12:00:00.000Z"));
    assert.equal(scheduled.status, "SCHEDULED");
    assert.equal(scheduled.scheduledAt, "2026-08-01T12:00:00.000Z");
  });

  await t.test("view-only reads but cannot mutate; revoked Admin fails inside transaction", async () => {
    const page = await getCampaignPage(fixture.actors.view, { cursor: null, pageSize: 10, status: null });
    assert.ok(page.items.length > 0);
    await assert.rejects(createCampaign(fixture.actors.view, campaignInput({ targetPersonId: fixture.people.customer.person.id })), rejectsWith("FORBIDDEN"));
    await assert.rejects(getCampaignPage(fixture.actors.revoked, { cursor: null, pageSize: 10, status: null }), rejectsWith("FORBIDDEN"));
  });

  await t.test("preferences are Person-owned, exact replay, conservative, and endpoint-aware", async () => {
    const context = { personId: fixture.people.customer.person.id, userId: fixture.people.customer.userId };
    const before = await getOutboundPreferences(context);
    assert.equal(before.endpoints.EMAIL.eligible, true);
    assert.equal(before.endpoints.SMS.eligible, false);
    const key = randomUUID();
    const input = {
      expectedVersion: before.version,
      idempotencyKey: key,
      categories: { EMAIL: ["ADMIN_ANNOUNCEMENT"], SMS: [], PUSH: ["MESSAGES"] },
    };
    const updated = await updateOutboundPreferences(context, input);
    const replay = await updateOutboundPreferences(context, input);
    assert.deepEqual(replay, updated);
    await assert.rejects(updateOutboundPreferences(context, {
      ...input,
      categories: { EMAIL: [], SMS: [], PUSH: [] },
    }), rejectsWith("IDEMPOTENCY_CONFLICT"));
  });

  await t.test("preview is bounded and never returns contacts", async () => {
    const preview = await previewCampaignAudience(fixture.actors.full, {
      audience: "USER",
      targetPersonId: fixture.people.customer.person.id,
      targetOrganizationId: null,
      channels: ["IN_APP", "EMAIL", "SMS", "PUSH"],
      category: "ADMIN_ANNOUNCEMENT",
      mandatory: false,
    });
    assert.equal(preview.evaluated, 1);
    assert.deepEqual(preview.samplePersonIds, [fixture.people.customer.person.id]);
    assert.doesNotMatch(JSON.stringify(preview), /@rezno|\+964/);
  });

  await t.test("BUSINESS, BUSINESS_OWNERS, RESTAURANTS, and CUSTOMERS use current role semantics", async () => {
    const business = await previewCampaignAudience(fixture.actors.full, {
      audience: "BUSINESS",
      targetPersonId: null,
      targetOrganizationId: fixture.organization.id,
      channels: ["IN_APP"],
      category: "ADMIN_ANNOUNCEMENT",
      mandatory: false,
    });
    assert.equal(business.evaluated, 2);
    const owners = await previewCampaignAudience(fixture.actors.full, {
      audience: "BUSINESS_OWNERS",
      targetPersonId: null,
      targetOrganizationId: null,
      channels: ["IN_APP"],
      category: "ADMIN_ANNOUNCEMENT",
      mandatory: false,
    });
    assert.equal(owners.evaluated, 1);
    const restaurants = await previewCampaignAudience(fixture.actors.full, {
      audience: "RESTAURANTS",
      targetPersonId: null,
      targetOrganizationId: null,
      channels: ["IN_APP"],
      category: "ADMIN_ANNOUNCEMENT",
      mandatory: false,
    });
    assert.equal(restaurants.evaluated, 2);
    const customers = await previewCampaignAudience(fixture.actors.full, {
      audience: "CUSTOMERS",
      targetPersonId: null,
      targetOrganizationId: null,
      channels: ["IN_APP"],
      category: "ADMIN_ANNOUNCEMENT",
      mandatory: false,
    });
    assert.ok(customers.evaluated >= 10);
    assert.ok(customers.inactiveOrRevoked >= 1);
    await prisma.organizationMember.update({
      where: { id: fixture.members.manager.member.id },
      data: { status: "INACTIVE" },
    });
    const revoked = await previewCampaignAudience(fixture.actors.full, {
      audience: "BUSINESS",
      targetPersonId: null,
      targetOrganizationId: fixture.organization.id,
      channels: ["IN_APP"],
      category: "ADMIN_ANNOUNCEMENT",
      mandatory: false,
    });
    assert.equal(revoked.channels.IN_APP?.eligible, 1);
    await prisma.organizationMember.update({
      where: { id: fixture.members.manager.member.id },
      data: { status: "ACTIVE" },
    });
  });

  await t.test("concurrent send-now requests converge on one immutable snapshot", async () => {
    const created = await createCampaign(fixture.actors.full, campaignInput({
      targetPersonId: fixture.people.customer.person.id,
      channels: ["IN_APP"],
    }));
    const request = {
      campaignId: created.id,
      expectedVersion: created.version,
      idempotencyKey: randomUUID(),
    };
    const [left, right] = await Promise.all([
      sendCampaignNow(fixture.actors.full, request),
      sendCampaignNow(fixture.actors.full, request),
    ]);
    assert.deepEqual(left, right);
    assert.equal(await prisma.notification.count({ where: { sourceId: created.id } }), 1);
    assert.equal(await prisma.communicationCampaignMutation.count({
      where: { campaignId: created.id, action: "COMMUNICATION_CAMPAIGN_SEND_NOW" },
    }), 1);
  });

  await t.test("manual due dispatch returns the exact stored final result on replay", async () => {
    const created = await createCampaign(fixture.actors.full, campaignInput({
      targetPersonId: fixture.people.customer.person.id,
      channels: ["IN_APP"],
    }));
    await scheduleCampaign(fixture.actors.full, {
      campaignId: created.id,
      expectedVersion: created.version,
      idempotencyKey: randomUUID(),
      scheduledAt: "2026-07-18T12:01:00.000Z",
    }, new Date("2026-07-18T12:00:00.000Z"));
    const input = {
      idempotencyKey: randomUUID(),
      batchSize: 10,
      claimOwner: "dispatcher:manual-replay",
    };
    const first = await manuallyDispatchDue(fixture.actors.full, input, new Date("2026-07-18T12:02:00.000Z"));
    const replay = await manuallyDispatchDue(fixture.actors.full, input, new Date("2026-07-18T12:03:00.000Z"));
    assert.equal(first.campaignsStarted, 1);
    assert.deepEqual(replay, first);
  });

  await t.test("send-now makes one Gate 4A Notification and one immutable delivery identity", async () => {
    await prisma.outboundPreference.update({
      where: { personId: fixture.people.customer.person.id },
      data: { pushCategories: ["ADMIN_ANNOUNCEMENT"] },
    });
    const created = await createCampaign(fixture.actors.full, campaignInput({
      targetPersonId: fixture.people.customer.person.id,
      channels: ["IN_APP", "EMAIL", "PUSH"],
    }));
    const key = randomUUID();
    const sent = await sendCampaignNow(fixture.actors.full, {
      campaignId: created.id,
      expectedVersion: created.version,
      idempotencyKey: key,
    });
    const replay = await sendCampaignNow(fixture.actors.full, {
      campaignId: created.id,
      expectedVersion: created.version,
      idempotencyKey: key,
    });
    assert.deepEqual(replay, sent);
    assert.equal(await prisma.notification.count({ where: { sourceId: created.id } }), 1);
    assert.equal(await prisma.outboundDelivery.count({ where: { campaignId: created.id } }), 2);
    assert.equal(await prisma.outboundDelivery.count({ where: { campaignId: created.id, channel: "IN_APP" } }), 0);
    await assert.rejects(updateCampaign(fixture.actors.full, {
      ...campaignInput({ targetPersonId: fixture.people.customer.person.id }),
      campaignId: created.id,
      expectedVersion: sent.version,
      idempotencyKey: randomUUID(),
    }), rejectsWith("CAMPAIGN_NOT_EDITABLE"));

    const claimed = await Promise.all([
      claimDueDeliveries("dispatcher:concurrency-a", 50),
      claimDueDeliveries("dispatcher:concurrency-b", 50),
    ]);
    assert.equal(new Set(claimed.flat()).size, claimed.flat().length);
    for (const [index, ids] of claimed.entries()) {
      await processClaimedDeliveries(`dispatcher:concurrency-${index === 0 ? "a" : "b"}`, ids);
    }
    assert.equal(await prisma.outboundDeliveryAttempt.count({ where: { delivery: { campaignId: created.id } } }), 2);
    const detail = await getCampaignDetail(fixture.actors.full, created.id);
    assert.equal(detail.status, "COMPLETED");
    assert.equal(detail.counts.accepted, 2);
    assert.doesNotMatch(JSON.stringify(await getDeliveryPage(fixture.actors.full, {
      campaignId: created.id, cursor: null, pageSize: 20, status: null,
    })), /@rezno|test-push:/);
  });

  await t.test("transient failure retries with the same delivery and permanent failure does not retry", async () => {
    setCommunicationTestProviderFactory((channel) => new DeterministicSinkProvider(channel, "TRANSIENT_FAILURE"));
    const created = await createCampaign(fixture.actors.full, campaignInput({
      targetPersonId: fixture.people.customer.person.id,
      channels: ["EMAIL"],
    }));
    await sendCampaignNow(fixture.actors.full, {
      campaignId: created.id,
      expectedVersion: created.version,
      idempotencyKey: randomUUID(),
    });
    const claimed = await claimDueDeliveries("dispatcher:transient", 10);
    const result = await processClaimedDeliveries("dispatcher:transient", claimed, new Date("2026-07-18T13:00:00.000Z"));
    assert.equal(result.retryScheduled, 1);
    const delivery = await prisma.outboundDelivery.findFirstOrThrow({ where: { campaignId: created.id } });
    assert.equal(delivery.status, "RETRY_SCHEDULED");
    assert.equal(delivery.attemptCount, 1);

    await prisma.outboundDelivery.update({
      where: { id: delivery.id },
      data: { nextAttemptAt: new Date("2026-07-18T13:01:00.000Z") },
    });
    setCommunicationTestProviderFactory((channel) => new DeterministicSinkProvider(channel, "PERMANENT_FAILURE"));
    const retryClaim = await claimDueDeliveries("dispatcher:permanent", 10, new Date("2026-07-18T13:02:00.000Z"));
    await processClaimedDeliveries("dispatcher:permanent", retryClaim, new Date("2026-07-18T13:02:00.000Z"));
    const failed = await prisma.outboundDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    assert.equal(failed.status, "PERMANENT_FAILURE");
    assert.equal(failed.attemptCount, 2);
    const attempts = await getAttemptPage(fixture.actors.full, { deliveryId: delivery.id, cursor: null, pageSize: 20 });
    assert.equal(attempts.items.length, 2);
    assert.equal(attempts.items.some((attempt) => JSON.stringify(attempt).includes("@rezno")), false);
  });

  await t.test("pre-claim preference revocation suppresses without a provider call", async () => {
    setCommunicationTestProviderFactory((channel) => new DeterministicSinkProvider(channel));
    const created = await createCampaign(fixture.actors.full, campaignInput({
      targetPersonId: fixture.people.customer.person.id,
      channels: ["EMAIL"],
    }));
    await sendCampaignNow(fixture.actors.full, {
      campaignId: created.id,
      expectedVersion: created.version,
      idempotencyKey: randomUUID(),
    });
    await prisma.outboundPreference.update({
      where: { personId: fixture.people.customer.person.id },
      data: { emailCategories: [], version: { increment: 1 } },
    });
    const claimed = await claimDueDeliveries("dispatcher:preference-recheck", 10);
    const result = await processClaimedDeliveries("dispatcher:preference-recheck", claimed);
    assert.equal(result.suppressed, 1);
    assert.equal(await prisma.outboundDeliveryAttempt.count({ where: { delivery: { campaignId: created.id } } }), 0);
  });

  await t.test("unsafe provider metadata is replaced by a bounded generic classification", async () => {
    await prisma.outboundPreference.update({
      where: { personId: fixture.people.customer.person.id },
      data: { emailCategories: ["ADMIN_ANNOUNCEMENT"] },
    });
    setCommunicationTestProviderFactory((channel) => ({
      channel,
      async send() {
        return {
          outcome: "TRANSIENT_FAILURE",
          providerName: "raw@example.invalid",
          providerMessageId: "raw endpoint@example.invalid",
          retryable: true,
          safeCode: "upstream raw response with spaces",
        };
      },
    }));
    const created = await createCampaign(fixture.actors.full, campaignInput({
      targetPersonId: fixture.people.customer.person.id,
      channels: ["EMAIL"],
    }));
    await sendCampaignNow(fixture.actors.full, {
      campaignId: created.id,
      expectedVersion: created.version,
      idempotencyKey: randomUUID(),
    });
    const claimed = await claimDueDeliveries("dispatcher:provider-sanitize", 1);
    const result = await processClaimedDeliveries("dispatcher:provider-sanitize", claimed);
    assert.equal(result.retryScheduled, 1);
    const delivery = await prisma.outboundDelivery.findFirstOrThrow({ where: { campaignId: created.id } });
    assert.equal(delivery.providerName, "provider-adapter");
    assert.equal(delivery.providerMessageId, null);
    assert.equal(delivery.lastProviderCode, "INVALID_PROVIDER_RESULT");
    assert.doesNotMatch(JSON.stringify(delivery), /raw@example|upstream raw/);
    setCommunicationTestProviderFactory((channel) => new DeterministicSinkProvider(channel));
  });

  await t.test("mandatory ACCOUNT bypasses preference but never endpoint verification", async () => {
    const mandatory = await createCampaign(fixture.actors.full, campaignInput({
      targetPersonId: fixture.people.customer.person.id,
      channels: ["EMAIL"],
      category: "ACCOUNT",
      mandatory: true,
    }));
    await sendCampaignNow(fixture.actors.full, {
      campaignId: mandatory.id,
      expectedVersion: mandatory.version,
      idempotencyKey: randomUUID(),
    });
    assert.equal(await prisma.outboundDelivery.count({ where: { campaignId: mandatory.id, status: "PENDING" } }), 1);

    const missing = await createCampaign(fixture.actors.full, campaignInput({
      targetPersonId: fixture.people.missingEmail.person.id,
      channels: ["EMAIL"],
      category: "ACCOUNT",
      mandatory: true,
    }));
    await sendCampaignNow(fixture.actors.full, {
      campaignId: missing.id,
      expectedVersion: missing.version,
      idempotencyKey: randomUUID(),
    });
    assert.equal(await prisma.outboundDelivery.count({ where: { campaignId: missing.id, status: "SUPPRESSED" } }), 1);

    const mandatoryClaims = await claimDueDeliveries("dispatcher:mandatory-account", 10);
    assert.equal(mandatoryClaims.length, 1);
    await processClaimedDeliveries("dispatcher:mandatory-account", mandatoryClaims);
  });

  await t.test("cancel stops unclaimed work and preserves completed attempt rows", async () => {
    await prisma.outboundPreference.update({
      where: { personId: fixture.people.customer.person.id },
      data: { emailCategories: ["ADMIN_ANNOUNCEMENT"] },
    });
    const created = await createCampaign(fixture.actors.full, campaignInput({
      targetPersonId: fixture.people.customer.person.id,
      channels: ["EMAIL"],
    }));
    const sent = await sendCampaignNow(fixture.actors.full, {
      campaignId: created.id,
      expectedVersion: created.version,
      idempotencyKey: randomUUID(),
    });
    const cancelled = await cancelCampaign(fixture.actors.full, {
      campaignId: created.id,
      expectedVersion: sent.version,
      idempotencyKey: randomUUID(),
      reason: "Gate 4C cancellation proof",
    });
    assert.equal(cancelled.status, "CANCELLED");
    assert.equal(await prisma.outboundDelivery.count({ where: { campaignId: created.id, status: "CANCELLED" } }), 1);
    assert.deepEqual(await claimDueDeliveries("dispatcher:cancelled", 10), []);
  });

  await t.test("expired claim recovery is bounded and safe", async () => {
    const created = await createCampaign(fixture.actors.full, campaignInput({ targetPersonId: fixture.people.customer.person.id, channels: ["EMAIL"] }));
    await sendCampaignNow(fixture.actors.full, { campaignId: created.id, expectedVersion: created.version, idempotencyKey: randomUUID() });
    const claimAt = new Date(Date.now() + 1_000);
    const claimed = await claimDueDeliveries("dispatcher:expire-proof", 1, claimAt);
    assert.equal(claimed.length, 1);
    assert.equal(await releaseExpiredClaims(new Date(claimAt.getTime() + 6 * 60_000)), 1);
    const recovered = await prisma.outboundDelivery.findUniqueOrThrow({ where: { id: claimed[0] } });
    assert.equal(recovered.status, "RETRY_SCHEDULED");
  });

  await t.test("missing endpoints suppress and an unconfigured production provider fails closed", async () => {
    await prisma.outboundPreference.create({
      data: {
        personId: fixture.people.missingEmail.person.id,
        emailCategories: ["ADMIN_ANNOUNCEMENT"],
      },
    });
    const missing = await createCampaign(fixture.actors.full, campaignInput({
      targetPersonId: fixture.people.missingEmail.person.id,
      channels: ["EMAIL"],
    }));
    await sendCampaignNow(fixture.actors.full, {
      campaignId: missing.id,
      expectedVersion: missing.version,
      idempotencyKey: randomUUID(),
    });
    const missingDelivery = await prisma.outboundDelivery.findFirstOrThrow({ where: { campaignId: missing.id } });
    assert.equal(missingDelivery.status, "SUPPRESSED");
    assert.equal(missingDelivery.suppressionReason, "UNVERIFIED_ENDPOINT");

    await prisma.outboundPreference.update({
      where: { personId: fixture.people.customer.person.id },
      data: { emailCategories: ["ADMIN_ANNOUNCEMENT"] },
    });
    setCommunicationTestProviderFactory(undefined);
    const unconfigured = await createCampaign(fixture.actors.full, campaignInput({
      targetPersonId: fixture.people.customer.person.id,
      channels: ["EMAIL"],
    }));
    await sendCampaignNow(fixture.actors.full, {
      campaignId: unconfigured.id,
      expectedVersion: unconfigured.version,
      idempotencyKey: randomUUID(),
    });
    const claimed = await claimDueDeliveries("dispatcher:not-configured", 10);
    const result = await processClaimedDeliveries("dispatcher:not-configured", claimed);
    assert.equal(result.permanentFailure, 1);
    const failed = await prisma.outboundDelivery.findFirstOrThrow({ where: { campaignId: unconfigured.id } });
    assert.equal(failed.status, "PERMANENT_FAILURE");
    assert.equal(failed.lastProviderCode, "PROVIDER_NOT_CONFIGURED");
    setCommunicationTestProviderFactory((channel) => new DeterministicSinkProvider(channel));
  });

  await t.test("audit and mutation results contain no campaign body or contact", async () => {
    const rows = await prisma.adminAuditLog.findMany({ where: { targetType: "CommunicationCampaign" } });
    const serialized = JSON.stringify(rows);
    assert.doesNotMatch(serialized, /Safe content|محتوى آمن|@rezno\.invalid|\+964/);
    assert.equal(rows.every((row) => Boolean(row.idempotencyKey && row.requestHash && row.result)), true);
  });

  await t.test("representative Gate 4C indexes produce PostgreSQL plans", async () => {
    const plans = await Promise.all([
      prisma.$queryRaw<Array<{ "QUERY PLAN": string }>>(Prisma.sql`EXPLAIN SELECT "id" FROM "CommunicationCampaign" ORDER BY "createdAt" DESC, "id" DESC LIMIT 20`),
      prisma.$queryRaw<Array<{ "QUERY PLAN": string }>>(Prisma.sql`EXPLAIN SELECT "id" FROM "CommunicationCampaign" WHERE "status" = 'SCHEDULED' ORDER BY "scheduledAt", "id" LIMIT 10`),
      prisma.$queryRaw<Array<{ "QUERY PLAN": string }>>(Prisma.sql`EXPLAIN SELECT "id" FROM "OutboundDelivery" WHERE "status" = 'RETRY_SCHEDULED' AND "nextAttemptAt" <= now() ORDER BY "nextAttemptAt", "id" LIMIT 50`),
      prisma.$queryRaw<Array<{ "QUERY PLAN": string }>>(Prisma.sql`EXPLAIN SELECT "id" FROM "OutboundDelivery" WHERE "status" = 'CLAIMED' AND "claimExpiresAt" <= now() ORDER BY "claimExpiresAt", "id" LIMIT 50`),
      prisma.$queryRaw<Array<{ "QUERY PLAN": string }>>(Prisma.sql`EXPLAIN SELECT "id" FROM "OutboundDelivery" WHERE "campaignId" = ${fixture.organization.id}::uuid ORDER BY "createdAt" DESC, "id" DESC LIMIT 20`),
      prisma.$queryRaw<Array<{ "QUERY PLAN": string }>>(Prisma.sql`EXPLAIN SELECT "id" FROM "OutboundDelivery" WHERE "campaignId" = ${fixture.organization.id}::uuid AND "status" = 'SUPPRESSED' ORDER BY "createdAt" DESC, "id" DESC LIMIT 20`),
      prisma.$queryRaw<Array<{ "QUERY PLAN": string }>>(Prisma.sql`EXPLAIN SELECT "id" FROM "OutboundDeliveryAttempt" WHERE "deliveryId" = ${fixture.organization.id}::uuid ORDER BY "createdAt" DESC, "id" DESC LIMIT 20`),
      prisma.$queryRaw<Array<{ "QUERY PLAN": string }>>(Prisma.sql`EXPLAIN SELECT "status", count(*) FROM "OutboundDelivery" WHERE "campaignId" = ${fixture.organization.id}::uuid GROUP BY "status"`),
      prisma.$queryRaw<Array<{ "QUERY PLAN": string }>>(Prisma.sql`EXPLAIN SELECT "id" FROM "OutboundPreference" WHERE "personId" = ${fixture.people.customer.person.id}::uuid`),
      prisma.$queryRaw<Array<{ "QUERY PLAN": string }>>(Prisma.sql`EXPLAIN SELECT person."id" FROM "Person" person JOIN "user" auth_user ON auth_user."id" = person."authUserId" WHERE person."id" = ${fixture.people.customer.person.id}::uuid AND auth_user."emailVerified" = TRUE`),
      prisma.$queryRaw<Array<{ "QUERY PLAN": string }>>(Prisma.sql`EXPLAIN SELECT membership."personId" FROM "OrganizationMember" membership JOIN "Organization" organization ON organization."id" = membership."organizationId" JOIN "Role" role ON role."id" = membership."roleId" WHERE membership."organizationId" = ${fixture.organization.id}::uuid AND membership."status" = 'ACTIVE' AND membership."deletedAt" IS NULL AND organization."status" = 'ACTIVE' AND role."systemRole" IN ('OWNER', 'MANAGER', 'RECEPTIONIST') LIMIT 5001`),
      prisma.$queryRaw<Array<{ "QUERY PLAN": string }>>(Prisma.sql`EXPLAIN SELECT "id" FROM "Person" WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL AND "displayName" ILIKE 'gate4c%' ORDER BY "firstName", "id" LIMIT 20`),
    ]);
    assert.equal(plans.length, 12);
    assert.equal(plans.every((plan) => plan.length > 0), true);
    assert.doesNotMatch(JSON.stringify(plans), /password|postgresql:\/\//i);
  });
});
