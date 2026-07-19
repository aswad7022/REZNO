import type { StoredAsset, UploadSession } from "@prisma/client";

export function uploadSessionDto(session: UploadSession) {
  return {
    type: "UPLOAD_SESSION" as const,
    id: session.id,
    purpose: session.purpose,
    visibility: session.visibility,
    state: session.state,
    expectedMimeType: session.expectedMimeType,
    expectedSizeBytes: Number(session.expectedSizeBytes),
    expectedChecksumPresent: Boolean(session.expectedChecksumSha256),
    displayName: session.displayName,
    expiresAt: session.expiresAt.toISOString(),
    finalizedAt: session.finalizedAt?.toISOString() ?? null,
    abortedAt: session.abortedAt?.toISOString() ?? null,
    failureCode: session.failureCode,
    version: session.version,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

export function storedAssetSummaryDto(asset: StoredAsset) {
  return {
    type: "STORED_ASSET_SUMMARY" as const,
    id: asset.id,
    purpose: asset.purpose,
    visibility: asset.visibility,
    state: asset.state,
    mimeType: asset.mimeType,
    sizeBytes: Number(asset.sizeBytes),
    displayName: asset.displayName,
    inspectionOutcome: asset.inspectionOutcome,
    scannerOutcome: asset.scannerOutcome,
    failureCode: asset.failureCode,
    version: asset.version,
    readyAt: asset.readyAt?.toISOString() ?? null,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

export function storedAssetDetailDto(asset: StoredAsset) {
  const metadata = safeInspectionMetadata(asset.inspectionMetadata);
  return {
    ...storedAssetSummaryDto(asset),
    type: "STORED_ASSET_DETAIL" as const,
    inspection: metadata,
    deleteRequestedAt: asset.deleteRequestedAt?.toISOString() ?? null,
    deletedAt: asset.deletedAt?.toISOString() ?? null,
  };
}

function safeInspectionMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    format: typeof record.format === "string" ? record.format : null,
    height: typeof record.height === "number" ? record.height : null,
    pages: typeof record.pages === "number" ? record.pages : null,
    width: typeof record.width === "number" ? record.width : null,
  };
}
