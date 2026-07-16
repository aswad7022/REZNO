import "server-only";

import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import { getBusinessOverview } from "@/features/dashboard/services/business-overview";

export async function getCurrentBusinessOverview(snapshotAt = new Date()) {
  return getBusinessOverview(
    await currentBusinessOperationReference("BUSINESS_OVERVIEW_READ"),
    snapshotAt,
  );
}
