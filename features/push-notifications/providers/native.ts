import "server-only";

import { createHash } from "node:crypto";
import * as http2 from "node:http2";

import { Prisma, type PushProvider } from "@prisma/client";
import { importPKCS8, SignJWT } from "jose";

import type {
  OutboundProvider,
  ProviderSendResult,
  SafeProviderMessage,
} from "@/features/communications/providers/provider";
import { pushEndpointReference } from "@/features/communications/services/endpoints";
import {
  PUSH_PROVIDER_TIMEOUT_MS,
  type NativePushPayload,
  type NativePushSendResult,
} from "@/features/push-notifications/domain/contracts";
import {
  decryptPushToken,
  deletePushTokenMaterial,
} from "@/features/push-notifications/domain/crypto";
import { prisma } from "@/lib/db/prisma";

const PUSH_ENDPOINT_PATTERN =
  /^push-person:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):([0-9a-f]{64})$/i;
const MAX_TARGET_ATTEMPTS = 3;
const STALE_SEND_MS = 15 * 60_000;

type NativeTransport = (
  provider: PushProvider,
  token: string,
  payload: NativePushPayload,
  providerRequestId: string,
) => Promise<NativePushSendResult>;
let testNativeTransport: NativeTransport | undefined;

export function setPushTestNativeTransport(transport: NativeTransport | undefined) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Push transport test injection is unavailable in production.");
  }
  testNativeTransport = transport;
}

export class DevicePushProvider implements OutboundProvider {
  readonly channel = "PUSH" as const;

  async send(message: SafeProviderMessage): Promise<ProviderSendResult> {
    if (
      !testNativeTransport
      && nativePushProviderConfigurationTruth("APNS") !== "CONFIGURED"
      && nativePushProviderConfigurationTruth("FCM") !== "CONFIGURED"
    ) {
      return {
        outcome: "NOT_CONFIGURED",
        providerMessageId: null,
        providerName: "not-configured",
        retryable: false,
        safeCode: "PROVIDER_NOT_CONFIGURED",
      };
    }
    const endpoint = PUSH_ENDPOINT_PATTERN.exec(message.endpoint);
    if (!endpoint) return permanent("PUSH_ENDPOINT_INVALID");
    const personId = endpoint[1].toLowerCase();
    const expectedDigest = endpoint[2].toLowerCase();
    const installations = await prisma.pushInstallation.findMany({
      where: {
        permissionStatus: { in: ["GRANTED", "PROVISIONAL"] },
        personId,
        person: {
          deletedAt: null,
          isOnboarded: true,
          status: "ACTIVE",
        },
        status: "ACTIVE",
      },
      orderBy: [{ tokenFingerprint: "asc" }, { id: "asc" }],
    });
    if (installations.length === 0) return permanent("PUSH_ENDPOINT_MISSING");
    const currentEndpoint = pushEndpointReference(
      personId,
      installations.map((installation) => installation.tokenFingerprint),
    );
    if (!currentEndpoint.endsWith(`:${expectedDigest}`)) {
      return permanent("PUSH_ENDPOINT_CHANGED");
    }
    const payload = pushPayload(message);
    const results = [];
    for (const installation of installations) {
      if (
        !testNativeTransport
        && nativePushProviderConfigurationTruth(installation.provider) !== "CONFIGURED"
      ) {
        results.push({
          outcome: "NOT_CONFIGURED" as const,
          providerMessageId: null,
          safeCode: `${installation.provider}_NOT_CONFIGURED`,
        });
        continue;
      }
      results.push(await sendInstallationTarget({
        installation,
        message,
        payload,
      }));
    }
    const groupId = `push_${createHash("sha256")
      .update(message.providerIdempotencyKey, "utf8")
      .digest("hex")
      .slice(0, 32)}`;
    if (results.every((result) => result.outcome === "ACCEPTED")) {
      return {
        outcome: "ACCEPTED",
        providerMessageId: groupId,
        providerName: "rezno-native-push",
        retryable: false,
        safeCode: "PUSH_ACCEPTED",
      };
    }
    if (results.some((result) => result.outcome === "TRANSIENT_FAILURE")) {
      return {
        outcome: "TRANSIENT_FAILURE",
        providerMessageId: null,
        providerName: "rezno-native-push",
        retryable: true,
        safeCode: "PUSH_TRANSIENT",
      };
    }
    if (results.every((result) => result.outcome === "NOT_CONFIGURED")) {
      return {
        outcome: "NOT_CONFIGURED",
        providerMessageId: null,
        providerName: "not-configured",
        retryable: false,
        safeCode: "PUSH_PROVIDER_NOT_CONFIGURED",
      };
    }
    return permanent("PUSH_PARTIAL_OR_PERMANENT_FAILURE");
  }
}

