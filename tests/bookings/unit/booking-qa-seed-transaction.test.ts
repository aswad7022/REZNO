import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import { seedBookingQaFixture } from "../../../scripts/staging/booking-qa-seed-core";

test("Booking QA seed allows enough time for a remote staging transaction", async () => {
  let transactionOptions: { maxWait?: number; timeout?: number } | undefined;
  const expected = {
    branchServiceId: "offering-id",
    businessSlug: "business-slug",
    memberId: "member-id",
    serviceId: "service-id",
  };
  const database = {
    $transaction: async (
      _operation: unknown,
      options: { maxWait?: number; timeout?: number },
    ) => {
      transactionOptions = options;
      return expected;
    },
  } as unknown as PrismaClient;

  assert.deepEqual(await seedBookingQaFixture(database), expected);
  assert.deepEqual(transactionOptions, {
    maxWait: 10_000,
    timeout: 30_000,
  });
});
