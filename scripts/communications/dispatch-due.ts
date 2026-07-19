import { randomUUID } from "node:crypto";

import { manuallyDispatchDue } from "../../features/communications/services/dispatcher";
import { prisma } from "../../lib/db/prisma";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function main() {
  if (process.env.REZNO_COMMUNICATIONS_DISPATCH_CONFIRM !== "rezno-stage4c-manual-dispatch") {
    throw new Error("Manual communication dispatch requires the exact confirmation marker.");
  }
  const userId = process.env.REZNO_COMMUNICATIONS_ADMIN_USER_ID ?? "";
  const personId = process.env.REZNO_COMMUNICATIONS_ADMIN_PERSON_ID ?? "";
  if (!userId || !UUID_PATTERN.test(personId)) {
    throw new Error("A current Admin User and Person UUID are required.");
  }
  const result = await manuallyDispatchDue(
    { userId, personId, source: "database", adminAccessId: null },
    {
      idempotencyKey: process.env.REZNO_COMMUNICATIONS_IDEMPOTENCY_KEY ?? randomUUID(),
      batchSize: 25,
      claimOwner: `manual-cli:${randomUUID()}`,
    },
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main()
  .catch(() => {
    process.stderr.write("Communication dispatch failed with a sanitized error.\n");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
