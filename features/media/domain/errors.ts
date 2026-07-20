export type MediaErrorCode =
  | "VALIDATION_ERROR"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "STALE_VERSION"
  | "IDEMPOTENCY_CONFLICT"
  | "ASSET_NOT_READY"
  | "ASSET_IN_USE"
  | "MEDIA_PURPOSE_MISMATCH"
  | "MEDIA_SLOT_OCCUPIED"
  | "MEDIA_COLLECTION_LIMIT_REACHED"
  | "MEDIA_BINDING_NOT_ACTIVE"
  | "STORAGE_PROVIDER_NOT_CONFIGURED"
  | "STORAGE_PROVIDER_FAILURE"
  | "RATE_LIMITED";

const statuses: Record<MediaErrorCode, number> = {
  VALIDATION_ERROR: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  STALE_VERSION: 409,
  IDEMPOTENCY_CONFLICT: 409,
  ASSET_NOT_READY: 409,
  ASSET_IN_USE: 409,
  MEDIA_PURPOSE_MISMATCH: 409,
  MEDIA_SLOT_OCCUPIED: 409,
  MEDIA_COLLECTION_LIMIT_REACHED: 409,
  MEDIA_BINDING_NOT_ACTIVE: 409,
  STORAGE_PROVIDER_NOT_CONFIGURED: 503,
  STORAGE_PROVIDER_FAILURE: 503,
  RATE_LIMITED: 429,
};

export class MediaDomainError extends Error {
  readonly status: number;

  constructor(
    readonly code: MediaErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MediaDomainError";
    this.status = statuses[code];
  }
}

export function mediaError(code: MediaErrorCode, message: string): never {
  throw new MediaDomainError(code, message);
}
