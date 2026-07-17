import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import {
  CommerceMerchantStoreStage3aSeedInvariantError,
  seedCommerceMerchantStoreStage3aFixture,
} from "./commerce-merchant-store-stage3a-seed-core";
import {
  CommerceMerchantStoreStage3aSeedSafetyError,
  validateCommerceMerchantStoreStage3aSeedEnvironment,
} from "./commerce-merchant-store-stage3a-seed-safety";

async function main() {
  const { databaseUrl } = validateCommerceMerchantStoreStage3aSeedEnvironment(process.env);
  process.stdout.write("Stage 3A Commerce staging fixture safety gates passed.\n");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = await seedCommerceMerchantStoreStage3aFixture(prisma);
    process.stdout.write(
      `Stage 3A Commerce fixture ready. namespace=${result.namespace} fingerprint=${result.fingerprint} organizations=${result.organizationCount} people=${result.personCount} stores=${result.storeCount}\n`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  if (
    error instanceof CommerceMerchantStoreStage3aSeedSafetyError ||
    error instanceof CommerceMerchantStoreStage3aSeedInvariantError
  ) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write("Stage 3A Commerce fixture failed after validation; connection details were not printed.\n");
  }
  process.exitCode = 1;
});
