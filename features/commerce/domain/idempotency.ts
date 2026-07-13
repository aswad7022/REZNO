import { createHash } from "node:crypto";

import { commerceError } from "./errors";

export type CanonicalValue =
  | boolean
  | null
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue | undefined };

function canonicalize(value: CanonicalValue): CanonicalValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter((entry) => entry[1] !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child as CanonicalValue)]),
    );
  }
  return value;
}

export function canonicalRequestJson(value: CanonicalValue): string {
  return JSON.stringify(canonicalize(value));
}

export function hashCheckoutRequest(value: CanonicalValue): string {
  return createHash("sha256").update(canonicalRequestJson(value)).digest("hex");
}

export function resolveIdempotency(
  existing: { requestHash: string; status: "PROCESSING" | "COMPLETED" | "FAILED" } | null,
  requestHash: string,
): "CREATE" | "REPLAY" | "IN_PROGRESS" | "RETRY" {
  if (!existing) return "CREATE";
  if (existing.requestHash !== requestHash) {
    return commerceError(
      "IDEMPOTENCY_CONFLICT",
      "The idempotency key was already used for different checkout input.",
    );
  }
  if (existing.status === "COMPLETED") return "REPLAY";
  if (existing.status === "PROCESSING") return "IN_PROGRESS";
  return "RETRY";
}
