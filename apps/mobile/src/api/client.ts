import { API_BASE_URL } from "../config/api";
import { readMobileSessionCookie } from "../auth/session-cookie";
import {
  executeMobileApiRequest,
  MobileApiRequestError,
  type MobileApiRequestOptions,
} from "./transport";

export { MobileApiRequestError };
export type { MobileApiRequestOptions };

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
        {
          apiBaseUrl: API_BASE_URL,
          cookie,
          credentialPolicy: "CAPTURED",
        },
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
  return executeMobileApiRequest(path, options, {
    apiBaseUrl: API_BASE_URL,
    cookie,
    credentialPolicy: options.authenticated ? "AMBIENT" : "NONE",
  });
}
