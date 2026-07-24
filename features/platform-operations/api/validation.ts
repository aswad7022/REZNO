import "server-only";

import {
  PlatformAlertState,
  PlatformIncidentState,
  PlatformOperationDomain,
  PlatformSeverity,
} from "@prisma/client";
import { z } from "zod";

import { readBoundedPlatformJobJson } from "@/features/platform-jobs/api/validation";
import { platformJobError } from "@/features/platform-jobs/domain/errors";

const uuid = z.string().uuid();
const idempotency = z.object({ idempotencyKey: uuid }).strict();
const runtimeState = idempotency.extend({
  enabled: z.boolean(),
  expectedVersion: z.number().int().min(1).max(2_147_483_647),
}).strict();
const versionedTarget = idempotency.extend({
  expectedVersion: z.number().int().min(1).max(2_147_483_647),
}).strict();

export { readBoundedPlatformJobJson };

export function parseIdempotency(raw: unknown) {
  return parse(idempotency, raw);
}

export function parseRuntimeState(raw: unknown) {
  return parse(runtimeState, raw);
}

export function parseVersionedTarget(raw: unknown) {
  return parse(versionedTarget, raw);
}

export function assertNoPlatformOperationsQuery(url: URL) {
  strictQuery(url.searchParams, []);
}

export function parseAlertListQuery(url: URL) {
  strictQuery(url.searchParams, [
    "cursor",
    "domain",
    "limit",
    "severity",
    "state",
  ]);
  return {
    cursor: optionalCursor(url.searchParams.get("cursor")),
    domain: optionalEnum(
      url.searchParams.get("domain"),
      Object.values(PlatformOperationDomain),
    ),
    limit: optionalLimit(url.searchParams.get("limit")),
    severity: optionalEnum(
      url.searchParams.get("severity"),
      Object.values(PlatformSeverity),
    ),
    state: optionalEnum(
      url.searchParams.get("state"),
      Object.values(PlatformAlertState),
    ),
  };
}

export function parseIncidentListQuery(url: URL) {
  strictQuery(url.searchParams, [
    "cursor",
    "domain",
    "limit",
    "severity",
    "state",
  ]);
  return {
    cursor: optionalCursor(url.searchParams.get("cursor")),
    domain: optionalEnum(
      url.searchParams.get("domain"),
      Object.values(PlatformOperationDomain),
    ),
    limit: optionalLimit(url.searchParams.get("limit")),
    severity: optionalEnum(
      url.searchParams.get("severity"),
      Object.values(PlatformSeverity),
    ),
    state: optionalEnum(
      url.searchParams.get("state"),
      Object.values(PlatformIncidentState),
    ),
  };
}

function parse<T>(schema: z.ZodType<T>, raw: unknown) {
  const result = schema.safeParse(raw);
  if (!result.success) {
    platformJobError(
      "VALIDATION_ERROR",
      "The platform-operations request is invalid.",
    );
  }
  return result.data;
}

function strictQuery(params: URLSearchParams, allowed: readonly string[]) {
  const keys = new Set(allowed);
  for (const key of params.keys()) {
    if (!keys.has(key) || params.getAll(key).length !== 1) {
      platformJobError(
        "VALIDATION_ERROR",
        "The platform-operations query is invalid.",
      );
    }
  }
}

function optionalLimit(value: string | null) {
  if (value === null) return undefined;
  if (!/^[1-9][0-9]?$/.test(value) || Number(value) > 50) {
    platformJobError("VALIDATION_ERROR", "The operations page size is invalid.");
  }
  return Number(value);
}

function optionalCursor(value: string | null) {
  if (value === null) return undefined;
  if (!value || value.length > 3_000 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    platformJobError("INVALID_CURSOR", "The operations cursor is invalid.");
  }
  return value;
}

function optionalEnum<T extends string>(
  value: string | null,
  values: readonly T[],
): T | undefined {
  if (value === null) return undefined;
  if (!values.includes(value as T)) {
    platformJobError(
      "VALIDATION_ERROR",
      "The platform-operations filter is invalid.",
    );
  }
  return value as T;
}
