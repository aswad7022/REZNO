import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import {
  BUSINESS_WORKFORCE_STAGE2B_FIXTURE,
  BusinessWorkforceStage2bSeedInvariantError,
  seedBusinessWorkforceStage2bFixture,
} from "./business-workforce-stage2b-seed-core";
import {
  BusinessWorkforceStage2bSeedSafetyError,
  validateBusinessWorkforceStage2bSeedEnvironment,
} from "./business-workforce-stage2b-seed-safety";

async function main() {
  const { databaseUrl } = validateBusinessWorkforceStage2bSeedEnvironment(process.env);
  process.stdout.write("Stage 2B staging fixture safety gates passed.\n");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = await seedBusinessWorkforceStage2bFixture(prisma);
    process.stdout.write(`Stage 2B fixture ready. namespace=${BUSINESS_WORKFORCE_STAGE2B_FIXTURE.namespace} organizations=${result.organizationA},${result.organizationB} services=${result.services} staff=${result.staff} invitations=${result.invitations}\n`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  if (error instanceof BusinessWorkforceStage2bSeedSafetyError || error instanceof BusinessWorkforceStage2bSeedInvariantError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write("Stage 2B fixture failed after validation; connection details were not printed.\n");
  }
  process.exitCode = 1;
});
