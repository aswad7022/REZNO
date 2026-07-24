import "server-only";

import { Prisma } from "@prisma/client";

export async function lockPlatformOperationMutationKey(
  transaction: Prisma.TransactionClient,
  actorAdminUserId: string,
  idempotencyKey: string,
) {
  await transaction.$queryRaw(Prisma.sql`
    SELECT CAST(
      pg_advisory_xact_lock(
        hashtextextended(
          ${`platform-operation:${actorAdminUserId}:${idempotencyKey}`},
          0
        )
      )
      AS text
    ) AS locked
  `);
}
