import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

import { backfillNotificationCenter } from "../features/notifications/services/backfill-service";

const APPLY_CONFIRMATION = "NOTIFICATION_STAGE4A_BACKFILL";
const PRODUCTION_CONFIRMATION = "NOTIFICATION_STAGE4A_PRODUCTION";

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = !args.has("--apply");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  if (!dryRun && !args.has(`--confirm=${APPLY_CONFIRMATION}`)) {
    throw new Error(`Apply requires --confirm=${APPLY_CONFIRMATION}.`);
  }
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";
  const normalizedEnvironment = environment.toLowerCase();
  const productionLike = ["prod", "production", "live"].some((value) => normalizedEnvironment.includes(value));
  if (productionLike && (!args.has("--allow-production") || !args.has(`--confirm-production=${PRODUCTION_CONFIRMATION}`))) {
    throw new Error("Production backfill requires both explicit production safeguards.");
  }
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (!productionLike && !/(rezno_staging|stage4a|test)/i.test(databaseName)) {
    throw new Error("Notification backfill requires an explicit staging/test database.");
  }
  const rawBatch = process.argv.find((value) => value.startsWith("--batch-size="))?.split("=")[1];
  const batchSize = rawBatch ? Number(rawBatch) : 250;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1_000) throw new Error("batch size is invalid.");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const report = await backfillNotificationCenter(client, { batchSize, dryRun });
    process.stdout.write(`${JSON.stringify({ environment, ...report }, null, 2)}\n`);
  } finally {
    await client.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error && /^(DATABASE_URL|Apply requires|Production backfill|Notification backfill requires|batch size)/.test(error.message)
    ? error.message
    : "Notification backfill failed; inspect secure server logs.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
