import { mobileApiRequest } from "./client";
import type { MobilePaymentCapabilities, MobilePaymentIntent, MobilePaymentPage } from "../types/payments";

type Data<T> = { data: T };

export const paymentApi = {
  capabilities: async (target?: { targetId: string; targetType: "BOOKING" | "CART" | "ORDER" }) =>
    (await mobileApiRequest<Data<MobilePaymentCapabilities>>("/api/mobile/payments/capabilities", {
      authenticated: true,
      params: target,
    })).data,
  cancelIntent: async (intentId: string, expectedVersion: number, idempotencyKey: string) =>
    (await mobileApiRequest<Data<MobilePaymentIntent>>(`/api/mobile/payments/intents/${intentId}/cancel`, {
      authenticated: true,
      body: { expectedVersion },
      headers: { "idempotency-key": idempotencyKey },
      method: "POST",
    })).data,
  createIntent: async (target: { targetId: string; targetType: "BOOKING" | "ORDER" }, idempotencyKey: string) =>
    (await mobileApiRequest<Data<MobilePaymentIntent>>("/api/mobile/payments/intents", {
      authenticated: true,
      body: target,
      headers: { "idempotency-key": idempotencyKey },
      method: "POST",
    })).data,
  getIntent: async (intentId: string) =>
    (await mobileApiRequest<Data<MobilePaymentIntent>>(`/api/mobile/payments/intents/${intentId}`, {
      authenticated: true,
    })).data,
  listIntents: async (cursor?: string) =>
    (await mobileApiRequest<Data<MobilePaymentPage>>("/api/mobile/payments/intents", {
      authenticated: true,
      params: { cursor, limit: 20 },
    })).data,
  retryIntent: async (intentId: string, idempotencyKey: string) =>
    (await mobileApiRequest<Data<MobilePaymentIntent>>(`/api/mobile/payments/intents/${intentId}/retry`, {
      authenticated: true,
      headers: { "idempotency-key": idempotencyKey },
      method: "POST",
    })).data,
};
