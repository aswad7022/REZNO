import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import {
  BOOKING_QA_FIXTURE,
  BookingQaSeedInvariantError,
  seedBookingQaFixture,
} from "./booking-qa-seed-core";
import {
  BookingQaSeedSafetyError,
  validateBookingQaSeedEnvironment,
} from "./booking-qa-seed-safety";

async function main() {
  const { databaseUrl } = validateBookingQaSeedEnvironment(process.env);
  process.stdout.write("Staging Booking QA seed safety gates passed.\n");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = await seedBookingQaFixture(prisma);
    process.stdout.write(
      `Staging Booking QA fixture is ready. namespace=${BOOKING_QA_FIXTURE.namespace} business=${result.businessSlug}\n`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  if (
    error instanceof BookingQaSeedSafetyError ||
    error instanceof BookingQaSeedInvariantError
  ) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write(
      "Staging Booking QA seed failed after validation; connection details were not printed.\n",
    );
  }
  process.exitCode = 1;
});
