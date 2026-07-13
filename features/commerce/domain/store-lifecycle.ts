import { commerceError } from "./errors";

export type StoreLifecycleStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "ACTIVE"
  | "REJECTED"
  | "SUSPENDED"
  | "ARCHIVED";

const STORE_TRANSITIONS: Readonly<Record<StoreLifecycleStatus, readonly StoreLifecycleStatus[]>> = {
  ACTIVE: ["SUSPENDED"],
  ARCHIVED: [],
  DRAFT: ["PENDING_REVIEW", "ARCHIVED"],
  PENDING_REVIEW: ["ACTIVE", "REJECTED", "ARCHIVED"],
  REJECTED: ["DRAFT", "ARCHIVED"],
  SUSPENDED: ["ACTIVE", "ARCHIVED"],
};

export function assertStoreTransition(from: StoreLifecycleStatus, to: StoreLifecycleStatus) {
  if (!STORE_TRANSITIONS[from].includes(to)) {
    commerceError("INVALID_TRANSITION", `Store cannot transition from ${from} to ${to}.`);
  }
}

export function isStorePublic(status: StoreLifecycleStatus): boolean {
  return status === "ACTIVE";
}
