import type { StoredAssetState, UploadSessionState } from "@prisma/client";

const sessionTransitions: Readonly<Record<UploadSessionState, readonly UploadSessionState[]>> = {
  CREATED: ["TARGET_ISSUED", "ABORTED", "EXPIRED", "FAILED"],
  TARGET_ISSUED: ["UPLOADED", "FINALIZED", "ABORTED", "EXPIRED", "FAILED"],
  UPLOADED: ["FINALIZED", "ABORTED", "EXPIRED", "FAILED"],
  FINALIZED: [],
  ABORTED: [],
  EXPIRED: [],
  FAILED: [],
};

const assetTransitions: Readonly<Record<StoredAssetState, readonly StoredAssetState[]>> = {
  PENDING_UPLOAD: ["UPLOADED", "QUARANTINED", "REJECTED"],
  UPLOADED: ["PENDING_INSPECTION", "QUARANTINED", "REJECTED"],
  PENDING_INSPECTION: ["READY", "QUARANTINED", "REJECTED"],
  READY: ["QUARANTINED", "DELETE_PENDING"],
  QUARANTINED: ["READY", "REJECTED", "DELETE_PENDING"],
  REJECTED: ["DELETE_PENDING"],
  DELETE_PENDING: ["DELETED"],
  DELETED: [],
};

export function canTransitionUploadSession(from: UploadSessionState, to: UploadSessionState) {
  return sessionTransitions[from].includes(to);
}

export function canTransitionStoredAsset(from: StoredAssetState, to: StoredAssetState) {
  return assetTransitions[from].includes(to);
}

export function isDeliverableAssetState(state: StoredAssetState) {
  return state === "READY";
}
