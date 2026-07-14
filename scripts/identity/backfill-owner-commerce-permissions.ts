import {
  applyOwnerCommerceBackfill,
  listOwnerCommerceBackfillCandidates,
} from "@/features/identity/services/owner-commerce-backfill";
import { prisma } from "@/lib/db/prisma";

async function main() {
  const candidates = await listOwnerCommerceBackfillCandidates();
  const apply = process.argv.includes("--apply");
  const confirmation = process.argv.find((argument) =>
    argument.startsWith("--confirm-role-ids="),
  );

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        candidateCount: candidates.length,
        candidates,
      },
      null,
      2,
    ),
  );

  if (!apply) return;

  const expectedRoleIds = confirmation
    ?.slice("--confirm-role-ids=".length)
    .split(",")
    .filter(Boolean);
  if (!expectedRoleIds) {
    throw new Error(
      "Apply requires --confirm-role-ids=<comma-separated ids from dry-run>.",
    );
  }

  const result = await applyOwnerCommerceBackfill(expectedRoleIds);
  console.log(JSON.stringify({ result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Backfill failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
