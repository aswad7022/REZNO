import { prisma } from "../../lib/db/prisma";
import { cleanupPaymentsGate5cFixture, PAYMENTS_GATE5C_MARKER } from "./payments-gate5c-fixture";
import { assertPaymentsGate5cStaging } from "./payments-gate5c-safety";

async function main() {
  const safety = await assertPaymentsGate5cStaging(prisma);
  const counts = await cleanupPaymentsGate5cFixture(prisma);
  console.log(JSON.stringify({ ...safety, counts, fixture: PAYMENTS_GATE5C_MARKER, status: "cleaned" }));
}

main().finally(() => prisma.$disconnect());
