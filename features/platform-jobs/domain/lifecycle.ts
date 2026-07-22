import type { PlatformJobStatus } from "@prisma/client";

import { platformJobError } from "@/features/platform-jobs/domain/errors";

const transitions: Readonly<Record<PlatformJobStatus, readonly PlatformJobStatus[]>> = {
  SCHEDULED: ["AVAILABLE", "CANCELLED", "CLAIMED"],
  AVAILABLE: ["CLAIMED", "CANCELLED"],
  CLAIMED: ["RUNNING", "RETRY_WAIT", "DEAD_LETTERED"],
  RUNNING: ["SUCCEEDED", "RETRY_WAIT", "FAILED", "DEAD_LETTERED"],
  SUCCEEDED: [],
  RETRY_WAIT: ["CLAIMED", "CANCELLED"],
  FAILED: [],
  DEAD_LETTERED: [],
  CANCELLED: [],
};

export function assertPlatformJobTransition(from: PlatformJobStatus, to: PlatformJobStatus) {
  if (!transitions[from].includes(to)) {
    platformJobError("CONFLICT", `Platform job transition ${from} to ${to} is not allowed.`);
  }
}

export function isPlatformJobTerminal(status: PlatformJobStatus) {
  return status === "SUCCEEDED" || status === "FAILED" || status === "DEAD_LETTERED" || status === "CANCELLED";
}

export function isPlatformJobCancellable(status: PlatformJobStatus) {
  return status === "SCHEDULED" || status === "AVAILABLE" || status === "RETRY_WAIT";
}

export function isPlatformJobRequeueable(status: PlatformJobStatus) {
  return status === "FAILED" || status === "DEAD_LETTERED";
}
