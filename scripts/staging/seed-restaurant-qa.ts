import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import {
  RESTAURANT_QA_FIXTURE,
  RestaurantQaSeedInvariantError,
  seedRestaurantQaFixture,
} from "./restaurant-qa-seed-core";
import {
  RestaurantQaSeedSafetyError,
  validateRestaurantQaSeedEnvironment,
} from "./restaurant-qa-seed-safety";

async function main() {
  const { databaseUrl } = validateRestaurantQaSeedEnvironment(process.env);
  process.stdout.write("Staging Restaurant QA seed safety gates passed.\n");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = await seedRestaurantQaFixture(prisma);
    process.stdout.write(
      `Staging Restaurant QA fixture is ready. namespace=${RESTAURANT_QA_FIXTURE.namespace} business=${result.businessSlug}\n`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  if (error instanceof RestaurantQaSeedSafetyError || error instanceof RestaurantQaSeedInvariantError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write("Staging Restaurant QA seed failed after validation; connection details were not printed.\n");
  }
  process.exitCode = 1;
});
