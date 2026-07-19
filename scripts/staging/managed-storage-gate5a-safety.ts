import type { PrismaClient } from "@prisma/client";

export const MANAGED_STORAGE_GATE5A_CONFIRMATION = "REZNO_MANAGED_STORAGE_GATE5A_STAGING_ONLY";

export async function assertManagedStorageGate5aStaging(
  prisma: Pick<PrismaClient, "$queryRaw">,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (environment.NODE_ENV === "production"
    || environment.REZNO_ENV !== "staging"
    || environment.REZNO_MANAGED_STORAGE_GATE5A_CONFIRM !== MANAGED_STORAGE_GATE5A_CONFIRMATION) {
    throw new Error("Gate 5A fixture requires the exact staging environment and confirmation marker.");
  }
  const [row] = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  if (row?.database !== "rezno_staging" || /prod(?:uction)?|live/i.test(row?.database ?? "")) {
    throw new Error("Gate 5A fixture requires the exact rezno_staging database.");
  }
  return { database: "rezno_staging" as const };
}
