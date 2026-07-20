import "server-only";

import { MEDIA_SLOT_REGISTRY } from "@/features/media/domain/slot-registry";
import { configuredStorageProvider } from "@/features/storage/providers/registry";
import { STORAGE_MIME_TYPES, STORAGE_PURPOSE_REGISTRY } from "@/features/storage/domain/purpose-registry";

export function storageMediaCapabilities() {
  const providerConfigured = configuredStorageProvider().kind !== "NOT_CONFIGURED";
  return {
    type: "STORAGE_MEDIA_CAPABILITIES" as const,
    providerConfigured,
    directUploadAvailable: providerConfigured,
    supportedMimeTypes: [...STORAGE_MIME_TYPES],
    supportedMediaSlots: Object.keys(MEDIA_SLOT_REGISTRY),
    maximumSizeByPurpose: Object.fromEntries(
      Object.entries(STORAGE_PURPOSE_REGISTRY).map(([purpose, policy]) => [purpose, policy.maxBytes]),
    ),
  };
}
