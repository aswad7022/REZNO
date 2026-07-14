import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import {
  COMMERCE_QA_FIXTURE,
  CommerceQaSeedInvariantError,
  seedCommerceQaFixture,
} from "./commerce-qa-seed-core";
import {
  CommerceQaSeedSafetyError,
  validateCommerceQaSeedEnvironment,
} from "./commerce-qa-seed-safety";

async function main() {
  const { databaseUrl } = validateCommerceQaSeedEnvironment(process.env);
  process.stdout.write("Staging Commerce QA seed safety gates passed.\n");

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = await seedCommerceQaFixture(prisma);
    process.stdout.write(
      [
        "Staging Commerce QA fixture is ready.",
        `organization=${COMMERCE_QA_FIXTURE.organization.slug}`,
        `store=${COMMERCE_QA_FIXTURE.store.slug}`,
        `product=${COMMERCE_QA_FIXTURE.product.slug}`,
        `sku=${COMMERCE_QA_FIXTURE.variant.sku}`,
        `available=${result.availableQuantity}`,
        `stockAdded=${result.stockAdded}`,
      ].join(" ") + "\n",
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  if (error instanceof CommerceQaSeedSafetyError || error instanceof CommerceQaSeedInvariantError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    // Database-driver errors can embed connection details. Keep CLI output
    // credential-free and leave deeper inspection to the secure operator context.
    process.stderr.write(
      "Staging Commerce QA seed failed after validation; connection details were not printed.\n",
    );
  }
  process.exitCode = 1;
});
