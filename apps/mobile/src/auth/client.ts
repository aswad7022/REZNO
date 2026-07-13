import { createAuthClient } from "better-auth/react";

import {
  API_BASE_URL,
  MOBILE_AUTH_FLOW_TIMEOUT_MS,
} from "../config/api";
import {
  persistMobileSessionCookies,
  readMobileSessionCookie,
} from "./session-cookie";

const REZNO_MOBILE_SCHEME = "rezno";
let authTransportSequence = 0;
let authCookieWrite = Promise.resolve();

export const mobileAuthClient = createAuthClient({
  baseURL: API_BASE_URL,
  fetchOptions: {
    credentials: "omit",
    onRequest(context) {
      const sequence = ++authTransportSequence;
      const cookie = readMobileSessionCookie();
      context.headers.set("expo-origin", `${REZNO_MOBILE_SCHEME}://`);
      context.headers.set("x-skip-oauth-proxy", "true");
      if (cookie) context.headers.set("cookie", cookie);
      return { ...context, mobileAuthSequence: sequence };
    },
    async onResponse(context) {
      const request = context.request as typeof context.request & {
        mobileAuthSequence?: number;
      };
      const setCookie = context.response.headers.get("set-cookie");
      if (!setCookie) return;

      const sequence = request.mobileAuthSequence;
      const write = authCookieWrite.then(async () => {
        if (sequence !== authTransportSequence) return;
        await persistMobileSessionCookies(setCookie);
      });
      authCookieWrite = write.catch(() => undefined);
      await write;
    },
    timeout: MOBILE_AUTH_FLOW_TIMEOUT_MS,
  },
});

export type EmailAuthInput = {
  email: string;
  password: string;
};

export type EmailSignUpInput = EmailAuthInput & {
  name: string;
};

export function signInWithEmail(input: EmailAuthInput) {
  return mobileAuthClient.signIn.email(input);
}

export function signUpWithEmail(input: EmailSignUpInput) {
  return mobileAuthClient.signUp.email(input);
}

export function getMobileSession() {
  return mobileAuthClient.getSession();
}

export function signOutMobile() {
  return mobileAuthClient.signOut();
}
