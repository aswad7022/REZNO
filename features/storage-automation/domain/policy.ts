import type {
  MediaRenditionProfile,
  MediaSlot,
  PlatformJobSource,
  StoredAssetState,
  StorageProviderKind,
  UploadSessionState,
} from "@prisma/client";

import { mediaRenditionProfileForSlot } from "@/features/media/domain/rendition-registry";
import {
  STORAGE_INSPECTION_POLICY_VERSION,
  STORAGE_ORPHAN_RETENTION_MS,
} from "@/features/storage/domain/policy";

export function isOrphanCleanupEligible(input: {
  expiresAt: Date;
  failureCode: string | null;
  hasStoredAsset: boolean;
  now: Date;
  provider: StorageProviderKind;
  state: UploadSessionState;
}) {
  return input.state === "EXPIRED"
    && !input.hasStoredAsset
    && input.provider !== "NOT_CONFIGURED"
    && input.failureCode !== "ORPHAN_OBJECT_DELETED"
    && input.expiresAt.getTime() <= input.now.getTime() - STORAGE_ORPHAN_RETENTION_MS;
}

export function isStoredAssetRescanEligible(input: {
  inspectionPolicyVersion: number | null;
  source: PlatformJobSource;
  state: StoredAssetState;
}) {
  if (input.source === "ADMIN_MANUAL") {
    return input.state === "READY" || input.state === "QUARANTINED";
  }
  return input.source === "DOMAIN_DISCOVERY"
    && input.state === "QUARANTINED"
    && input.inspectionPolicyVersion !== STORAGE_INSPECTION_POLICY_VERSION;
}

export function isMediaRenditionSourceEligible(input: {
  activeSlots: readonly MediaSlot[];
  profile: MediaRenditionProfile;
  sourceAssetVersion: number;
  sourceState: StoredAssetState;
  sourceVersion: number;
}) {
  return input.sourceState === "READY"
    && input.sourceVersion === input.sourceAssetVersion
    && input.activeSlots.some((slot) => mediaRenditionProfileForSlot(slot) === input.profile);
}
