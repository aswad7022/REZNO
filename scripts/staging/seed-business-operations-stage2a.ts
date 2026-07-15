import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import {
  BUSINESS_OPERATIONS_STAGE2A_FIXTURE,
  BusinessOperationsStage2aSeedInvariantError,
  seedBusinessOperationsStage2aFixture,
} from "./business-operations-stage2a-seed-core";
import {
  BusinessOperationsStage2aSeedSafetyError,
  validateBusinessOperationsStage2aSeedEnvironment,
} from "./business-operations-stage2a-seed-safety";

async function main() {
  const { databaseUrl } = validateBusinessOperationsStage2aSeedEnvironment(process.env);
  process.stdout.write("Stage 2A staging fixture safety gates passed.\n");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = await seedBusinessOperationsStage2aFixture(prisma);
    process.stdout.write(`Stage 2A fixture ready. namespace=${BUSINESS_OPERATIONS_STAGE2A_FIXTURE.namespace} organizations=${result.organizationA},${result.organizationB} branches=${result.branchCount} roles=${result.roleCount}\n`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  if (error instanceof BusinessOperationsStage2aSeedSafetyError || error instanceof BusinessOperationsStage2aSeedInvariantError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write("Stage 2A fixture failed after validation; connection details were not printed.\n");
  }
  process.exitCode = 1;
});