export function nativePushProviderConfigurationTruth(
  provider: PushProvider,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (provider === "APNS") {
    return validApnsConfiguration(environment) ? "CONFIGURED" as const : "NOT_CONFIGURED" as const;
  }
  return validFcmConfiguration(environment) ? "CONFIGURED" as const : "NOT_CONFIGURED" as const;
}

export function pushReceiptProviderConfigurationTruth(
  provider: PushProvider,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const providers = (environment.REZNO_PUSH_RECEIPT_PROVIDERS ?? "")
    .split(",")
    .filter(Boolean);
  return providers.includes(provider)
    && (environment.REZNO_PUSH_RECEIPT_HMAC_SECRET?.length ?? 0) >= 32
    && validPushEnvironment(environment)
    ? "CONFIGURED" as const
    : "NOT_CONFIGURED" as const;
}

async function sendInstallationTarget(input: {
  installation: {
    id: string;
    installationId: string;
    provider: PushProvider;
    tokenCiphertext: string;
    tokenVersion: number;
  };
  message: SafeProviderMessage;
  payload: NativePushPayload;
}) {
  const claim = await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`push-target:${input.message.deliveryId}:${input.installation.id}`}, 0)
      )
    `);
    let target = await transaction.pushDeliveryTarget.findUnique({
      where: {
        outboundDeliveryId_installationId: {
          installationId: input.installation.id,
          outboundDeliveryId: input.message.deliveryId,
        },
      },
    });
    if (!target) {
      target = await transaction.pushDeliveryTarget.create({
        data: {
          installationId: input.installation.id,
          installationTokenVersion: input.installation.tokenVersion,
          outboundDeliveryId: input.message.deliveryId,
        },
      });
    }
    if (target.status === "ACCEPTED" || target.status === "DELIVERED") {
      return { kind: "ACCEPTED" as const, providerMessageId: target.providerMessageId };
    }
    if (
      target.status === "PERMANENT_FAILURE"
      || target.status === "INVALID_TOKEN"
      || target.status === "UNKNOWN"
    ) {
      return { kind: "PERMANENT" as const, safeCode: target.lastSafeCode ?? "PUSH_TERMINAL" };
    }
    if (
      target.installationTokenVersion !== input.installation.tokenVersion
    ) {
      return {
        kind: "PERMANENT" as const,
        safeCode: "PUSH_TOKEN_GENERATION_CHANGED",
      };
    }
    const now = new Date();
    if (target.status === "SENDING") {
      if (now.getTime() - target.updatedAt.getTime() < STALE_SEND_MS) {
        return { kind: "TRANSIENT" as const, safeCode: "PUSH_SEND_IN_PROGRESS" };
      }
      await transaction.pushDeliveryTarget.update({
        where: { id: target.id },
        data: {
          failedAt: now,
          lastSafeCode: "PUSH_RESULT_UNKNOWN",
          status: "UNKNOWN",
        },
      });
      return { kind: "PERMANENT" as const, safeCode: "PUSH_RESULT_UNKNOWN" };
    }
    if (target.attemptCount >= MAX_TARGET_ATTEMPTS) {
      await transaction.pushDeliveryTarget.update({
        where: { id: target.id },
        data: {
          failedAt: now,
          lastSafeCode: "PUSH_MAX_ATTEMPTS",
          status: "PERMANENT_FAILURE",
        },
      });
      return { kind: "PERMANENT" as const, safeCode: "PUSH_MAX_ATTEMPTS" };
    }
    const claimed = await transaction.pushDeliveryTarget.update({
      where: { id: target.id },
      data: {
        attemptCount: { increment: 1 },
        claimGeneration: { increment: 1 },
        failedAt: null,
        lastSafeCode: null,
        status: "SENDING",
      },
    });
    return {
      generation: claimed.claimGeneration,
      kind: "SEND" as const,
      providerRequestId: claimed.id,
      targetId: claimed.id,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (claim.kind === "ACCEPTED") {
    return {
      outcome: "ACCEPTED" as const,
      providerMessageId: claim.providerMessageId,
      safeCode: "PUSH_ALREADY_ACCEPTED",
    };
  }
  if (claim.kind === "TRANSIENT") {
    return {
      outcome: "TRANSIENT_FAILURE" as const,
      providerMessageId: null,
      safeCode: claim.safeCode,
    };
  }
  if (claim.kind === "PERMANENT") {
    return {
      outcome: "PERMANENT_FAILURE" as const,
      providerMessageId: null,
      safeCode: claim.safeCode,
    };
  }

  let transportResult: NativePushSendResult;
  try {
    const token = decryptPushToken({
      ciphertext: input.installation.tokenCiphertext,
      installationId: input.installation.installationId,
      provider: input.installation.provider,
    });
    transportResult = await (testNativeTransport ?? sendNativePush)(
      input.installation.provider,
      token,
      input.payload,
      claim.providerRequestId,
    );
  } catch {
    transportResult = {
      ambiguous: true,
      invalidToken: false,
      outcome: "TRANSIENT_FAILURE",
      providerMessageId: null,
      retryable: false,
      safeCode: "PUSH_TRANSPORT_EXCEPTION",
    };
  }
  const finalized = await prisma.$transaction(async (transaction) => {
    const target = await transaction.pushDeliveryTarget.findUnique({
      where: { id: claim.targetId },
    });
    if (
      !target
      || target.status !== "SENDING"
      || target.claimGeneration !== claim.generation
    ) {
      return { outcome: "TRANSIENT_FAILURE" as const, safeCode: "PUSH_CLAIM_FENCED" };
    }
    const now = new Date();
    if (transportResult.invalidToken) {
      const deleted = deletePushTokenMaterial({
        installationId: input.installation.installationId,
        provider: input.installation.provider,
      });
      await transaction.pushInstallation.updateMany({
        where: {
          id: input.installation.id,
          status: "ACTIVE",
          tokenVersion: target.installationTokenVersion,
        },
        data: {
          ...deleted,
          invalidatedAt: now,
          revokedAt: null,
          status: "INVALIDATED",
        },
      });
    }
    const status = transportResult.invalidToken
      ? "INVALID_TOKEN"
      : transportResult.outcome === "ACCEPTED"
        ? "ACCEPTED"
        : transportResult.ambiguous
          ? "UNKNOWN"
          : transportResult.outcome === "TRANSIENT_FAILURE"
            && transportResult.retryable
            && target.attemptCount < MAX_TARGET_ATTEMPTS
            ? "RETRY_SCHEDULED"
            : "PERMANENT_FAILURE";
    await transaction.pushDeliveryTarget.update({
      where: { id: target.id },
      data: {
        acceptedAt: status === "ACCEPTED" ? now : null,
        failedAt: ["INVALID_TOKEN", "UNKNOWN", "PERMANENT_FAILURE"].includes(status)
          ? now
          : null,
        lastSafeCode: transportResult.safeCode,
        providerMessageId: transportResult.providerMessageId,
        providerName: transportResult.providerMessageId
          ? input.installation.provider.toLowerCase()
          : null,
        status,
      },
    });
    return {
      outcome: status === "ACCEPTED"
        ? "ACCEPTED" as const
        : status === "RETRY_SCHEDULED"
          ? "TRANSIENT_FAILURE" as const
          : "PERMANENT_FAILURE" as const,
      providerMessageId: transportResult.providerMessageId,
      safeCode: transportResult.safeCode,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return finalized;
}

async function sendNativePush(
  provider: PushProvider,
  token: string,
  payload: NativePushPayload,
  providerRequestId: string,
) {
  return provider === "APNS"
    ? sendApns(token, payload, providerRequestId)
    : sendFcm(token, payload);
}

async function sendApns(
  token: string,
  payload: NativePushPayload,
  providerRequestId: string,
): Promise<NativePushSendResult> {
  const environment = process.env;
  if (!validApnsConfiguration(environment)) return providerNotConfigured("APNS");
  const privateKey = environment.REZNO_APNS_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const key = await importPKCS8(privateKey, "ES256");
  const authorization = await new SignJWT({})
    .setProtectedHeader({
      alg: "ES256",
      kid: environment.REZNO_APNS_KEY_ID!,
    })
    .setIssuer(environment.REZNO_APNS_TEAM_ID!)
    .setIssuedAt()
    .sign(key);
  const origin = environment.REZNO_APNS_ENVIRONMENT === "production"
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";
  const body = JSON.stringify({
    aps: {
      alert: { body: payload.body, title: payload.title },
      sound: "default",
    },
    ...payload.data,
  });
  return new Promise((resolve) => {
    const client = http2.connect(origin);
    let settled = false;
    const finish = (value: NativePushSendResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.close();
      resolve(value);
    };
    const timer = setTimeout(() => {
      client.destroy();
      finish(ambiguous("APNS_TIMEOUT"));
    }, PUSH_PROVIDER_TIMEOUT_MS);
    client.once("error", () => finish(ambiguous("APNS_CONNECTION_ERROR")));
    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${authorization}`,
      "apns-id": providerRequestId,
      "apns-priority": "10",
      "apns-push-type": "alert",
      "apns-topic": environment.REZNO_APNS_BUNDLE_ID!,
      "content-type": "application/json",
    });
    let status = 0;
    let responseBody = "";
    let responseId: string | null = null;
    request.setEncoding("utf8");
    request.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
      responseId = typeof headers["apns-id"] === "string"
        ? headers["apns-id"]
        : providerRequestId;
    });
    request.on("data", (chunk: string) => {
      if (responseBody.length < 2048) responseBody += chunk;
    });
    request.on("end", () => {
      if (status === 200) {
        finish(accepted(responseId ?? providerRequestId, "APNS_ACCEPTED"));
        return;
      }
      const reason = safeApnsReason(responseBody);
      if (status === 410 || reason === "BadDeviceToken" || reason === "Unregistered") {
        finish({
          invalidToken: true,
          outcome: "PERMANENT_FAILURE",
          providerMessageId: null,
          retryable: false,
          safeCode: `APNS_${reason === "UNKNOWN" ? "UNREGISTERED" : reason.toUpperCase()}`.slice(0, 80),
        });
        return;
      }
      if (status === 429 || status >= 500) {
        finish(transient(`APNS_HTTP_${status || 0}`));
        return;
      }
      finish(permanentNative(`APNS_HTTP_${status || 0}`));
    });
    request.once("error", () => finish(ambiguous("APNS_REQUEST_ERROR")));
    request.end(body);
  });
}

