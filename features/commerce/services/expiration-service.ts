import { Prisma } from "@prisma/client";

import { expirePendingOrderInTransaction } from "@/features/commerce/services/order-service";
import { runCommerceSerializable } from "@/features/commerce/services/transaction";

export async function expirePendingOrdersBatch(options?: {
  batchSize?: number;
  now?: Date;
}) {
  const batchSize = Math.min(Math.max(options?.batchSize ?? 50, 1), 500);
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
  let expired = 0;
  let batches = 0;
  while (true) {
    const result = await expirePendingOrdersBatch(options);
    expired += result.expired;
    batches += 1;
    if (result.scanned < (options?.batchSize ?? 50) || result.scanned === 0) {
      return { batches, expired };
    }
  }
}
