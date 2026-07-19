import { prisma } from "../../lib/db/prisma";

/**
 * Stage 6 attachment point. Gate 5A intentionally refuses unauthenticated CLI
 * cleanup; use the permissioned Admin cleanup endpoint until a system identity
 * and scheduler are introduced.
 */
async function main() {
  const [row] = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  if (!/(?:_test|test_|rezno_staging)/.test(row?.database ?? "") || process.env.NODE_ENV === "production") {
    throw new Error("Direct cleanup CLI is disabled outside an explicit non-production test/staging database.");
  }
  throw new Error("Use POST /api/admin/storage/cleanup with current STORAGE_RECORDS_MANAGE authorization.");
}

main().finally(() => prisma.$disconnect());
