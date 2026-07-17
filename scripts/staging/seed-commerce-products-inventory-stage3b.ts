import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import {
  CommerceProductsInventoryStage3bSeedInvariantError,
  seedCommerceProductsInventoryStage3bFixture,
} from "./commerce-products-inventory-stage3b-seed-core";
import {
  CommerceProductsInventoryStage3bSeedSafetyError,
  validateCommerceProductsInventoryStage3bSeedEnvironment,
} from "./commerce-products-inventory-stage3b-seed-safety";

async function main() {
  const { databaseUrl } = validateCommerceProductsInventoryStage3bSeedEnvironment(process.env);
  process.stdout.write("Stage 3B Commerce staging fixture safety gates passed.\n");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = await seedCommerceProductsInventoryStage3bFixture(prisma);
    process.stdout.write(
      `Stage 3B Commerce fixture ready. namespace=${result.namespace} fingerprint=${result.fingerprint} organizations=${result.organizationCount} people=${result.personCount} products=${result.productCount} variants=${result.variantCount}\n`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  if (
    error instanceof CommerceProductsInventoryStage3bSeedSafetyError ||
    error instanceof CommerceProductsInventoryStage3bSeedInvariantError
  ) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write("Stage 3B Commerce fixture failed after validation; connection details were not printed.\n");
  }
  process.exitCode = 1;
});
