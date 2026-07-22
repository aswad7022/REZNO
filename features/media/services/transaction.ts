import { Prisma } from "@prisma/client";

import { MediaDomainError, mediaError } from "@/features/media/domain/errors";
import { prisma } from "@/lib/db/prisma";

const MAX_ATTEMPTS = 8;

export async function mediaSerializable<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15_000,
      });
    } catch (error) {
      lastError = error;
      if (!retryable(error)) throw error;
      if (attempt === MAX_ATTEMPTS) {
        mediaError("STORAGE_PROVIDER_FAILURE", "Media transaction could not complete safely.");
      }
    }
  }
  throw lastError;
}

export async function lockMediaScope(transaction: Prisma.TransactionClient, scope: string) {
  await transaction.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`,
  );
}

export async function databaseNow(transaction: Prisma.TransactionClient) {
  const [row] = await transaction.$queryRaw<Array<{ now: Date }>>(
    Prisma.sql`SELECT clock_timestamp() AS "now"`,
  );
  if (!row) throw new Error("Database time is unavailable.");
  return row.now;
}

function retryable(error: unknown) {
  if (error instanceof MediaDomainError) return false;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === "P2034" || error.code === "P2028")
  ) return true;
  const message = error instanceof Error ? error.message : "";
  if (/40001|40P01|serialization|deadlock|TransactionWriteConflict/i.test(message)) return true;
  return adapterTransactionConflict(error);
}

function adapterTransactionConflict(error: unknown) {
  if (typeof error !== "object" || error === null || !("cause" in error)) return false;
  const cause = error.cause;
  if (typeof cause !== "object" || cause === null) return false;
  const originalCode = "originalCode" in cause ? String(cause.originalCode) : "";
  const kind = "kind" in cause ? String(cause.kind) : "";
  return originalCode === "40001" || originalCode === "40P01" || kind === "TransactionWriteConflict";
}
