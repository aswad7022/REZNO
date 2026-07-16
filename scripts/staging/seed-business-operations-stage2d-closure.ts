import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import {
  BUSINESS_OPERATIONS_STAGE2D_FIXTURE,
  BusinessOperationsStage2dSeedInvariantError,
  seedBusinessOperationsStage2dClosureFixture,
} from "./business-operations-stage2d-closure-seed-core";
import {
  BusinessOperationsStage2dSeedSafetyError,
  validateBusinessOperationsStage2dSeedEnvironment,
} from "./business-operations-stage2d-closure-seed-safety";

async function main() {
  const { databaseUrl } = validateBusinessOperationsStage2dSeedEnvironment(
    process.env,
  );
  process.stdout.write("Stage 2D staging fixture safety gates passed.\n");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = await seedBusinessOperationsStage2dClosureFixture(prisma);
    process.stdout.write(
      `Stage 2D fixture ready. namespace=${BUSINESS_OPERATIONS_STAGE2D_FIXTURE.namespace} fingerprint=${result.fingerprint}\n`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  if (
    error instanceof BusinessOperationsStage2dSeedSafetyError ||
    error instanceof BusinessOperationsStage2dSeedInvariantError
  ) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write(
      "Stage 2D fixture failed after validation; connection details were not printed.\n",
    );
  }
  process.exitCode = 1;
});
