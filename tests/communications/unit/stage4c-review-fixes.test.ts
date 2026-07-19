import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { CommunicationCampaign, Prisma } from "@prisma/client";

import { snapshotDelivery } from "../../../features/communications/services/dispatcher";
import {
  ENDPOINT_RESOLUTION_CHUNK_SIZE,
  publicEndpointEligibility,
  resolvePersonEndpointsBulk,
  setCommunicationTestPushEndpointResolver,
} from "../../../features/communications/services/endpoints";

type EndpointRow = {
  personId: string;
  email: string | null;
  emailVerified: boolean | null;
  phone: string | null;
  phoneVerifiedAt: Date | null;
};

function transaction(rows: EndpointRow[], queryCounter = { value: 0 }) {
  return {
    async $queryRaw() {
      queryCounter.value += 1;
      return rows;
    },
  } as unknown as Prisma.TransactionClient;
}

test("Gate 4C bulk endpoint resolution is bounded, exact, and contact-safe", async (t) => {
  t.after(() => setCommunicationTestPushEndpointResolver(undefined));

  await t.test("Email and SMS classify eligible, missing, unverified, and invalid endpoints in memory", async () => {
    const eligibleId = randomUUID();
    const unverifiedId = randomUUID();
    const invalidId = randomUUID();
    const missingId = randomUUID();
    const queryCounter = { value: 0 };
    const result = await resolvePersonEndpointsBulk(transaction([
      {
        personId: eligibleId,
        email: "  Person@REZNO.Invalid ", emailVerified: true,
        phone: "+964 750 123 4567", phoneVerifiedAt: new Date(),
      },
      {
        personId: unverifiedId,
        email: "unverified@rezno.invalid", emailVerified: false,
        phone: "+9647501234568", phoneVerifiedAt: null,
      },
      {
        personId: invalidId,
        email: "invalid", emailVerified: true,
        phone: "07501234569", phoneVerifiedAt: new Date(),
      },
    ], queryCounter), [eligibleId, unverifiedId, invalidId, missingId], ["EMAIL", "SMS"]);

    assert.equal(queryCounter.value, 1);
    assert.equal(result.diagnostics.endpointQueryCount, 1);
    assert.equal(result.byPerson.get(eligibleId)?.EMAIL?.eligible, true);
    assert.equal(result.byPerson.get(eligibleId)?.SMS?.eligible, true);
    assert.equal(result.byPerson.get(unverifiedId)?.EMAIL?.reason, "UNVERIFIED_ENDPOINT");
    assert.equal(result.byPerson.get(unverifiedId)?.SMS?.reason, "UNVERIFIED_ENDPOINT");
    assert.equal(result.byPerson.get(invalidId)?.EMAIL?.reason, "INVALID_ENDPOINT");
    assert.equal(result.byPerson.get(invalidId)?.SMS?.reason, "INVALID_ENDPOINT");
    assert.equal(result.byPerson.get(missingId)?.EMAIL?.reason, "MISSING_ENDPOINT");
    assert.equal(result.byPerson.get(missingId)?.SMS?.reason, "MISSING_ENDPOINT");
    assert.equal(
      result.byPerson.get(eligibleId)?.EMAIL?.fingerprint,
      (await resolvePersonEndpointsBulk(
        transaction([{ personId: eligibleId, email: "person@rezno.invalid", emailVerified: true, phone: null, phoneVerifiedAt: null }]),
        [eligibleId], ["EMAIL"],
      )).byPerson.get(eligibleId)?.EMAIL?.fingerprint,
    );
    assert.deepEqual(publicEndpointEligibility(result.byPerson.get(eligibleId)!.EMAIL!), {
      eligible: true, reason: "ELIGIBLE",
    });
    assert.doesNotMatch(JSON.stringify(publicEndpointEligibility(result.byPerson.get(eligibleId)!.EMAIL!)), /@|\+964/);
  });

  await t.test("query growth follows deterministic chunks instead of People or channels", async () => {
    const ids = Array.from({ length: ENDPOINT_RESOLUTION_CHUNK_SIZE + 1 }, () => randomUUID());
    const queryCounter = { value: 0 };
    const result = await resolvePersonEndpointsBulk(transaction([], queryCounter), ids, ["EMAIL", "SMS"]);
    assert.equal(queryCounter.value, 2);
    assert.equal(result.diagnostics.queryChunkCount, 2);
    assert.equal(result.diagnostics.endpointQueryCount, 2);
    assert.equal(result.diagnostics.personCount, ENDPOINT_RESOLUTION_CHUNK_SIZE + 1);
  });

  await t.test("Push is missing in production architecture and the guarded test adapter resolves one bulk map", async () => {
    const ids = [randomUUID(), randomUUID()];
    setCommunicationTestPushEndpointResolver(undefined);
    const missing = await resolvePersonEndpointsBulk(transaction([]), ids, ["PUSH"]);
    assert.equal(missing.diagnostics.pushResolverCallCount, 0);
    assert.equal(missing.byPerson.get(ids[0]!)?.PUSH?.reason, "MISSING_ENDPOINT");

    let calls = 0;
    setCommunicationTestPushEndpointResolver((personIds) => {
      calls += 1;
      return new Map(personIds.map((personId) => [personId, `test-push:${personId}`]));
    });
    const resolved = await resolvePersonEndpointsBulk(transaction([]), ids, ["PUSH"]);
    assert.equal(calls, 1);
    assert.equal(resolved.diagnostics.pushResolverCallCount, 1);
    assert.equal(resolved.byPerson.get(ids[1]!)?.PUSH?.eligible, true);
  });

  await t.test("delivery snapshots preserve bulk classification without persisting raw endpoints", () => {
    const campaign = { id: randomUUID() } as CommunicationCampaign;
    const recipient = {
      active: true,
      inAppEnabled: true,
      locale: "EN" as const,
      outboundEnabled: { EMAIL: true, SMS: false, PUSH: false },
      personId: randomUUID(),
    };
    const endpoint = {
      eligible: true as const,
      endpoint: "person@rezno.invalid",
      endpointType: "EMAIL" as const,
      fingerprint: "a".repeat(64),
      reason: "ELIGIBLE" as const,
    };
    const eligible = snapshotDelivery(campaign, recipient, "EMAIL", endpoint, new Date());
    assert.equal(eligible.status, "PENDING");
    assert.equal(eligible.endpointFingerprint, "a".repeat(64));
    assert.doesNotMatch(JSON.stringify(eligible), /person@rezno\.invalid/);

    const suppressed = snapshotDelivery(campaign, {
      ...recipient, outboundEnabled: { ...recipient.outboundEnabled, EMAIL: false },
    }, "EMAIL", null, new Date());
    assert.equal(suppressed.status, "SUPPRESSED");
    assert.equal(suppressed.suppressionReason, "PREFERENCE_DISABLED");
  });
});
