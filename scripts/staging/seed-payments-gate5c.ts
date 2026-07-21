import { prisma } from "../../lib/db/prisma";
import { PAYMENTS_GATE5C_MARKER, seedPaymentsGate5cFixture } from "./payments-gate5c-fixture";
import { assertPaymentsGate5cStaging } from "./payments-gate5c-safety";

async function main() {
  const safety = await assertPaymentsGate5cStaging(prisma);
  const result = await seedPaymentsGate5cFixture(prisma);
  console.log(JSON.stringify({ ...safety, ...result, fixture: PAYMENTS_GATE5C_MARKER, status: "seeded_with_rollback_only_financial_evidence" }));
}

main().finally(() => prisma.$disconnect());
