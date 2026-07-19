import { prisma } from "../../lib/db/prisma";
import { cleanupManagedStorageFixture } from "./managed-storage-gate5a-fixture";
import { assertManagedStorageGate5aStaging } from "./managed-storage-gate5a-safety";

async function main() {
  await assertManagedStorageGate5aStaging(prisma);
  const counts = await cleanupManagedStorageFixture(prisma);
  console.log(JSON.stringify({ counts, fixture: "rezno-qa-managed-storage-gate5a", status: "cleaned" }));
}

main().finally(() => prisma.$disconnect());
