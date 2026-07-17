import { Prisma } from "@prisma/client";

import { CommerceDomainError, commerceError } from "@/features/commerce/domain/errors";
import { prisma } from "@/lib/db/prisma";

const MAX_SERIALIZABLE_ATTEMPTS = 4;

function isRetryableTransactionError(error: unknown): boolean {
  if (error instanceof CommerceDomainError) return false;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2034") return true;
  }
  if (error instanceof Error) {
    if (/40001|40P01|serialization|deadlock|TransactionWriteConflict/i.test(error.message)) {
      return true;
    }
  }
  if (typeof error === "object" && error !== null && "cause" in error) {
    const cause = error.cause;
    if (typeof cause === "object" && cause !== null) {
      const originalCode = "originalCode" in cause ? String(cause.originalCode) : "";
      const kind = "kind" in cause ? String(cause.kind) : "";
      return originalCode === "40001" || originalCode === "40P01" || kind === "TransactionWriteConflict";
    }
  }
  return false;
}

export async function runCommerceSerializable<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      lastError = error;
      const retryable = isRetryableTransactionError(error);
      if (!retryable) {
        throw error;
      }
      if (attempt === MAX_SERIALIZABLE_ATTEMPTS) {
        commerceError("CONFLICT", "Commerce transaction could not be completed safely after bounded retries.", {
          attempts: MAX_SERIALIZABLE_ATTEMPTS,
        });
      }
    }
  }
  throw lastError;
}

export async function lockInventoryItems(
  transaction: Prisma.TransactionClient,
  inventoryItemIds: readonly string[],
) {
  const sortedIds = [...new Set(inventoryItemIds)].sort();
  if (sortedIds.length === 0) return;
  const identifiers = Prisma.join(
    sortedIds.map((id) => Prisma.sql`CAST(${id} AS uuid)`),
  );
  await transaction.$queryRaw(
    Prisma.sql`SELECT "id" FROM "InventoryItem" WHERE "id" IN (${identifiers}) ORDER BY "id" FOR UPDATE`,
  );
}

export async function lockOrder(
  transaction: Prisma.TransactionClient,
  orderId: string,
) {
  await transaction.$queryRaw(
    Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = CAST(${orderId} AS uuid) FOR UPDATE`,
  );
}

export async function lockCommerceOrganization(
  transaction: Prisma.TransactionClient,
  organizationId: string,
) {
  await transaction.$queryRaw(
    Prisma.sql`SELECT "id" FROM "Organization" WHERE "id" = CAST(${organizationId} AS uuid) FOR UPDATE`,
  );
}

export async function lockStore(
  transaction: Prisma.TransactionClient,
  storeId: string,
) {
  await transaction.$queryRaw(
    Prisma.sql`SELECT "id" FROM "Store" WHERE "id" = CAST(${storeId} AS uuid) FOR UPDATE`,
  );
}

export async function lockCommerceRole(
  transaction: Prisma.TransactionClient,
  roleId: string,
  organizationId: string,
) {
  await transaction.$queryRaw(
    Prisma.sql`SELECT "id" FROM "Role" WHERE "id" = CAST(${roleId} AS uuid) AND "organizationId" = CAST(${organizationId} AS uuid) FOR UPDATE`,
  );
}
