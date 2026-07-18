import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import {
  CommerceAdminStage3dSeedInvariantError,
  seedCommerceAdminStage3dFixture,
} from "./commerce-admin-stage3d-seed-core";
import {
  CommerceAdminStage3dSeedSafetyError,
  validateCommerceAdminStage3dSeedEnvironment,
} from "./commerce-admin-stage3d-seed-safety";

async function main() {
  const { databaseUrl } = validateCommerceAdminStage3dSeedEnvironment(process.env);
  process.stdout.write("Stage 3D Commerce Admin staging fixture safety gates passed.\n");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = await seedCommerceAdminStage3dFixture(prisma);
    process.stdout.write(
      `Stage 3D Commerce Admin fixture ready. namespace=${result.namespace} fingerprint=${result.fingerprint} admins=${result.adminCount} stores=${result.storeCount} inventories=${result.inventoryCount} orders=${result.orderCount} audits=${result.auditCount}\n`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  if (
    error instanceof CommerceAdminStage3dSeedSafetyError ||
    error instanceof CommerceAdminStage3dSeedInvariantError
  ) process.stderr.write(`${error.message}\n`);
  else process.stderr.write("Stage 3D Commerce Admin fixture failed after validation; connection details were not printed.\n");
  process.exitCode = 1;
});
