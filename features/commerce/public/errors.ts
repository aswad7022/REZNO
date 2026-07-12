export type PublicCommerceErrorCode =
  | "INVALID_QUERY"
  | "INVALID_CURSOR"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export class PublicCommerceError extends Error {
  constructor(
    readonly code: PublicCommerceErrorCode,
    readonly status: 400 | 404 | 429 | 500,
    message: string,
  ) {
    super(message);
    this.name = "PublicCommerceError";
  }
}

export function publicCommerceError(
  code: PublicCommerceErrorCode,
  status: 400 | 404 | 429 | 500,
  message: string,
): never {
  throw new PublicCommerceError(code, status, message);
}

export function publicCommerceErrorResponse(error: unknown) {
  if (error instanceof PublicCommerceError) {
    return {
      body: { error: { code: error.code, message: error.message } },
      status: error.status,
    } as const;
  }
  return {
    body: {
      error: {
        code: "INTERNAL_ERROR" as const,
        message: "The Commerce catalog could not be loaded.",
      },
    },
    status: 500 as const,
  };
}
