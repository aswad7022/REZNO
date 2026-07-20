import { prisma } from "../../lib/db/prisma";
import { MEDIA_GATE5B_MARKER, seedMediaGate5bFixture } from "./media-gate5b-fixture";
import { assertMediaGate5bStaging } from "./media-gate5b-safety";

async function main() {
  const safety = await assertMediaGate5bStaging(prisma);
  const fingerprint = await seedMediaGate5bFixture(prisma);
  console.log(JSON.stringify({ ...safety, fingerprint, fixture: MEDIA_GATE5B_MARKER, status: "seeded" }));
}

main().finally(() => prisma.$disconnect());
