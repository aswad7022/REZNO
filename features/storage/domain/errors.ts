export type StorageErrorCode =
  | "VALIDATION_ERROR"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "STALE_VERSION"
  | "IDEMPOTENCY_CONFLICT"
  | "UPLOAD_SESSION_EXPIRED"
  | "UPLOAD_SESSION_NOT_ACTIVE"
  | "UPLOAD_OBJECT_MISMATCH"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "FILE_TOO_LARGE"
  | "STORAGE_QUOTA_EXCEEDED"
  | "ASSET_NOT_READY"
  | "STORAGE_PROVIDER_NOT_CONFIGURED"
  | "STORAGE_PROVIDER_FAILURE"
  | "RATE_LIMITED"
  | "INVALID_CURSOR";

const statuses: Record<StorageErrorCode, number> = {
  VALIDATION_ERROR: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  STALE_VERSION: 409,
  IDEMPOTENCY_CONFLICT: 409,
  UPLOAD_SESSION_EXPIRED: 410,
  UPLOAD_SESSION_NOT_ACTIVE: 409,
  UPLOAD_OBJECT_MISMATCH: 409,
  UNSUPPORTED_MEDIA_TYPE: 415,
  FILE_TOO_LARGE: 413,
  STORAGE_QUOTA_EXCEEDED: 429,
  ASSET_NOT_READY: 409,
  STORAGE_PROVIDER_NOT_CONFIGURED: 503,
  STORAGE_PROVIDER_FAILURE: 503,
  RATE_LIMITED: 429,
  INVALID_CURSOR: 400,
};

export class StorageDomainError extends Error {
  readonly status: number;

  constructor(
    readonly code: StorageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StorageDomainError";
    this.status = statuses[code];
  }
}

export function storageError(code: StorageErrorCode, message: string): never {
  throw new StorageDomainError(code, message);
}
