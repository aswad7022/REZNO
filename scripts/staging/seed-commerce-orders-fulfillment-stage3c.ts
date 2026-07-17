import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import {
  CommerceOrdersFulfillmentStage3cSeedInvariantError,
  seedCommerceOrdersFulfillmentStage3cFixture,
} from "./commerce-orders-fulfillment-stage3c-seed-core";
import {
  CommerceOrdersFulfillmentStage3cSeedSafetyError,
  validateCommerceOrdersFulfillmentStage3cSeedEnvironment,
} from "./commerce-orders-fulfillment-stage3c-seed-safety";

async function main() {
  const { databaseUrl } = validateCommerceOrdersFulfillmentStage3cSeedEnvironment(process.env);
  process.stdout.write("Stage 3C Commerce staging fixture safety gates passed.\n");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = await seedCommerceOrdersFulfillmentStage3cFixture(prisma);
    process.stdout.write(
      `Stage 3C Commerce fixture ready. namespace=${result.namespace} fingerprint=${result.fingerprint} organizations=${result.organizationCount} people=${result.personCount} orders=${result.orderCount} reservations=${result.reservationCount} inventories=${result.inventoryCount}\n`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  if (
    error instanceof CommerceOrdersFulfillmentStage3cSeedSafetyError ||
    error instanceof CommerceOrdersFulfillmentStage3cSeedInvariantError
  ) process.stderr.write(`${error.message}\n`);
  else process.stderr.write("Stage 3C Commerce fixture failed after validation; connection details were not printed.\n");
  process.exitCode = 1;
});
