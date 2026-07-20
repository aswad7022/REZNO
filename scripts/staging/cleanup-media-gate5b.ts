import { prisma } from "../../lib/db/prisma";
import { cleanupMediaGate5bFixture, MEDIA_GATE5B_MARKER } from "./media-gate5b-fixture";
import { assertMediaGate5bStaging } from "./media-gate5b-safety";

async function main() {
  const safety = await assertMediaGate5bStaging(prisma);
  const counts = await cleanupMediaGate5bFixture(prisma);
  console.log(JSON.stringify({ ...safety, counts, fixture: MEDIA_GATE5B_MARKER, status: "cleaned" }));
}

main().finally(() => prisma.$disconnect());
