import {
  seedStage4ClosureFixture,
  validateStage4ClosureEnvironment,
} from "./stage4-communications-closure-fixture";
import { prisma } from "../../lib/db/prisma";

async function main() {
  validateStage4ClosureEnvironment(process.env);
  const result = await seedStage4ClosureFixture();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main()
  .catch(() => {
    process.stderr.write("Gate 4D staging seed failed with a sanitized error.\n");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
