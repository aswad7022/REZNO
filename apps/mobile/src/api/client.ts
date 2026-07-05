import { API_BASE_URL } from "../config/api";
import type { MobileApiError } from "../types/marketplace";

export class MobileApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "MobileApiRequestError";
  }
}

export async function mobileApiGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(path, ensureTrailingSlash(API_BASE_URL));

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  const payload = (await response.json().catch(() => null)) as
    | MobileApiError
    | T
    | null;

  if (!response.ok) {
    const errorPayload = isMobileApiError(payload) ? payload.error : null;

    throw new MobileApiRequestError(
      errorPayload?.message ?? "Could not load data.",
      response.status,
      errorPayload?.code,
    );
  }

  return payload as T;
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function isMobileApiError(value: unknown): value is MobileApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "object" &&
    value.error !== null
  );
}
