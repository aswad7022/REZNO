import assert from "node:assert/strict";

import { paymentProvider } from "../../features/payments/providers/registry";
import { configuredStorageProvider } from "../../features/storage/providers/registry";
import { prisma } from "../../lib/db/prisma";
import {
  stage5ClosureFingerprint,
  stage5ClosureFixtureIds as ids,
  STAGE5_CLOSURE_MARKER,
} from "./stage5-closure-fixture";
import { materializePaymentsGate5cEvidence } from "./payments-gate5c-fixture";
import { assertStage5ClosureStaging } from "./stage5-closure-safety";

async function main() {
  const safety = await assertStage5ClosureStaging(prisma);
  const before = await stage5ClosureFingerprint(prisma);
  let checks = 0;

  assert.equal(configuredStorageProvider().kind, "NOT_CONFIGURED");
  assert.equal(paymentProvider().kind, "NOT_CONFIGURED");
  checks += 2;

  const [storageAssets, mediaAssets, activeBindings, paymentIntents] =
    await Promise.all([
      prisma.storedAsset.findMany({
        where: { id: { in: ids.managedStorage.assetIds } },
        select: { id: true, state: true },
      }),
      prisma.storedAsset.findMany({
        where: { id: { in: ids.media.assetIds } },
        select: { id: true, organizationId: true, ownerPersonId: true, purpose: true, state: true },
      }),
      prisma.mediaBinding.findMany({
        where: { id: { in: ids.media.bindingIds }, state: "ACTIVE" },
        select: {
          asset: {
            select: {
              id: true,
              organizationId: true,
              ownerPersonId: true,
              purpose: true,
              state: true,
            },
          },
          id: true,
          slot: true,
        },
      }),
      prisma.paymentIntent.findMany({
        where: { id: { in: ids.payments.intentIds } },
        select: {
          amount: true,
          currency: true,
          id: true,
          organizationId: true,
          provider: true,
        },
      }),
    ]);

  assert.equal(storageAssets.length, ids.managedStorage.assetIds.length);
  assert.equal(mediaAssets.length, ids.media.assetIds.length);
  assert.equal(paymentIntents.length, ids.payments.intentIds.length);
  assert.ok(activeBindings.length > 0);
  checks += 4;

  for (const binding of activeBindings) {
    assert.equal(binding.asset.state, "READY");
    assert.equal(expectedPurpose(binding.slot), binding.asset.purpose);
    if (binding.slot === "CUSTOMER_AVATAR") {
      assert.ok(binding.asset.ownerPersonId);
      assert.equal(binding.asset.organizationId, null);
    } else {
      assert.ok(binding.asset.organizationId);
      assert.equal(binding.asset.ownerPersonId, null);
    }
    checks += 4;
  }

  for (const intent of paymentIntents) {
    assert.equal(intent.currency, "IQD");
    assert.equal(intent.provider === "NOT_CONFIGURED" || intent.provider === "DETERMINISTIC_TEST", true);
    assert.match(intent.amount.toFixed(3), /^\d+\.000$/);
    assert.ok(intent.organizationId);
    checks += 4;
  }

  const paymentEvidence = await materializePaymentsGate5cEvidence(prisma);
  assert.equal(paymentEvidence.evidence.balanced, true);
  assert.equal(paymentEvidence.evidence.journalImmutable, true);
  assert.equal(paymentEvidence.evidence.postingImmutable, true);
  assert.equal(paymentEvidence.evidence.settlementImmutable, true);
  assert.equal(
    paymentEvidence.evidence.meaning,
    "LEDGER_STATEMENT_NOT_BANK_PAYOUT",
  );
  checks += 5;

  const allFixtureIds = [
    ...ids.managedStorage.assetIds,
    ...ids.media.assetIds,
    ...ids.payments.intentIds,
  ];
  assert.equal(new Set(allFixtureIds).size, allFixtureIds.length);
  checks += 1;

  const after = await stage5ClosureFingerprint(prisma);
  assert.deepEqual(after, before);
  checks += 1;

  console.log(
    JSON.stringify({
      ...safety,
      checks,
      fingerprint: before.fingerprint,
      fixture: STAGE5_CLOSURE_MARKER,
      providers: { payment: "NOT_CONFIGURED", storage: "NOT_CONFIGURED" },
      status: "passed_read_only",
    }),
  );
}

function expectedPurpose(slot: string) {
  const purposes: Record<string, string> = {
    BUSINESS_COVER: "BUSINESS_COVER",
    BUSINESS_GALLERY: "BUSINESS_GALLERY_IMAGE",
    BUSINESS_LOGO: "BUSINESS_LOGO",
    CUSTOMER_AVATAR: "CUSTOMER_AVATAR",
    MENU_ITEM_PRIMARY: "RESTAURANT_MENU_IMAGE",
    PRODUCT_IMAGE: "PRODUCT_IMAGE",
    SERVICE_PRIMARY: "SERVICE_IMAGE",
    STORE_COVER: "STORE_COVER",
    STORE_LOGO: "STORE_LOGO",
  };
  return purposes[slot];
}

main().finally(() => prisma.$disconnect());
