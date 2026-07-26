import { API_BASE_URL } from "../config/api";
import { readMobileSessionCookie } from "../auth/session-cookie";
import type { MobileApiError } from "../types/marketplace";
import { resolveMobileManagedMediaPaths } from "../config/media-url";

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

export type MobileApiSessionSnapshot = {
  request<T>(
    path: string,
    options?: Omit<MobileApiRequestOptions, "authenticated">,
  ): Promise<T>;
};

export function captureMobileApiSession(): MobileApiSessionSnapshot {
  const cookie = readMobileSessionCookie();
  return {
    request<T>(
      path: string,
      options: Omit<MobileApiRequestOptions, "authenticated"> = {},
    ) {
      return executeMobileApiRequest<T>(
        path,
        { ...options, authenticated: true },
        cookie,
      );
    },
  };
}

export async function mobileApiGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  return mobileApiRequest<T>(path, { params });
}

export async function mobileApiRequest<T>(
  path: string,
  options: MobileApiRequestOptions = {},
): Promise<T> {
  const cookie = options.authenticated ? readMobileSessionCookie() : "";
  return executeMobileApiRequest(path, options, cookie);
}

async function executeMobileApiRequest<T>(
  path: string,
  options: MobileApiRequestOptions,
  cookie: string,
) {
  const url = new URL(path, ensureTrailingSlash(API_BASE_URL));

  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: options.authenticated ? "include" : "omit",
    headers: {
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.authenticated ? { "expo-origin": "rezno://" } : {}),
      ...(cookie ? { cookie } : {}),
      ...options.headers,
    },
    method: options.method ?? "GET",
    signal: options.signal,
  });
  const payload = resolveMobileManagedMediaPaths(
    await response.json().catch(() => null),
    API_BASE_URL,
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
