import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

import {
  NOTIFICATION_STAGE4A_FIXTURE,
  seedNotificationCenterStage4aFixture,
} from "./notification-center-stage4a-fixture";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const confirmation = process.env.NOTIFICATION_STAGE4A_FIXTURE_CONFIRM;
  const environment = (process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "").toLowerCase();
  if (!databaseUrl) throw new Error("Staging database access is required.");
  if (confirmation !== NOTIFICATION_STAGE4A_FIXTURE.confirmation) throw new Error("Exact Stage 4A fixture confirmation is required.");
  if (["prod", "production", "live"].some((value) => environment.includes(value))) throw new Error("Stage 4A fixture refuses production environments.");
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, "");
  if (!/(rezno_staging|stage4a|test)/i.test(databaseName)) throw new Error("Stage 4A fixture requires an explicit staging/test database.");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = await seedNotificationCenterStage4aFixture(client);
    process.stdout.write(`Stage 4A fixture ready. marker=${NOTIFICATION_STAGE4A_FIXTURE.marker} fingerprint=${result.fingerprint} people=${result.people} organizations=${result.organizations} memberships=${result.memberships} notifications=${result.notifications} histories=${result.histories} pendingChanges=${result.pendingChanges}\n`);
  } finally {
    await client.$disconnect();
    await pool.end();
  }
}

void main().catch((error) => {
  const message = error instanceof Error && /^(Staging database access|Exact Stage 4A fixture confirmation|Stage 4A fixture refuses|Stage 4A fixture requires|Stage 4A fixture ownership)/.test(error.message)
    ? error.message
    : "Stage 4A fixture failed; inspect secure server logs.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
