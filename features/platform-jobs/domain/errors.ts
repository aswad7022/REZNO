export type PlatformJobErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_CURSOR"
  | "PAYLOAD_TOO_LARGE"
  | "JOB_NOT_CANCELLABLE"
  | "JOB_NOT_REQUEUEABLE"
  | "STALE_LEASE"
  | "LEASE_EXPIRED"
  | "RATE_LIMITED"
  | "PLATFORM_JOB_FAILURE";

const STATUS: Record<PlatformJobErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  INVALID_CURSOR: 400,
  PAYLOAD_TOO_LARGE: 413,
  JOB_NOT_CANCELLABLE: 409,
  JOB_NOT_REQUEUEABLE: 409,
  STALE_LEASE: 409,
  LEASE_EXPIRED: 409,
  RATE_LIMITED: 429,
  PLATFORM_JOB_FAILURE: 500,
};

export class PlatformJobDomainError extends Error {
  readonly status: number;

  constructor(readonly code: PlatformJobErrorCode, message: string) {
    super(message);
    this.name = "PlatformJobDomainError";
    this.status = STATUS[code];
  }
}

export function platformJobError(code: PlatformJobErrorCode, message: string): never {
  throw new PlatformJobDomainError(code, message);
}
