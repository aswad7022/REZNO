import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";

import { captureMobileApiSession } from "../api/client";
import type {
  MobileHostedPaymentHandoff,
  MobilePaymentIntent,
} from "../types/payments";
import { HostedPaymentCoordinator } from "./hosted-payment-coordinator";
import {
  APPROVED_MOBILE_HOSTED_CHECKOUT_ORIGINS,
  type HostedPaymentRecoveryManifest,
} from "./hosted-payment-policy";
import { HostedPaymentRecoveryStore } from "./hosted-payment-recovery-store";

type Data<T> = { data: T };

const MANIFEST_KEY_PREFIX = "rezno.payments.hosted-return.v1";
const secureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

void WebBrowser.maybeCompleteAuthSession();

const recoveryStore = new HostedPaymentRecoveryStore({
  approvedOrigins: APPROVED_MOBILE_HOSTED_CHECKOUT_ORIGINS,
  deleteItem: (key) =>
    SecureStore.deleteItemAsync(key, secureStoreOptions),
  getItem: (key) =>
    SecureStore.getItemAsync(key, secureStoreOptions),
  async keyForOwner(ownerId) {
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      ownerId,
    );
    return `${MANIFEST_KEY_PREFIX}.${digest}`;
  },
  now: Date.now,
  setItem: (key, value) =>
    SecureStore.setItemAsync(key, value, secureStoreOptions),
});

export const hostedPaymentCoordinator = new HostedPaymentCoordinator({
  approvedOrigins: APPROVED_MOBILE_HOSTED_CHECKOUT_ORIGINS,
  captureApiSession() {
    const session = captureMobileApiSession();
    return {
      async consumeReturn(intentId, state, signal) {
        return (
          await session.request<Data<MobilePaymentIntent>>(
            `/api/mobile/payments/intents/${encodeURIComponent(intentId)}/hosted-return`,
            {
              body: { state },
              method: "POST",
              signal,
            },
          )
        ).data;
      },
      async createHandoff(intentId, idempotencyKey, signal) {
        return (
          await session.request<Data<MobileHostedPaymentHandoff>>(
            `/api/mobile/payments/intents/${encodeURIComponent(intentId)}/hosted-handoff`,
            {
              headers: { "Idempotency-Key": idempotencyKey },
              method: "POST",
              signal,
            },
          )
        ).data;
      },
      async getIntent(intentId, signal) {
        return (
          await session.request<Data<MobilePaymentIntent>>(
            `/api/mobile/payments/intents/${encodeURIComponent(intentId)}`,
            { signal },
          )
        ).data;
      },
    };
  },
  cleanup: (manifest) => recoveryStore.cleanup(manifest),
  createAbortController: () => new AbortController(),
  load: (ownerId) => recoveryStore.load(ownerId),
  now: Date.now,
  async openBrowser(checkoutUrl, returnUrl, signal) {
    if (signal.aborted) throw abortError();
    const opened = WebBrowser.openAuthSessionAsync(checkoutUrl, returnUrl, {
      createTask: false,
      dismissButtonStyle: "cancel",
      enableBarCollapsing: false,
      preferEphemeralSession: true,
      showInRecents: false,
    });
    let rejectAborted: ((error: Error) => void) | null = null;
    const onAbort = () => {
      try {
        WebBrowser.dismissAuthSession();
      } catch {
        // The abort result remains authoritative if the native session already
        // closed between the signal and the dismissal request.
      }
      rejectAborted?.(abortError());
    };
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAborted = reject;
      signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      return await Promise.race([opened, aborted]);
    } finally {
      rejectAborted = null;
      signal.removeEventListener("abort", onAbort);
    }
  },
  persist: (manifest: HostedPaymentRecoveryManifest) =>
    recoveryStore.persist(manifest),
  uuid: Crypto.randomUUID,
  wait: (milliseconds) =>
    new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    }),
});

function abortError() {
  const error = new Error("Hosted payment browser was cancelled.");
  error.name = "AbortError";
  return error;
}
