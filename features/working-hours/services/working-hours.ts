import "server-only";

import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";

import { BusinessOperationsError } from "@/features/business-operations/domain/errors";
import { readOperationalHours } from "@/features/business-operations/services/hours";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import type { BranchWorkingHours } from "@/features/working-hours/types";

export async function getBranchWorkingHours(branchId: string): Promise<BranchWorkingHours> {
  const reference = await currentBusinessOperationReference("HOURS_READ");
  try {
    const result = await readOperationalHours(reference, branchId);
    return { ...result, canEdit: result.canWrite, idempotencyKey: randomUUID() };
  } catch (error) {
    if (error instanceof BusinessOperationsError && ["BRANCH_NOT_FOUND", "NOT_FOUND"].includes(error.code)) notFound();
    throw error;
  }
}