let fcmAccessTokenCache:
  | { expiresAt: number; token: string; configurationKey: string }
  | undefined;

async function sendFcm(
  token: string,
  payload: NativePushPayload,
): Promise<NativePushSendResult> {
  const environment = process.env;
  if (!validFcmConfiguration(environment)) return providerNotConfigured("FCM");
  const accessToken = await getFcmAccessToken(environment);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PUSH_PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${environment.REZNO_FCM_PROJECT_ID}/messages:send`,
      {
        body: JSON.stringify({
          message: {
            android: { priority: "high" },
            data: {
              destinationKind: payload.data.destinationKind,
              targetId: payload.data.targetId ?? "",
            },
            notification: { body: payload.body, title: payload.title },
            token,
          },
        }),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      },
    );
    const result = await boundedJson(response);
    if (response.ok && typeof result?.name === "string") {
      return accepted(safeFcmMessageId(result.name), "FCM_ACCEPTED");
    }
    const status = safeFcmErrorStatus(result);
    if (status === "UNREGISTERED") {
      return {
        invalidToken: true,
        outcome: "PERMANENT_FAILURE",
        providerMessageId: null,
        retryable: false,
        safeCode: "FCM_UNREGISTERED",
      };
    }
    if (response.status === 429 || response.status >= 500) {
      return transient(`FCM_HTTP_${response.status}`);
    }
    return permanentNative(`FCM_${status ?? `HTTP_${response.status}`}`.slice(0, 80));
  } catch (error) {
    return error instanceof Error && error.name === "AbortError"
      ? ambiguous("FCM_TIMEOUT")
      : ambiguous("FCM_CONNECTION_ERROR");
  } finally {
    clearTimeout(timeout);
  }
}

async function getFcmAccessToken(environment: NodeJS.ProcessEnv) {
  const configurationKey = createHash("sha256")
    .update(`${environment.REZNO_FCM_CLIENT_EMAIL}:${environment.REZNO_FCM_PROJECT_ID}`)
    .digest("hex");
  if (
    fcmAccessTokenCache
    && fcmAccessTokenCache.configurationKey === configurationKey
    && fcmAccessTokenCache.expiresAt > Date.now() + 60_000
  ) {
    return fcmAccessTokenCache.token;
  }
  const key = await importPKCS8(
    environment.REZNO_FCM_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    "RS256",
  );
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(environment.REZNO_FCM_CLIENT_EMAIL!)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PUSH_PROVIDER_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      body: new URLSearchParams({
        assertion,
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  const result = await boundedJson(response);
  if (
    !response.ok
    || typeof result?.access_token !== "string"
    || typeof result.expires_in !== "number"
  ) {
    throw new Error("FCM OAuth failed");
  }
  fcmAccessTokenCache = {
    configurationKey,
    expiresAt: Date.now() + Math.min(result.expires_in, 3600) * 1000,
    token: result.access_token,
  };
  return result.access_token;
}

function pushPayload(message: SafeProviderMessage): NativePushPayload {
  const path = new URL(message.safePlatformHref).pathname;
  const destinationKind = path === "/customer/account"
    ? "CUSTOMER_ACCOUNT"
    : path === "/customer/messages"
      ? "CUSTOMER_MESSAGES"
      : "NOTIFICATIONS";
  return {
    body: message.plainText.slice(0, 500),
    data: { destinationKind, targetId: null },
    title: (message.subject ?? "REZNO").slice(0, 160),
  };
}

function validApnsConfiguration(environment: NodeJS.ProcessEnv) {
  const pushEnvironment = environment.REZNO_PUSH_ENVIRONMENT;
  return /^[A-Z0-9]{10}$/.test(environment.REZNO_APNS_TEAM_ID ?? "")
    && /^[A-Z0-9]{10}$/.test(environment.REZNO_APNS_KEY_ID ?? "")
    && environment.REZNO_APNS_BUNDLE_ID === "com.rezno.mobile"
    && /BEGIN PRIVATE KEY/.test(environment.REZNO_APNS_PRIVATE_KEY ?? "")
    && validPushEnvironment(environment)
    && environment.REZNO_APNS_ENVIRONMENT
      === (pushEnvironment === "production" ? "production" : "sandbox");
}

function validFcmConfiguration(environment: NodeJS.ProcessEnv) {
  return /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(environment.REZNO_FCM_PROJECT_ID ?? "")
    && /^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(
      environment.REZNO_FCM_CLIENT_EMAIL ?? "",
    )
    && /BEGIN PRIVATE KEY/.test(environment.REZNO_FCM_PRIVATE_KEY ?? "")
    && validPushEnvironment(environment)
    && environment.REZNO_FCM_PROJECT_ENVIRONMENT
      === environment.REZNO_PUSH_ENVIRONMENT;
}

function validPushEnvironment(environment: NodeJS.ProcessEnv) {
  const pushEnvironment = environment.REZNO_PUSH_ENVIRONMENT;
  if (pushEnvironment !== "staging" && pushEnvironment !== "production") return false;
  const runtime = (environment.REZNO_ENV ?? "").toLowerCase();
  if (runtime.includes("prod") || runtime.includes("live")) {
    return pushEnvironment === "production";
  }
  if (runtime.includes("stag") || runtime.includes("preview")) {
    return pushEnvironment === "staging";
  }
  return environment.NODE_ENV !== "production" || runtime === "local-test";
}

async function boundedJson(response: Response): Promise<Record<string, unknown> | null> {
  const text = (await response.text()).slice(0, 8192);
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function safeFcmErrorStatus(value: Record<string, unknown> | null) {
  const error = value?.error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  const details = (error as Record<string, unknown>).details;
  if (!Array.isArray(details)) return null;
  for (const detail of details) {
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) continue;
    const code = (detail as Record<string, unknown>).errorCode;
    if (typeof code === "string" && /^[A-Z_]{3,40}$/.test(code)) return code;
  }
  return null;
}

function safeFcmMessageId(value: string) {
  const digest = createHash("sha256").update(value, "utf8").digest("hex");
  return `fcm_${digest.slice(0, 48)}`;
}

function safeApnsReason(body: string) {
  try {
    const value = JSON.parse(body);
    return typeof value?.reason === "string" && /^[A-Za-z]{3,40}$/.test(value.reason)
      ? value.reason
      : "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

function accepted(providerMessageId: string, safeCode: string): NativePushSendResult {
  return {
    invalidToken: false,
    outcome: "ACCEPTED",
    providerMessageId,
    retryable: false,
    safeCode,
  };
}

function transient(safeCode: string): NativePushSendResult {
  return {
    invalidToken: false,
    outcome: "TRANSIENT_FAILURE",
    providerMessageId: null,
    retryable: true,
    safeCode,
  };
}

function ambiguous(safeCode: string): NativePushSendResult {
  return {
    ambiguous: true,
    invalidToken: false,
    outcome: "TRANSIENT_FAILURE",
    providerMessageId: null,
    retryable: false,
    safeCode,
  };
}

function permanentNative(safeCode: string): NativePushSendResult {
  return {
    invalidToken: false,
    outcome: "PERMANENT_FAILURE",
    providerMessageId: null,
    retryable: false,
    safeCode,
  };
}

function providerNotConfigured(provider: PushProvider): NativePushSendResult {
  return permanentNative(`${provider}_NOT_CONFIGURED`);
}

function permanent(safeCode: string): ProviderSendResult {
  return {
    outcome: "PERMANENT_FAILURE",
    providerMessageId: null,
    providerName: "rezno-native-push",
    retryable: false,
    safeCode,
  };
}
