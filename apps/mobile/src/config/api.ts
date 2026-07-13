import Constants from "expo-constants";

const configuredApiBaseUrl =
  process.env.EXPO_PUBLIC_REZNO_API_BASE_URL ??
  Constants.expoConfig?.extra?.apiBaseUrl;

export const API_BASE_URL =
  typeof configuredApiBaseUrl === "string" && configuredApiBaseUrl.length > 0
    ? configuredApiBaseUrl
    : "http://localhost:3000";

export const MOBILE_AUTH_FLOW_TIMEOUT_MS = 20_000;
