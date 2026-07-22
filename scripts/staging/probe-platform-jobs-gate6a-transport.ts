import { postgresPool, prisma } from "../../lib/db/prisma";
import { attestGate6aPrismaTransport } from "../../lib/db/postgres-transport";

async function main() {
  const evidence = await attestGate6aPrismaTransport(postgresPool, prisma);
  console.log(JSON.stringify({
    ...evidence,
    psqlComparison: "UNAVAILABLE_NO_LOCAL_LIBPQ_BINARY",
    probeA: "NODE_POSTGRES_EXPLICIT_TLS_PASSED",
    probeB: "PRISMA_EXTERNAL_VERIFIED_POOL_PASSED",
    status: "passed",
  }));
}

const keepAlive = setInterval(() => undefined, 1_000);
main()
  .catch((error: unknown) => {
    process.exitCode = 1;
    console.error(error instanceof Error && /^Gate 6A /u.test(error.message)
      ? error.message
      : "Gate 6A transport probe failed closed.");
  })
  .finally(async () => {
    await prisma.$disconnect();
    await postgresPool.end();
    clearInterval(keepAlive);
  });
