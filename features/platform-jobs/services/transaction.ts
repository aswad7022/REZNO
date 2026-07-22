import { Prisma } from "@prisma/client";

import { PlatformJobDomainError, platformJobError } from "@/features/platform-jobs/domain/errors";
import { prisma } from "@/lib/db/prisma";

const MAX_TRANSACTION_ATTEMPTS = 4;

function retryable(error: unknown) {
  if (error instanceof PlatformJobDomainError) return false;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  return error instanceof Error && /40001|40P01|serialization|deadlock|TransactionWriteConflict/i.test(error.message);
}

export async function runPlatformJobSerializable<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  let last: unknown;
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15_000,
      });
    } catch (error) {
      last = error;
      if (!retryable(error)) throw error;
      if (attempt === MAX_TRANSACTION_ATTEMPTS) {
        platformJobError("CONFLICT", "The platform-job transaction could not complete safely.");
      }
    }
  }
  throw last;
}

export async function lockPlatformJob(transaction: Prisma.TransactionClient, jobId: string) {
  await transaction.$queryRaw(
    Prisma.sql`SELECT "id" FROM "PlatformJob" WHERE "id" = CAST(${jobId} AS uuid) FOR UPDATE`,
  );
}

export async function lockPlatformJobSchedule(transaction: Prisma.TransactionClient, scheduleId: string) {
  await transaction.$queryRaw(
    Prisma.sql`SELECT "id" FROM "PlatformJobSchedule" WHERE "id" = CAST(${scheduleId} AS uuid) FOR UPDATE`,
  );
}
