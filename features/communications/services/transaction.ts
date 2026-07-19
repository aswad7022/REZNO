import "server-only";

import { Prisma } from "@prisma/client";

import { CommunicationDomainError } from "@/features/communications/domain/errors";
import { prisma } from "@/lib/db/prisma";

const MAX_SERIALIZABLE_ATTEMPTS = 5;
const SERIALIZABLE_TIMEOUT_MS = 30_000;

export async function communicationSerializable<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: SERIALIZABLE_TIMEOUT_MS,
      });
    } catch (error) {
      if (error instanceof CommunicationDomainError || !isRetryableTransactionError(error)) {
        throw error;
      }
      if (attempt === MAX_SERIALIZABLE_ATTEMPTS) throw error;
    }
  }
  throw new Error("Communication transaction retry exhausted.");
}

function isRetryableTransactionError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
    return true;
  }
  if (error instanceof Error && /40001|40P01|serialization|deadlock|TransactionWriteConflict/i.test(error.message)) {
    return true;
  }
  if (error && typeof error === "object" && "cause" in error) {
    const cause = error.cause;
    if (cause && typeof cause === "object") {
      const originalCode = "originalCode" in cause ? String(cause.originalCode) : "";
      const kind = "kind" in cause ? String(cause.kind) : "";
      return originalCode === "40001" || originalCode === "40P01" || kind === "TransactionWriteConflict";
    }
  }
  return false;
}
