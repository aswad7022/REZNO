import {
  cleanupStage4ClosureFixture,
  currentStage4ClosureCleanupPhase,
  validateStage4ClosureEnvironment,
} from "./stage4-communications-closure-fixture";
import { prisma } from "../../lib/db/prisma";

async function main() {
  validateStage4ClosureEnvironment(process.env);
  const result = await cleanupStage4ClosureFixture();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `Gate 4D staging cleanup failed with a sanitized error at ${currentStage4ClosureCleanupPhase()} (${safeDatabaseDiagnostic(error)}).\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

function safeDatabaseDiagnostic(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 6; depth += 1) {
    if (!current || typeof current !== "object") break;
    const record = current as Record<string, unknown>;
    const message = typeof record.originalMessage === "string"
      ? record.originalMessage
      : typeof record.message === "string"
        ? record.message
        : "";
    const constraint = message.match(/constraint "([A-Za-z0-9_]+)"/u)?.[1];
    const table = message.match(/table "([A-Za-z0-9_]+)"/u)?.[1];
    if (constraint || table) {
      return `table=${table ?? "unknown"},constraint=${constraint ?? "unknown"}`;
    }
    current = record.cause;
  }
  return "database-diagnostic=unknown";
}
