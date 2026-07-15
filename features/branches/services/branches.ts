import "server-only";

import { randomUUID } from "node:crypto";

import { listOperationalBranches } from "@/features/business-operations/services/branches";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import type { BranchDetails } from "@/features/branches/types";

export async function getCurrentOrganizationBranches(): Promise<{
  branches: BranchDetails[];
  canArchive: boolean;
  canEdit: boolean;
  createIdempotencyKey: string;
  organizationId: string;
  organizationName: string;
  role: string;
}> {
  const reference = await currentBusinessOperationReference("BRANCH_READ");
  const result = await listOperationalBranches(reference);
  return {
    ...result,
    canEdit: result.canWrite,
    createIdempotencyKey: randomUUID(),
    branches: result.branches.map((branch) => ({
      ...branch,
      addressLine1: branch.addressLine1 ?? "",
      addressLine2: branch.addressLine2 ?? "",
      city: branch.city ?? "",
      country: branch.country ?? "",
      email: branch.email ?? "",
      archiveIdempotencyKey: randomUUID(),
      idempotencyKey: randomUUID(),
      lifecycleIdempotencyKey: randomUUID(),
      latitude: branch.latitude ?? "",
      locationInstructions: branch.locationInstructions ?? "",
      locationLabel: branch.locationLabel ?? "",
      longitude: branch.longitude ?? "",
      nearbyLandmark: branch.nearbyLandmark ?? "",
      phone: branch.phone ?? "",
    })),
  };
}
