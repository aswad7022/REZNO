import { Prisma } from "@prisma/client";

import { PaymentDomainError, paymentError } from "@/features/payments/domain/errors";
import { prisma } from "@/lib/db/prisma";

const MAX_ATTEMPTS = 4;

function retryable(error: unknown): boolean {
  if (error instanceof PaymentDomainError) return false;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  return error instanceof Error && /40001|40P01|serialization|deadlock|TransactionWriteConflict/i.test(error.message);
}

export async function runPaymentSerializable<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15_000,
      });
    } catch (error) {
      last = error;
      if (!retryable(error)) throw error;
      if (attempt === MAX_ATTEMPTS) {
        paymentError("PAYMENT_STATE_CONFLICT", "Payment transaction could not complete safely.");
      }
    }
  }
  throw last;
}

export async function lockPaymentIntent(transaction: Prisma.TransactionClient, paymentIntentId: string): Promise<void> {
  await transaction.$queryRaw(
    Prisma.sql`SELECT "id" FROM "PaymentIntent" WHERE "id" = CAST(${paymentIntentId} AS uuid) FOR UPDATE`,
  );
}

export async function lockPaymentRefund(transaction: Prisma.TransactionClient, refundId: string): Promise<void> {
  await transaction.$queryRaw(
    Prisma.sql`SELECT "id" FROM "PaymentRefund" WHERE "id" = CAST(${refundId} AS uuid) FOR UPDATE`,
  );
}
