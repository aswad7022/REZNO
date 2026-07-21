import { prisma } from "../../lib/db/prisma";
import {
  seedStage5ClosureFixture,
  STAGE5_CLOSURE_MARKER,
} from "./stage5-closure-fixture";
import { assertStage5ClosureStaging } from "./stage5-closure-safety";

async function main() {
  const safety = await assertStage5ClosureStaging(prisma);
  const evidence = await seedStage5ClosureFixture(prisma);
  console.log(
    JSON.stringify({
      ...safety,
      ...evidence,
      fixture: STAGE5_CLOSURE_MARKER,
      status: "seeded",
    }),
  );
}

main().finally(() => prisma.$disconnect());
