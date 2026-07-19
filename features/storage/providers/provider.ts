import type { StorageProviderKind } from "@prisma/client";

export type StorageProviderOutcome =
  | "READY"
  | "NOT_FOUND"
  | "NOT_CONFIGURED"
  | "TRANSIENT_FAILURE"
  | "PERMANENT_FAILURE";

export type SafeObjectReference = Readonly<{
  objectKey: string;
  provider: StorageProviderKind;
}>;

export type ObjectMetadataResult =
  | Readonly<{
      checksumSha256: string | null;
      contentType: string;
      objectVersion: string | null;
      outcome: "READY";
      sizeBytes: number;
    }>
  | Readonly<{ outcome: Exclude<StorageProviderOutcome, "READY"> }>;

export type ObjectContentResult =
  | Readonly<{ bytes: Uint8Array; outcome: "READY" }>
  | Readonly<{ outcome: Exclude<StorageProviderOutcome, "READY"> }>;

export type UploadTargetResult =
  | Readonly<{
      expiresAt: Date;
      headers: Readonly<Record<string, string>>;
      method: "PUT";
      outcome: "READY";
      providerUploadReference: string;
      url: string;
      writeOnce: true;
    }>
  | Readonly<{ outcome: Exclude<StorageProviderOutcome, "READY" | "NOT_FOUND"> }>;

export type DownloadTargetResult =
  | Readonly<{ expiresAt: Date; outcome: "READY"; url: string }>
  | Readonly<{ outcome: Exclude<StorageProviderOutcome, "READY"> }>;

export type DeleteObjectResult = Readonly<{ outcome: StorageProviderOutcome }>;

export interface StorageProvider {
  readonly kind: StorageProviderKind;
  createUploadTarget(input: Readonly<{
    contentType: string;
    expiresAt: Date;
    objectKey: string;
    sizeBytes: number;
  }>): Promise<UploadTargetResult>;
  headObject(input: SafeObjectReference): Promise<ObjectMetadataResult>;
  getObjectForInspection(input: SafeObjectReference & { maxBytes: number }): Promise<ObjectContentResult>;
  createDownloadTarget(input: SafeObjectReference & {
    expiresAt: Date;
    visibility: "PUBLIC" | "PRIVATE" | "INTERNAL";
  }): Promise<DownloadTargetResult>;
  deleteObject(input: SafeObjectReference): Promise<DeleteObjectResult>;
}

/** Converts every adapter/SDK throw into a classified result without exposing raw provider detail. */
export async function callStorageProvider<T extends Readonly<{ outcome: StorageProviderOutcome }>>(
  operation: () => Promise<T>,
): Promise<T | Readonly<{ outcome: "PERMANENT_FAILURE" }>> {
  try {
    return await operation();
  } catch {
    return { outcome: "PERMANENT_FAILURE" };
  }
}

export class NotConfiguredStorageProvider implements StorageProvider {
  readonly kind = "NOT_CONFIGURED" as const;

  async createUploadTarget(): Promise<UploadTargetResult> {
    return { outcome: "NOT_CONFIGURED" };
  }
  async headObject(): Promise<ObjectMetadataResult> {
    return { outcome: "NOT_CONFIGURED" };
  }
  async getObjectForInspection(): Promise<ObjectContentResult> {
    return { outcome: "NOT_CONFIGURED" };
  }
  async createDownloadTarget(): Promise<DownloadTargetResult> {
    return { outcome: "NOT_CONFIGURED" };
  }
  async deleteObject(): Promise<DeleteObjectResult> {
    return { outcome: "NOT_CONFIGURED" };
  }
}
