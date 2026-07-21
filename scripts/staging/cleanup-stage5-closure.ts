import { prisma } from "../../lib/db/prisma";
import {
  cleanupStage5ClosureFixture,
  stage5CleanupTotal,
  STAGE5_CLOSURE_MARKER,
} from "./stage5-closure-fixture";
import { assertStage5ClosureStaging } from "./stage5-closure-safety";

async function main() {
  const safety = await assertStage5ClosureStaging(prisma);
  const cleanup = await cleanupStage5ClosureFixture(prisma);
  console.log(
    JSON.stringify({
      ...safety,
      cleanup,
      fixture: STAGE5_CLOSURE_MARKER,
      removed: stage5CleanupTotal(cleanup),
      status: "cleaned",
    }),
  );
}

main().finally(() => prisma.$disconnect());
