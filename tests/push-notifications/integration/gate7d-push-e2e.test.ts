import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { resolvePersonEndpoint } from "../../../features/communications/services/endpoints";
import { PushNotificationDomainError } from "../../../features/push-notifications/domain/errors";
import {
  DevicePushProvider,
  setPushTestNativeTransport,
} from "../../../features/push-notifications/providers/native";
import {
  registerPushInstallation,
  revokePushInstallation,
} from "../../../features/push-notifications/services/installations";
import { ingestPushProviderReceipts } from "../../../features/push-notifications/services/receipts";
import { prisma } from "../../../lib/db/prisma";

process.env.REZNO_PUSH_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");

test("Gate 7D device registration, fanout and receipts are PostgreSQL exact", {
  concurrency: false,
}, async (t) => {
  await reset();
  const ownerA = await identity("gate7d-owner-a");
  const ownerB = await identity("gate7d-owner-b");
  const installationId = randomUUID();
  const secret = "A".repeat(43);
  const registrationKey = randomUUID();
  const registration = input({
    idempotencyKey: registrationKey,
    installationId,
    installationSecret: secret,
    operationGeneration: 1,
    token: "fcm-token-a-12345678901234567890",
  });

  t.after(async () => {
    setPushTestNativeTransport(undefined);
    await reset();
    await prisma.$disconnect();
  });

  await t.test("registration, replay, rotation, account switch and revocation are fenced", async () => {
    const created = await registerPushInstallation(ownerA, registration);
    const replay = await registerPushInstallation(ownerA, registration);
    assert.equal(created.tokenVersion, 1);
    assert.equal(replay.replayed, true);
    assert.equal(await prisma.pushInstallation.count(), 1);
    assert.equal(await prisma.pushInstallationMutation.count(), 1);
    await assert.rejects(
      registerPushInstallation(ownerA, {
        ...registration,
        token: "fcm-token-conflict-123456789012345",
      }),
      (error) => error instanceof PushNotificationDomainError
        && error.code === "IDEMPOTENCY_CONFLICT",
    );

    const rotated = await registerPushInstallation(ownerA, input({
      installationId,
      installationSecret: secret,
      operationGeneration: 2,
      token: "fcm-token-b-12345678901234567890",
    }));
    assert.equal(rotated.tokenVersion, 2);

    const transferred = await registerPushInstallation(ownerB, input({
      installationId,
      installationSecret: secret,
      operationGeneration: 3,
      token: "fcm-token-b-12345678901234567890",
    }));
    assert.equal(transferred.tokenVersion, 2);
    const stored = await prisma.pushInstallation.findUniqueOrThrow({
      where: { installationId },
    });
    assert.equal(stored.personId, ownerB.personId);
    assert.equal(stored.tokenCiphertext.includes("fcm-token"), false);
    await assert.rejects(
      registerPushInstallation(ownerB, input({
        installationId,
        installationSecret: "B".repeat(43),
        operationGeneration: 4,
        token: "fcm-token-c-12345678901234567890",
      })),
      (error) => error instanceof PushNotificationDomainError
        && error.code === "INSTALLATION_OWNERSHIP_MISMATCH",
    );

    const revokeKey = randomUUID();
    const revoked = await revokePushInstallation(ownerB, {
      idempotencyKey: revokeKey,
      installationId,
      installationSecret: secret,
      operationGeneration: 4,
    });
    const revokeReplay = await revokePushInstallation(ownerB, {
      idempotencyKey: revokeKey,
      installationId,
      installationSecret: secret,
      operationGeneration: 4,
    });
    assert.equal(revoked.revoked, true);
    assert.equal(revokeReplay.replayed, true);
    const revokedInstallation = await prisma.pushInstallation.findUniqueOrThrow({
      where: { installationId },
    });
    assert.equal(revokedInstallation.status, "REVOKED");
    assert.match(revokedInstallation.tokenCiphertext, /^deleted\.v1\./);
    assert.notEqual(revokedInstallation.tokenFingerprint, stored.tokenFingerprint);

    const fencedInstallationId = randomUUID();
    const fencedSecret = "D".repeat(43);
    await revokePushInstallation(ownerA, {
      idempotencyKey: randomUUID(),
      installationId: fencedInstallationId,
      installationSecret: fencedSecret,
      operationGeneration: 2,
    });
    await assert.rejects(
      registerPushInstallation(ownerA, input({
        installationId: fencedInstallationId,
        installationSecret: fencedSecret,
        operationGeneration: 1,
      })),
      (error) => error instanceof PushNotificationDomainError
        && error.code === "STALE_OPERATION",
    );
  });

  await t.test("multiple active devices fan out once without exposing tokens", async () => {
    await registerPushInstallation(ownerA, input({
      installationId,
      installationSecret: secret,
      operationGeneration: 5,
      token: "fcm-token-d-12345678901234567890",
    }));
    await registerPushInstallation(ownerA, input({
      installationId: randomUUID(),
      installationSecret: "C".repeat(43),
      token: "fcm-token-e-12345678901234567890",
    }));
    await prisma.outboundPreference.create({
      data: {
        personId: ownerA.personId,
        pushCategories: ["ACCOUNT"],
      },
    });
    const endpoint = await prisma.$transaction((transaction) =>
      resolvePersonEndpoint(transaction, ownerA.personId, "PUSH"));
    assert.equal(endpoint.eligible, true);
    assert.match(endpoint.endpoint ?? "", /^push-person:/);
    assert.equal((endpoint.endpoint ?? "").includes("fcm-token"), false);

    const delivery = await createDelivery(ownerA, endpoint.fingerprint!);
    const sends: string[] = [];
    setPushTestNativeTransport(async (_provider, token, _payload, requestId) => {
      sends.push(token);
      return {
        invalidToken: false,
        outcome: "ACCEPTED",
        providerMessageId: `message_${requestId}`,
        retryable: false,
        safeCode: "FCM_ACCEPTED",
      };
    });
    const provider = new DevicePushProvider();
    const result = await provider.send({
      channel: "PUSH",
      deliveryId: delivery.id,
      endpoint: endpoint.endpoint!,
      locale: "EN",
      plainText: "Safe account update",
      providerIdempotencyKey: `communication-delivery:${delivery.id}`,
      safePlatformHref: "https://rezno.app/customer/account",
      subject: "REZNO",
    });
    assert.equal(result.outcome, "ACCEPTED");
    assert.equal(sends.length, 2);
    assert.equal(new Set(sends).size, 2);
    assert.equal(await prisma.pushDeliveryTarget.count({
      where: { outboundDeliveryId: delivery.id, status: "ACCEPTED" },
    }), 2);

    const replay = await provider.send({
      channel: "PUSH",
      deliveryId: delivery.id,
      endpoint: endpoint.endpoint!,
      locale: "EN",
      plainText: "Safe account update",
      providerIdempotencyKey: `communication-delivery:${delivery.id}`,
      safePlatformHref: "https://rezno.app/customer/account",
      subject: "REZNO",
    });
    assert.equal(replay.outcome, "ACCEPTED");
    assert.equal(sends.length, 2, "accepted targets must not be sent twice");

    await prisma.person.update({
      where: { id: ownerA.personId },
      data: { status: "INACTIVE" },
    });
    const inactiveEndpoint = await prisma.$transaction((transaction) =>
      resolvePersonEndpoint(transaction, ownerA.personId, "PUSH"));
    assert.equal(inactiveEndpoint.eligible, false);
    await prisma.person.update({
      where: { id: ownerA.personId },
      data: { status: "ACTIVE" },
    });
  });

  await t.test("concurrent receipt replay is atomic and invalid tokens are disabled", async () => {
    const targets = await prisma.pushDeliveryTarget.findMany({
      include: { installation: true },
      orderBy: { id: "asc" },
    });
    assert.equal(targets.length, 2);
    const deliveredEvent = {
      eventId: "fcm-event-delivered",
      occurredAt: new Date("2026-07-26T12:00:00.000Z"),
      providerMessageId: targets[0].providerMessageId!,
      safeCode: "FCM_DELIVERED",
      status: "DELIVERED" as const,
    };
    const concurrent = await Promise.all([
      ingestPushProviderReceipts("FCM", [deliveredEvent]),
      ingestPushProviderReceipts("FCM", [deliveredEvent]),
    ]);
    assert.deepEqual(
      concurrent.map((item) => [item.accepted, item.replayed]).sort(),
      [[0, 1], [1, 0]],
    );
    assert.equal(
      (await prisma.pushDeliveryTarget.findUniqueOrThrow({
        where: { id: targets[0].id },
      })).status,
      "DELIVERED",
    );
    await assert.rejects(
      ingestPushProviderReceipts("FCM", [{
        ...deliveredEvent,
        safeCode: "FCM_MUTATED",
      }]),
      (error) => error instanceof PushNotificationDomainError
        && error.code === "RECEIPT_REJECTED",
    );

    const invalid = await ingestPushProviderReceipts("FCM", [{
      eventId: "fcm-event-invalid",
      occurredAt: new Date("2026-07-26T12:01:00.000Z"),
      providerMessageId: targets[1].providerMessageId!,
      safeCode: "FCM_UNREGISTERED",
      status: "INVALID_TOKEN",
    }]);
    assert.equal(invalid.accepted, 1);
    assert.equal(
      (await prisma.pushInstallation.findUniqueOrThrow({
        where: { id: targets[1].installationId },
      })).status,
      "INVALIDATED",
    );
    assert.match(
      (await prisma.pushInstallation.findUniqueOrThrow({
        where: { id: targets[1].installationId },
      })).tokenCiphertext,
      /^deleted\.v1\./,
    );

    const unknown = await ingestPushProviderReceipts("FCM", [{
      eventId: "fcm-event-unknown",
      occurredAt: new Date("2026-07-26T12:02:00.000Z"),
      providerMessageId: "message_unknown",
      safeCode: "FCM_UNKNOWN",
      status: "PERMANENT_FAILURE",
    }]);
    const unknownReplay = await ingestPushProviderReceipts("FCM", [{
      eventId: "fcm-event-unknown",
      occurredAt: new Date("2026-07-26T12:02:00.000Z"),
      providerMessageId: "message_unknown",
      safeCode: "FCM_UNKNOWN",
      status: "PERMANENT_FAILURE",
    }]);
    assert.equal(unknown.unknown, 1);
    assert.equal(unknownReplay.replayed, 1);
  });
});

