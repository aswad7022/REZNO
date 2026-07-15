import "server-only";

import { randomUUID } from "node:crypto";

import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import { readOperationalSettings } from "@/features/business-operations/services/settings";
import type { BusinessSettingsDetails } from "@/features/business-settings/types";

export async function getCurrentBusinessSettings(): Promise<BusinessSettingsDetails> {
  const reference = await currentBusinessOperationReference("SETTINGS_READ");
  return { ...(await readOperationalSettings(reference)), idempotencyKey: randomUUID() };
}
