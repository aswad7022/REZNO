import { createHash } from "node:crypto";

import type {
  DeleteObjectResult,
  DownloadTargetResult,
  ObjectContentResult,
  ObjectMetadataResult,
  SafeObjectReference,
  StorageProvider,
  StorageProviderOutcome,
  UploadTargetResult,
  WriteObjectResult,
} from "@/features/storage/providers/provider";
import { isServerGeneratedStorageKey, sha256Hex } from "@/features/storage/domain/policy";

type DeterministicObject = {
  bytes: Uint8Array;
  checksumSha256: string;
  contentType: string;
  deleteOutcomes: StorageProviderOutcome[];
  headOutcome: StorageProviderOutcome;
  objectVersion: string;
};

/** Non-persistent adapter for unit tests and explicitly guarded staging scripts only. */
export class DeterministicStorageProvider implements StorageProvider {
  readonly kind = "DETERMINISTIC_TEST" as const;
  private readonly objects = new Map<string, DeterministicObject>();

  putObject(input: {
    bytes: Uint8Array;
    contentType: string;
    deleteOutcomes?: StorageProviderOutcome[];
    headOutcome?: StorageProviderOutcome;
    objectKey: string;
    reportedChecksumSha256?: string;
  }) {
    this.assertKey(input.objectKey);
    if (this.objects.has(input.objectKey)) {
      throw new Error("Deterministic provider rejected an object-key overwrite.");
    }
    const digest = sha256Hex(input.bytes);
    this.objects.set(input.objectKey, {
      bytes: new Uint8Array(input.bytes),
      checksumSha256: input.reportedChecksumSha256 ?? digest,
      contentType: input.contentType,
      deleteOutcomes: [...(input.deleteOutcomes ?? [])],
      headOutcome: input.headOutcome ?? "READY",
      objectVersion: createHash("sha256").update(`${input.objectKey}:${digest}`).digest("hex").slice(0, 32),
    });
  }

  hasObject(objectKey: string) {
    return this.objects.has(objectKey);
  }

  setDeleteOutcomes(objectKey: string, outcomes: StorageProviderOutcome[]) {
    this.assertKey(objectKey);
    const object = this.objects.get(objectKey);
    if (!object) throw new Error("Deterministic provider object is unavailable.");
    object.deleteOutcomes = [...outcomes];
  }

  async createUploadTarget(input: {
    contentType: string;
    expiresAt: Date;
    objectKey: string;
    sizeBytes: number;
  }): Promise<UploadTargetResult> {
    this.assertKey(input.objectKey);
    const reference = createHash("sha256").update(input.objectKey).digest("hex").slice(0, 32);
    const token = createHash("sha256")
      .update(`${input.objectKey}:${input.expiresAt.toISOString()}:${input.sizeBytes}:${input.contentType}`)
      .digest("hex");
    return {
      expiresAt: input.expiresAt,
      headers: {
        "content-length": String(input.sizeBytes),
        "content-type": input.contentType,
        "if-none-match": "*",
      },
      method: "PUT",
      outcome: "READY",
      providerUploadReference: reference,
      url: `https://deterministic-storage.invalid/upload/${reference}?token=${token}`,
      writeOnce: true,
    };
  }

  async headObject(input: SafeObjectReference): Promise<ObjectMetadataResult> {
    this.assertReference(input);
    const object = this.objects.get(input.objectKey);
    if (!object) return { outcome: "NOT_FOUND" };
    if (object.headOutcome !== "READY") return { outcome: object.headOutcome as Exclude<StorageProviderOutcome, "READY"> };
    return {
      checksumSha256: object.checksumSha256,
      contentType: object.contentType,
      objectVersion: object.objectVersion,
      outcome: "READY",
      sizeBytes: object.bytes.byteLength,
    };
  }

  async getObjectForInspection(
    input: SafeObjectReference & { maxBytes: number },
  ): Promise<ObjectContentResult> {
    this.assertReference(input);
    const object = this.objects.get(input.objectKey);
    if (!object) return { outcome: "NOT_FOUND" };
    if (object.headOutcome !== "READY") return { outcome: object.headOutcome as Exclude<StorageProviderOutcome, "READY"> };
    if (object.bytes.byteLength > input.maxBytes) return { outcome: "PERMANENT_FAILURE" };
    return { bytes: new Uint8Array(object.bytes), outcome: "READY" };
  }

  async createDownloadTarget(
    input: SafeObjectReference & {
      expiresAt: Date;
      visibility: "PUBLIC" | "PRIVATE" | "INTERNAL";
    },
  ): Promise<DownloadTargetResult> {
    this.assertReference(input);
    if (!this.objects.has(input.objectKey)) return { outcome: "NOT_FOUND" };
    const fingerprint = createHash("sha256")
      .update(`${input.objectKey}:${input.expiresAt.toISOString()}`)
      .digest("hex");
    return {
      expiresAt: input.expiresAt,
      outcome: "READY",
      url: `https://deterministic-storage.invalid/download/${fingerprint.slice(0, 32)}?signature=${fingerprint}`,
    };
  }

  async deleteObject(input: SafeObjectReference): Promise<DeleteObjectResult> {
    this.assertReference(input);
    const object = this.objects.get(input.objectKey);
    if (!object) return { outcome: "NOT_FOUND" };
    const next = object.deleteOutcomes.shift();
    if (next && next !== "READY") return { outcome: next };
    this.objects.delete(input.objectKey);
    return { outcome: "READY" };
  }

  async writeObject(input: SafeObjectReference & {
    bytes: Uint8Array;
    checksumSha256: string;
    contentType: string;
  }): Promise<WriteObjectResult> {
    this.assertReference(input);
    if (this.objects.has(input.objectKey)) return { outcome: "PERMANENT_FAILURE" };
    const checksumSha256 = sha256Hex(input.bytes);
    if (checksumSha256 !== input.checksumSha256 || input.contentType !== "image/webp") {
      return { outcome: "PERMANENT_FAILURE" };
    }
    this.putObject({
      bytes: input.bytes,
      contentType: input.contentType,
      objectKey: input.objectKey,
      reportedChecksumSha256: checksumSha256,
    });
    const object = this.objects.get(input.objectKey)!;
    return {
      checksumSha256,
      contentType: object.contentType,
      objectVersion: object.objectVersion,
      outcome: "READY",
      sizeBytes: object.bytes.byteLength,
      writeOnce: true,
    };
  }

  private assertReference(input: SafeObjectReference) {
    if (input.provider !== this.kind) throw new Error("Deterministic provider identity mismatch.");
    this.assertKey(input.objectKey);
  }

  private assertKey(objectKey: string) {
    if (!isServerGeneratedStorageKey(objectKey)) {
      throw new Error("Deterministic provider rejected an unsafe object key.");
    }
  }
}