function input(overrides: Record<string, unknown> = {}) {
  return {
    appVersion: "1.0.0",
    idempotencyKey: randomUUID(),
    installationId: randomUUID(),
    installationSecret: "A".repeat(43),
    operationGeneration: 1,
    permissionStatus: "GRANTED" as const,
    platform: "ANDROID" as const,
    provider: "FCM" as const,
    token: "fcm-token-default-123456789012345",
    ...overrides,
  };
}

async function identity(label: string) {
  const userId = randomUUID();
  await prisma.user.create({
    data: {
      email: `${label}-${userId.slice(0, 8)}@rezno.invalid`,
      emailVerified: true,
      id: userId,
      name: label,
    },
  });
  const person = await prisma.person.create({
    data: {
      authUserId: userId,
      firstName: label,
      isOnboarded: true,
    },
  });
  return { personId: person.id, userId };
}

async function createDelivery(
  owner: { personId: string; userId: string },
  endpointFingerprint: string,
) {
  const campaign = await prisma.communicationCampaign.create({
    data: {
      audience: "USER",
      category: "ACCOUNT",
      channels: ["PUSH"],
      createdByAdminUserId: owner.userId,
      destinationKind: "CUSTOMER_ACCOUNT",
      localizedContent: {
        AR: { push: { body: "تحديث", title: "ريزنو" } },
        CKB: { push: { body: "نوێکردنەوە", title: "ڕێزنۆ" } },
        EN: { push: { body: "Update", title: "REZNO" } },
      },
      status: "DISPATCHING",
      targetPersonId: owner.personId,
      updatedByAdminUserId: owner.userId,
    },
  });
  return prisma.outboundDelivery.create({
    data: {
      campaignId: campaign.id,
      channel: "PUSH",
      endpointFingerprint,
      endpointType: "PUSH_TOKEN",
      locale: "EN",
      personId: owner.personId,
    },
  });
}

async function reset() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  assert.match(rows[0]?.database ?? "", /(?:_test|test_)/);
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Organization", "Person", "user", "Category", "MarketplaceCategory" CASCADE',
  );
}
