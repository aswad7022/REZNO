import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  DeterministicSinkProvider,
  setCommunicationTestProviderFactory,
  type OutboundProvider,
} from "../../../features/communications/providers/provider";
import {
  cancelCampaign,
  createCampaign,
  scheduleCampaign,
} from "../../../features/communications/services/campaigns";
import { sendCampaignNow } from "../../../features/communications/services/dispatcher";
import {
  triggerGate6CAutomation,
} from "../../../features/communications-payment-automation/services/admin";
import type { PlatformJobAdminContext } from "../../../features/platform-jobs/services/admin-context";
import { runPlatformWorkerBatch } from "../../../features/platform-jobs/services/worker";
import { prisma } from "../../../lib/db/prisma";
import {
  campaignInput,
  createCommunicationFixture,
  resetCommunicationTestDatabase,
} from "../../communications/helpers/fixture";

test("Gate 6C communication discovery and exact delivery use durable authority", { concurrency: false }, async (t) => {
  await resetCommunicationTestDatabase();
  const fixture = await createCommunicationFixture("gate6c-communications");
  await prisma.adminAccess.update({
    where: { id: fixture.actors.full.adminAccessId! },
    data: {
      permissions: [
        "PLATFORM_JOBS_VIEW",
        "PLATFORM_JOBS_MANAGE",
        "NOTIFICATIONS_VIEW",
        "NOTIFICATIONS_SEND",
        "COMMUNICATIONS_DISPATCH",
      ],
    },
  });
  const context: PlatformJobAdminContext = {
    adminAccessId: fixture.actors.full.adminAccessId,
    personId: fixture.actors.full.personId,
    source: "database",
    userId: fixture.actors.full.userId,
  };
  setCommunicationTestProviderFactory((channel) => new DeterministicSinkProvider(channel));

  t.after(async () => {
    setCommunicationTestProviderFactory(undefined);
    await resetCommunicationTestDatabase();
    await prisma.$disconnect();
  });

  await t.test("due campaign and delivery discovery are bounded, replay-safe, and exact", async () => {
    const campaign = await createCampaign(fixture.actors.full, campaignInput({
      channels: ["EMAIL"],
      targetPersonId: fixture.people.customer.person.id,
    }));
    const scheduledAt = new Date(Date.now() - 60_000);
    const scheduled = await scheduleCampaign(fixture.actors.full, {
      campaignId: campaign.id,
      expectedVersion: campaign.version,
      idempotencyKey: randomUUID(),
      scheduledAt: scheduledAt.toISOString(),
    }, new Date(scheduledAt.getTime() - 60_000));

    const triggerKey = randomUUID();
    const discovery = await triggerGate6CAutomation(context, {
      batchSize: 10,
      idempotencyKey: triggerKey,
      jobType: "COMMUNICATION_CAMPAIGN_DISCOVERY",
    });
    const replay = await triggerGate6CAutomation(context, {
      batchSize: 10,
      idempotencyKey: triggerKey,
      jobType: "COMMUNICATION_CAMPAIGN_DISCOVERY",
    });
    assert.equal(discovery.replay, false);
    assert.equal(replay.replay, true);

    await runOne(context);
    assert.equal(await prisma.platformJob.count({
      where: {
        jobType: "COMMUNICATION_CAMPAIGN_DISPATCH",
        payload: { equals: { campaignId: campaign.id, expectedVersion: scheduled.version } },
      },
    }), 1);
    await runOne(context);
    const delivery = await prisma.outboundDelivery.findFirstOrThrow({
      where: { campaignId: campaign.id, channel: "EMAIL" },
    });
    assert.equal(delivery.status, "PENDING");

    await triggerGate6CAutomation(context, {
      batchSize: 10,
      idempotencyKey: randomUUID(),
      jobType: "COMMUNICATION_DELIVERY_DISCOVERY",
    });
    await runOne(context);
    assert.equal(await prisma.platformJob.count({
      where: {
        jobType: "COMMUNICATION_DELIVERY_DISPATCH",
        payload: { equals: { deliveryId: delivery.id, expectedVersion: delivery.version } },
      },
    }), 1);
    await runOne(context);

    const accepted = await prisma.outboundDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
      include: { attempts: true },
    });
    assert.equal(accepted.status, "ACCEPTED");
    assert.equal(accepted.attempts.length, 1);
    assert.equal(accepted.attempts[0]?.outcome, "ACCEPTED");
    assert.equal(accepted.attempts[0]?.providerName, "rezno-deterministic-sink");
    const safeJobs = await prisma.platformJob.findMany({
      select: { payload: true, resultMetadata: true },
    });
    assert.doesNotMatch(JSON.stringify(safeJobs), /@rezno|Safe subject|\+964/u);
  });

  await t.test("cancelled campaigns create no exact dispatch work", async () => {
    const campaign = await createCampaign(fixture.actors.full, campaignInput({
      channels: ["IN_APP"],
      targetPersonId: fixture.people.customer.person.id,
    }));
    const scheduledAt = new Date(Date.now() - 60_000);
    const scheduled = await scheduleCampaign(fixture.actors.full, {
      campaignId: campaign.id,
      expectedVersion: campaign.version,
      idempotencyKey: randomUUID(),
      scheduledAt: scheduledAt.toISOString(),
    }, new Date(scheduledAt.getTime() - 60_000));
    await cancelCampaign(fixture.actors.full, {
      campaignId: campaign.id,
      expectedVersion: scheduled.version,
      idempotencyKey: randomUUID(),
      reason: "SUPERSEDED",
    });
    const discovery = await triggerGate6CAutomation(context, {
      batchSize: 10,
      idempotencyKey: randomUUID(),
      jobType: "COMMUNICATION_CAMPAIGN_DISCOVERY",
    });
    if (discovery.replay) throw new Error("A fresh Gate 6C trigger unexpectedly replayed.");
    await runOne(context);
    assert.equal(await prisma.platformJob.count({
      where: {
        jobType: "COMMUNICATION_CAMPAIGN_DISPATCH",
        parentJobId: discovery.jobId,
      },
    }), 0);
  });

  await t.test("permission revocation during provider work blocks publication", async () => {
    const campaign = await createCampaign(fixture.actors.full, campaignInput({
      channels: ["EMAIL"],
      targetPersonId: fixture.people.customer.person.id,
    }));
    await sendCampaignNow(fixture.actors.full, {
      campaignId: campaign.id,
      expectedVersion: campaign.version,
      idempotencyKey: randomUUID(),
    });
    const delivery = await prisma.outboundDelivery.findFirstOrThrow({
      where: { campaignId: campaign.id, channel: "EMAIL" },
    });
    let providerCalls = 0;
    setCommunicationTestProviderFactory((channel): OutboundProvider => {
      const provider = new DeterministicSinkProvider(channel);
      return {
        channel,
        send: async (message) => {
          providerCalls += 1;
          const result = await provider.send(message);
          await prisma.adminAccess.update({
            where: { id: fixture.actors.full.adminAccessId! },
            data: { status: "REVOKED" },
          });
          return result;
        },
      };
    });
    await triggerGate6CAutomation(context, {
      batchSize: 10,
      idempotencyKey: randomUUID(),
      jobType: "COMMUNICATION_DELIVERY_DISCOVERY",
    });
    await runOne(context);
    await assert.rejects(runOne(context));
    assert.equal(providerCalls, 1);
    const attempt = await prisma.outboundDeliveryAttempt.findFirstOrThrow({
      where: { deliveryId: delivery.id },
    });
    assert.notEqual(attempt.finishedAt, null);
    assert.equal(attempt.outcome, "TRANSIENT_FAILURE");
    assert.equal(attempt.providerName, null);
    assert.equal(attempt.providerMessageId, null);
    const recovered = await prisma.outboundDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
    });
    assert.equal(recovered.status, "RETRY_SCHEDULED");
    assert.equal(recovered.claimOwner, null);
    assert.equal(recovered.claimExpiresAt, null);
  });
});

function runOne(context: PlatformJobAdminContext) {
  return runPlatformWorkerBatch(context, {
    batchSize: 1,
    idempotencyKey: randomUUID(),
  });
}
