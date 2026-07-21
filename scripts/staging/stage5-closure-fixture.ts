import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import {
  cleanupManagedStorageFixture,
  fixtureFingerprint as managedStorageFingerprint,
  managedStorageFixtureIds,
  seedManagedStorageFixture,
} from "./managed-storage-gate5a-fixture";
import {
  cleanupMediaGate5bFixture,
  mediaGate5bFingerprint,
  mediaGate5bFixtureIds,
  seedMediaGate5bFixture,
} from "./media-gate5b-fixture";
import {
  cleanupPaymentsGate5cFixture,
  materializePaymentsGate5cEvidence,
  paymentsGate5cFixtureIds,
  seedPaymentsGate5cFixture,
} from "./payments-gate5c-fixture";

export const STAGE5_CLOSURE_MARKER = "rezno-qa-stage5-gate5d-closure";

export const stage5ClosureFixtureIds = {
  managedStorage: managedStorageFixtureIds,
  media: mediaGate5bFixtureIds,
  payments: paymentsGate5cFixtureIds,
} as const;

export async function seedStage5ClosureFixture(prisma: PrismaClient) {
  const managedStorage = await seedManagedStorageFixture(prisma);
  const media = await seedMediaGate5bFixture(prisma);
  const payments = await seedPaymentsGate5cFixture(prisma);
  return combinedEvidence(managedStorage, media, payments.fingerprint);
}

export async function stage5ClosureFingerprint(prisma: PrismaClient) {
  const [managedStorage, media, payments] = await Promise.all([
    managedStorageFingerprint(prisma),
    mediaGate5bFingerprint(prisma),
    materializePaymentsGate5cEvidence(prisma),
  ]);
  return combinedEvidence(managedStorage, media, payments.fingerprint);
}

export async function cleanupStage5ClosureFixture(prisma: PrismaClient) {
  return {
    payments: await cleanupPaymentsGate5cFixture(prisma),
    media: await cleanupMediaGate5bFixture(prisma),
    managedStorage: await cleanupManagedStorageFixture(prisma),
  };
}

export function stage5CleanupTotal(
  cleanup: Awaited<ReturnType<typeof cleanupStage5ClosureFixture>>,
) {
  return Object.values(cleanup).reduce(
    (total, gate) =>
      total + Object.values(gate).reduce((gateTotal, count) => gateTotal + count, 0),
    0,
  );
}

function combinedEvidence(
  managedStorage: string,
  media: string,
  payments: string,
) {
  const components = { managedStorage, media, payments };
  return {
    components,
    fingerprint: createHash("sha256")
      .update(JSON.stringify(components))
      .digest("hex"),
  };
}
