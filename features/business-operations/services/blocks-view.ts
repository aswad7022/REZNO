import "server-only";

import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";

import { BusinessOperationsError } from "@/features/business-operations/domain/errors";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import { listOperationalBlocks } from "@/features/business-operations/services/blocks";
import type { OperationalBlocksView } from "@/features/business-operations/types/blocks";

export async function getOperationalBlocksView(
  branchId: string,
): Promise<OperationalBlocksView> {
  try {
    const result = await listOperationalBlocks(
      await currentBusinessOperationReference("BLOCK_READ"),
      branchId,
    );
    return {
      ...result,
      createIdempotencyKey: randomUUID(),
      blocks: result.blocks.map((block) => ({
        ...block,
        deleteIdempotencyKey: randomUUID(),
        updateIdempotencyKey: randomUUID(),
      })),
    };
  } catch (error) {
    if (error instanceof BusinessOperationsError && ["BRANCH_NOT_FOUND", "NOT_FOUND"].includes(error.code)) notFound();
    throw error;
  }
}
