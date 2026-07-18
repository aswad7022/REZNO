import "server-only";

import { Prisma } from "@prisma/client";

import { MessageDomainError } from "@/features/messages/domain/errors";
import { prisma } from "@/lib/db/prisma";

export async function messagingSerializable<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (error instanceof MessageDomainError) throw error;
      if (isRetryableMessagingError(error) && attempt < 4) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Messaging transaction retry exhausted.");
}

function isRetryableMessagingError(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || error.code === "P2002")
  ) {
    return true;
  }
  if (
    error instanceof Error &&
    /40001|40P01|serialization|deadlock|TransactionWriteConflict/i.test(
      error.message,
    )
  ) {
    return true;
  }
  if (error && typeof error === "object" && "cause" in error) {
    const cause = error.cause;
    if (cause && typeof cause === "object") {
      const originalCode =
        "originalCode" in cause ? String(cause.originalCode) : "";
      const kind = "kind" in cause ? String(cause.kind) : "";
      return originalCode === "40001" || originalCode === "40P01" ||
        kind === "TransactionWriteConflict";
    }
  }
  return false;
}
