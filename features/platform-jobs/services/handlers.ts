import "server-only";

import type { PlatformJobErrorCode, PlatformJobType } from "@prisma/client";

import {
  platformJobHandlerTimeoutMs,
} from "@/features/platform-jobs/domain/contracts";
import { parsePlatformJobPayload } from "@/features/platform-jobs/domain/registry";
import { runStorageMediaAutomationHandler } from "@/features/storage-automation/services/handlers";
import { runCommunicationsPaymentAutomationHandler } from "@/features/communications-payment-automation/services/handlers";
import type { PlatformJobOperationAuthority } from "@/features/platform-jobs/services/operation-lease";

export type PlatformJobHandlerContext = {
  fencingToken: bigint;
  jobId: string;
  jobType: PlatformJobType;
  leaseToken: string;
  operation?: PlatformJobOperationAuthority;
  signal: AbortSignal;
};

export type PlatformJobHandlerResult =
  | { metadata: unknown; outcome: "SUCCEEDED" }
  | { errorCode: PlatformJobErrorCode; outcome: "FAILED"; retryable: boolean };

export type PlatformJobHandler = (
  payload: unknown,
  context: PlatformJobHandlerContext,
) => Promise<PlatformJobHandlerResult>;

const productionHandlers: Record<PlatformJobType, PlatformJobHandler> = {
  PLATFORM_HEALTH_PROBE: async (payload, context) => {
    parsePlatformJobPayload("PLATFORM_HEALTH_PROBE", 1, payload);
    if (context.signal.aborted) {
      return { errorCode: "HANDLER_ABORTED", outcome: "FAILED", retryable: false };
    }
    return {
      metadata: {
        executionGeneration: context.fencingToken.toString(),
        kind: "PLATFORM_HEALTHY",
        payloadVersion: 1,
      },
      outcome: "SUCCEEDED",
    };
  },
  STORAGE_MAINTENANCE_DISCOVERY: (payload, context) =>
    runStorageMediaAutomationHandler("STORAGE_MAINTENANCE_DISCOVERY", payload, context),
  STORAGE_ORPHAN_CLEANUP: (payload, context) =>
    runStorageMediaAutomationHandler("STORAGE_ORPHAN_CLEANUP", payload, context),
  STORAGE_ASSET_DELETE_RETRY: (payload, context) =>
    runStorageMediaAutomationHandler("STORAGE_ASSET_DELETE_RETRY", payload, context),
  STORAGE_RESCAN_DISCOVERY: (payload, context) =>
    runStorageMediaAutomationHandler("STORAGE_RESCAN_DISCOVERY", payload, context),
  STORAGE_ASSET_RESCAN: (payload, context) =>
    runStorageMediaAutomationHandler("STORAGE_ASSET_RESCAN", payload, context),
  MEDIA_RENDITION_DISCOVERY: (payload, context) =>
    runStorageMediaAutomationHandler("MEDIA_RENDITION_DISCOVERY", payload, context),
  MEDIA_RENDITION_GENERATE: (payload, context) =>
    runStorageMediaAutomationHandler("MEDIA_RENDITION_GENERATE", payload, context),
  MEDIA_RENDITION_CLEANUP_DISCOVERY: (payload, context) =>
    runStorageMediaAutomationHandler("MEDIA_RENDITION_CLEANUP_DISCOVERY", payload, context),
  MEDIA_RENDITION_DELETE: (payload, context) =>
    runStorageMediaAutomationHandler("MEDIA_RENDITION_DELETE", payload, context),
  COMMUNICATION_CAMPAIGN_DISCOVERY: (payload, context) =>
    runCommunicationsPaymentAutomationHandler("COMMUNICATION_CAMPAIGN_DISCOVERY", payload, context),
  COMMUNICATION_DELIVERY_DISCOVERY: (payload, context) =>
    runCommunicationsPaymentAutomationHandler("COMMUNICATION_DELIVERY_DISCOVERY", payload, context),
  COMMUNICATION_CAMPAIGN_DISPATCH: (payload, context) =>
    runCommunicationsPaymentAutomationHandler("COMMUNICATION_CAMPAIGN_DISPATCH", payload, context),
  COMMUNICATION_DELIVERY_DISPATCH: (payload, context) =>
    runCommunicationsPaymentAutomationHandler("COMMUNICATION_DELIVERY_DISPATCH", payload, context),
  PAYMENT_PROVIDER_EVENT_PROCESS: (payload, context) =>
    runCommunicationsPaymentAutomationHandler("PAYMENT_PROVIDER_EVENT_PROCESS", payload, context),
  PAYMENT_RETRY_DISCOVERY: (payload, context) =>
    runCommunicationsPaymentAutomationHandler("PAYMENT_RETRY_DISCOVERY", payload, context),
  PAYMENT_ATTEMPT_RETRY: (payload, context) =>
    runCommunicationsPaymentAutomationHandler("PAYMENT_ATTEMPT_RETRY", payload, context),
  PAYMENT_REFUND_RETRY: (payload, context) =>
    runCommunicationsPaymentAutomationHandler("PAYMENT_REFUND_RETRY", payload, context),
  PAYMENT_RECONCILIATION: (payload, context) =>
    runCommunicationsPaymentAutomationHandler("PAYMENT_RECONCILIATION", payload, context),
  SETTLEMENT_STATEMENT_GENERATE: (payload, context) =>
    runCommunicationsPaymentAutomationHandler("SETTLEMENT_STATEMENT_GENERATE", payload, context),
};

const testHandlers = new Map<PlatformJobType, PlatformJobHandler>();

export function setPlatformJobHandlerForTests(jobType: PlatformJobType, handler?: PlatformJobHandler) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Platform job test handlers are unavailable in production.");
  }
  if (handler) testHandlers.set(jobType, handler);
  else testHandlers.delete(jobType);
}

export async function executePlatformJobHandler(input: {
  fencingToken: bigint;
  jobId: string;
  jobType: PlatformJobType;
  leaseToken: string;
  operation?: PlatformJobOperationAuthority;
  payload: unknown;
  payloadVersion: number;
}) {
  const payload = parsePlatformJobPayload(input.jobType, input.payloadVersion, input.payload);
  const handler = testHandlers.get(input.jobType) ?? productionHandlers[input.jobType];
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<PlatformJobHandlerResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ errorCode: "HANDLER_TIMEOUT", outcome: "FAILED", retryable: true });
    }, platformJobHandlerTimeoutMs(input.jobType));
  });
  try {
    const execution = Promise.resolve(handler(payload, {
      fencingToken: input.fencingToken,
      jobId: input.jobId,
      jobType: input.jobType,
      leaseToken: input.leaseToken,
      operation: input.operation,
      signal: controller.signal,
    })).catch((): PlatformJobHandlerResult => ({
      errorCode: "HANDLER_EXCEPTION",
      outcome: "FAILED",
      retryable: true,
    }));
    return await Promise.race([execution, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}
