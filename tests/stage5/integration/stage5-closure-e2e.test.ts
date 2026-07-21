import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { paymentProvider } from "../../../features/payments/providers/registry";
import { configuredStorageProvider } from "../../../features/storage/providers/registry";
import { prisma } from "../../../lib/db/prisma";
import {
  cleanupStage5ClosureFixture,
  seedStage5ClosureFixture,
  stage5CleanupTotal,
  stage5ClosureFingerprint,
  stage5ClosureFixtureIds as ids,
} from "../../../scripts/staging/stage5-closure-fixture";
import { materializePaymentsGate5cEvidence } from "../../../scripts/staging/payments-gate5c-fixture";

test(
  "Gate 5D composes 5A storage, 5B media, and 5C payments without cleanup or authority interference",
  { concurrency: false },
  async (t) => {
    await cleanupStage5ClosureFixture(prisma);
    const sharedPlatformAccountIds: string[] = [];
    const createdSharedPlatformAccountIds: string[] = [];
    for (const family of [
      "PLATFORM_REVENUE",
      "PROVIDER_CLEARING",
      "CUSTOMER_REFUND_CLEARING",
    ] as const) {
      let account = await prisma.financialAccount.findFirst({
        where: { currency: "IQD", family, organizationId: null },
      });
      if (!account) {
        account = await prisma.financialAccount.create({
          data: { currency: "IQD", family, id: randomUUID() },
        });
        createdSharedPlatformAccountIds.push(account.id);
      }
      sharedPlatformAccountIds.push(account.id);
    }
    const sentinelId = `stage5-foreign-${randomUUID()}`;
    await prisma.user.create({
      data: {
        email: `${sentinelId}@rezno.invalid`,
        emailVerified: true,
        id: sentinelId,
        name: "Gate 5D cleanup sentinel",
      },
    });

    t.after(async () => {
      await cleanupStage5ClosureFixture(prisma);
      await prisma.user.deleteMany({ where: { id: sentinelId } });
      await prisma.financialAccount.deleteMany({
        where: { id: { in: createdSharedPlatformAccountIds } },
      });
      await prisma.$disconnect();
    });

    const run1 = await seedStage5ClosureFixture(prisma);
    const run2 = await seedStage5ClosureFixture(prisma);
    assert.deepEqual(run2, run1);
    assert.deepEqual(await stage5ClosureFingerprint(prisma), run1);

    assert.equal(configuredStorageProvider().kind, "NOT_CONFIGURED");
    assert.equal(paymentProvider().kind, "NOT_CONFIGURED");

    const [storageAssets, mediaBindings, paymentIntents] = await Promise.all([
      prisma.storedAsset.findMany({
        where: { id: { in: ids.managedStorage.assetIds } },
        select: { id: true, state: true },
      }),
      prisma.mediaBinding.findMany({
        where: { id: { in: ids.media.bindingIds } },
        select: {
          asset: {
            select: {
              organizationId: true,
              ownerPersonId: true,
              purpose: true,
              state: true,
            },
          },
          slot: true,
          state: true,
        },
      }),
      prisma.paymentIntent.findMany({
        where: { id: { in: ids.payments.intentIds } },
        select: {
          amount: true,
          currency: true,
          organizationId: true,
          provider: true,
        },
      }),
    ]);
    assert.equal(storageAssets.length, ids.managedStorage.assetIds.length);
    assert.equal(mediaBindings.length, ids.media.bindingIds.length);
    assert.equal(paymentIntents.length, ids.payments.intentIds.length);

    for (const binding of mediaBindings.filter((row) => row.state === "ACTIVE")) {
      assert.equal(binding.asset.state, "READY");
      if (binding.slot === "CUSTOMER_AVATAR") {
        assert.ok(binding.asset.ownerPersonId);
        assert.equal(binding.asset.organizationId, null);
      } else {
        assert.ok(binding.asset.organizationId);
        assert.equal(binding.asset.ownerPersonId, null);
      }
    }
    for (const intent of paymentIntents) {
      assert.ok(intent.organizationId);
      assert.equal(intent.currency, "IQD");
      assert.match(intent.amount.toFixed(3), /^\d+\.000$/);
      assert.equal(
        intent.provider === "NOT_CONFIGURED" ||
          intent.provider === "DETERMINISTIC_TEST",
        true,
      );
    }

    const paymentEvidence = await materializePaymentsGate5cEvidence(prisma);
    assert.equal(paymentEvidence.evidence.balanced, true);
    assert.equal(paymentEvidence.evidence.journalImmutable, true);
    assert.equal(paymentEvidence.evidence.postingImmutable, true);
    assert.equal(paymentEvidence.evidence.settlementImmutable, true);
    assert.equal(paymentEvidence.evidence.overRefundRejected, true);
    assert.equal(
      paymentEvidence.evidence.settlementDoubleInclusionRejected,
      true,
    );

    const cleanup = await cleanupStage5ClosureFixture(prisma);
    assert.ok(stage5CleanupTotal(cleanup) > 0);
    assert.ok(await prisma.user.findUnique({ where: { id: sentinelId } }));
    assert.equal(
      await prisma.financialAccount.count({
        where: { id: { in: sharedPlatformAccountIds } },
      }),
      sharedPlatformAccountIds.length,
    );

    const secondCleanup = await cleanupStage5ClosureFixture(prisma);
    assert.equal(stage5CleanupTotal(secondCleanup), 0);
    assert.equal(
      await prisma.storedAsset.count({
        where: {
          id: {
            in: [...ids.managedStorage.assetIds, ...ids.media.assetIds],
          },
        },
      }),
      0,
    );
    assert.equal(
      await prisma.paymentIntent.count({
        where: { id: { in: ids.payments.intentIds } },
      }),
      0,
    );
  },
);
