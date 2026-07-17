import { Prisma } from "@prisma/client";

import { expirePendingOrderInTransaction } from "@/features/commerce/services/order-service";
import { runCommerceSerializable } from "@/features/commerce/services/transaction";

export async function expirePendingOrdersBatch(options?: {
  batchSize?: number;
  now?: Date;
}) {
  const batchSize = boundedBatchSize(options?.batchSize);
  const now = options?.now ?? new Date();
  return runCommerceSerializable(async (transaction) => {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT "id"
        FROM "Order"
        WHERE "status" = 'PENDING'
          AND "reservationExpiresAt" <= ${now}
        ORDER BY "reservationExpiresAt", "id"
        FOR UPDATE SKIP LOCKED
        LIMIT ${batchSize}
      `,
    );
    let expired = 0;
    for (const row of rows) {
      const result = await expirePendingOrderInTransaction(transaction, row.id, now);
      if (result) expired += 1;
    }
    return { expired, scanned: rows.length };
  });
}

export async function expireAllEligiblePendingOrders(options?: {
  batchSize?: number;
  now?: Date;
}) {
  const batchSize = boundedBatchSize(options?.batchSize);
  let expired = 0;
  let batches = 0;
  while (true) {
    const result = await expirePendingOrdersBatch({ ...options, batchSize });
    expired += result.expired;
    batches += 1;
    if (result.scanned < batchSize || result.scanned === 0) {
      return { batches, expired };
    }
  }
}

function boundedBatchSize(value?: number) {
  if (!Number.isInteger(value ?? 50)) return 50;
  return Math.min(Math.max(value ?? 50, 1), 500);
}
