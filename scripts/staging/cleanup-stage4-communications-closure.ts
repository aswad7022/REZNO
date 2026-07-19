import {
  cleanupStage4ClosureFixture,
  validateStage4ClosureEnvironment,
} from "./stage4-communications-closure-fixture";
import { prisma } from "../../lib/db/prisma";

async function main() {
  validateStage4ClosureEnvironment(process.env);
  const result = await cleanupStage4ClosureFixture();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main()
  .catch(() => {
    process.stderr.write("Gate 4D staging cleanup failed with a sanitized error.\n");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
