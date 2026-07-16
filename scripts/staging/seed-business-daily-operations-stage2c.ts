import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import {
  BUSINESS_DAILY_OPERATIONS_STAGE2C_FIXTURE,
  BusinessDailyOperationsStage2cSeedInvariantError,
  seedBusinessDailyOperationsStage2cFixture,
} from "./business-daily-operations-stage2c-seed-core";
import {
  BusinessDailyOperationsStage2cSeedSafetyError,
  validateBusinessDailyOperationsStage2cSeedEnvironment,
} from "./business-daily-operations-stage2c-seed-safety";

async function main() {
  const { databaseUrl } = validateBusinessDailyOperationsStage2cSeedEnvironment(
    process.env,
  );
  process.stdout.write("Stage 2C staging fixture safety gates passed.\n");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = await seedBusinessDailyOperationsStage2cFixture(prisma);
    process.stdout.write(
      `Stage 2C fixture ready. namespace=${BUSINESS_DAILY_OPERATIONS_STAGE2C_FIXTURE.namespace} organizations=${result.organizations} bookings=${result.bookings} restaurantReservations=${result.restaurantReservations} tables=${result.tables} menuItems=${result.menuItems}\n`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  if (
    error instanceof BusinessDailyOperationsStage2cSeedSafetyError ||
    error instanceof BusinessDailyOperationsStage2cSeedInvariantError
  ) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write(
      "Stage 2C fixture failed after validation; connection details were not printed.\n",
    );
  }
  process.exitCode = 1;
});
