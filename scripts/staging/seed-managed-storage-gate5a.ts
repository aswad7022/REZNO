import { prisma } from "../../lib/db/prisma";
import { seedManagedStorageFixture } from "./managed-storage-gate5a-fixture";
import { assertManagedStorageGate5aStaging } from "./managed-storage-gate5a-safety";

async function main() {
  await assertManagedStorageGate5aStaging(prisma);
  const fingerprint = await seedManagedStorageFixture(prisma);
  console.log(JSON.stringify({ fixture: "rezno-qa-managed-storage-gate5a", fingerprint, status: "seeded" }));
}

main().finally(() => prisma.$disconnect());
