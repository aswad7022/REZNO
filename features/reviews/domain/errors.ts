export type ReviewErrorCode =
  | "BOOKING_NOT_REVIEWABLE"
  | "CUSTOMER_UNAVAILABLE"
  | "FORBIDDEN"
  | "INVALID_CURSOR"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "REVIEW_CONFLICT";

export class ReviewDomainError extends Error {
  constructor(
    readonly code: ReviewErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ReviewDomainError";
  }
}

export function reviewDomainError(
  code: ReviewErrorCode,
  message: string,
  details?: Record<string, unknown>,
): never {
  throw new ReviewDomainError(code, message, details);
}
