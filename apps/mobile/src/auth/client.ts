import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

import { API_BASE_URL } from "../config/api";

const REZNO_MOBILE_SCHEME = "rezno";
const REZNO_STORAGE_PREFIX = "rezno";

export const mobileAuthClient = createAuthClient({
  baseURL: API_BASE_URL,
  plugins: [
    expoClient({
      scheme: REZNO_MOBILE_SCHEME,
      storage: SecureStore,
      storagePrefix: REZNO_STORAGE_PREFIX,
    }),
  ],
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
