import { resolveMobileManagedMediaPaths } from "../config/media-url";
import type { MobileApiError } from "../types/marketplace";

export class MobileApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: Record<string, unknown>,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "MobileApiRequestError";
  }
}

export type MobileApiRequestOptions = {
  authenticated?: boolean;
  body?: unknown;
  headers?: Record<string, string>;
  method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  params?: Record<string, boolean | string | number | undefined>;
  signal?: AbortSignal;
};

export type MobileApiCredentialPolicy = "AMBIENT" | "CAPTURED" | "NONE";

export async function executeMobileApiRequest<T>(
  path: string,
  options: MobileApiRequestOptions,
  context: {
    apiBaseUrl: string;
    cookie: string;
    credentialPolicy: MobileApiCredentialPolicy;
  },
) {
  if (context.credentialPolicy === "CAPTURED") {
    assertNoCapturedCredentialOverride(options.headers);
  }

  const url = new URL(path, ensureTrailingSlash(context.apiBaseUrl));

  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const authenticated = context.credentialPolicy !== "NONE";
  const response = await fetch(url.toString(), {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: context.credentialPolicy === "AMBIENT" ? "include" : "omit",
    headers: {
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(authenticated ? { "expo-origin": "rezno://" } : {}),
      ...(context.cookie ? { cookie: context.cookie } : {}),
      ...options.headers,
    },
    method: options.method ?? "GET",
    signal: options.signal,
  });
  const payload = resolveMobileManagedMediaPaths(
    await response.json().catch(() => null),
    context.apiBaseUrl,
  ) as
    | MobileApiError
    | T
    | null;

  if (!response.ok) {
    const errorPayload = isMobileApiError(payload) ? payload.error : null;

    throw new MobileApiRequestError(
      errorPayload?.message ?? "Could not load data.",
      response.status,
      errorPayload?.code,
      isRecord(errorPayload?.details) ? errorPayload.details : undefined,
      parseRetryAfter(response.headers.get("retry-after")),
    );
  }

  return payload as T;
}

function assertNoCapturedCredentialOverride(
  headers: Record<string, string> | undefined,
) {
  for (const name of Object.keys(headers ?? {})) {
    const normalized = name.trim().toLowerCase();
    if (normalized === "cookie" || normalized === "authorization") {
      throw new Error(
        "Captured mobile API sessions do not accept credential headers.",
      );
    }
  }
}

function parseRetryAfter(value: string | null) {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
