import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

import {
  MESSAGING_STAGE4B_FIXTURE,
  seedMessagingLifecycleStage4bFixture,
} from "./messaging-lifecycle-stage4b-fixture";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const confirmation = process.env.MESSAGING_STAGE4B_FIXTURE_CONFIRM;
  const environment = (process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "").toLowerCase();
  if (!databaseUrl) throw new Error("Staging database access is required.");
  if (confirmation !== MESSAGING_STAGE4B_FIXTURE.confirmation) {
    throw new Error("Exact Stage 4B fixture confirmation is required.");
  }
  if (["prod", "production", "live"].some((value) => environment.includes(value))) {
    throw new Error("Stage 4B fixture refuses production environments.");
  }
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, "");
  if (!/(rezno_staging|stage4b|test)/i.test(databaseName)) {
    throw new Error("Stage 4B fixture requires an explicit staging/test database.");
  }
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = await seedMessagingLifecycleStage4bFixture(client);
    process.stdout.write(
      `Stage 4B fixture ready. marker=${MESSAGING_STAGE4B_FIXTURE.marker} fingerprint=${result.fingerprint} conversations=${result.conversations} messages=${result.messages} readStates=${result.readStates} notifications=${result.notifications} audits=${result.audits}\n`,
    );
  } finally {
    await client.$disconnect();
    await pool.end();
  }
}

void main().catch((error) => {
  const message = error instanceof Error &&
    /^(Staging database access|Exact Stage 4B fixture confirmation|Stage 4B fixture refuses|Stage 4B fixture requires|Stage 4B fixture ownership)/.test(error.message)
    ? error.message
    : "Stage 4B fixture failed; inspect secure server logs.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
