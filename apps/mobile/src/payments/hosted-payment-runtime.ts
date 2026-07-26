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
  parseHostedPaymentRecoveryManifest,
  type HostedPaymentRecoveryManifest,
} from "./hosted-payment-policy";

type Data<T> = { data: T };

const MANIFEST_KEY = "rezno.payments.hosted-return.v1";
const secureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

void WebBrowser.maybeCompleteAuthSession();

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
  async cleanup(manifest) {
    const raw = await SecureStore.getItemAsync(
      MANIFEST_KEY,
      secureStoreOptions,
    );
    if (!raw) return;
    let operationId: unknown;
    try {
      operationId = (JSON.parse(raw) as { operationId?: unknown }).operationId;
    } catch {
      operationId = null;
    }
    if (operationId === manifest.operationId || operationId === null) {
      await SecureStore.deleteItemAsync(MANIFEST_KEY, secureStoreOptions);
    }
  },
  createAbortController: () => new AbortController(),
  async load(ownerId) {
    const raw = await SecureStore.getItemAsync(
      MANIFEST_KEY,
      secureStoreOptions,
    );
    if (!raw) return null;
    try {
      return parseHostedPaymentRecoveryManifest(raw, {
        allowExpired: true,
        approvedOrigins: APPROVED_MOBILE_HOSTED_CHECKOUT_ORIGINS,
        now: Date.now(),
        ownerId,
      });
    } catch {
      await SecureStore.deleteItemAsync(MANIFEST_KEY, secureStoreOptions);
      return null;
    }
  },
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
  async persist(manifest: HostedPaymentRecoveryManifest) {
    await SecureStore.setItemAsync(
      MANIFEST_KEY,
      JSON.stringify(manifest),
      secureStoreOptions,
    );
  },
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
