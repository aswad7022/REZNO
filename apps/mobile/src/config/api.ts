import Constants from "expo-constants";

import { resolveMobileApiBaseUrl } from "./api-base-url";

const configuredApiBaseUrl =
  process.env.EXPO_PUBLIC_REZNO_API_BASE_URL ??
  Constants.expoConfig?.extra?.apiBaseUrl;

export const API_BASE_URL = resolveMobileApiBaseUrl(
  configuredApiBaseUrl,
  __DEV__,
);

export const MOBILE_AUTH_FLOW_TIMEOUT_MS = 20_000;
