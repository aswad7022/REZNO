import "server-only";

import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";

import type {
  EndpointEligibility,
  OutboundChannel,
} from "@/features/communications/domain/contracts";

export type ResolvedEndpoint = EndpointEligibility & {
  endpoint: string | null;
  endpointType: "EMAIL" | "PHONE" | "PUSH_TOKEN";
  fingerprint: string | null;
};

type PushEndpointResolver = (personId: string) => Promise<string | null> | string | null;
let testPushResolver: PushEndpointResolver | undefined;

export function setCommunicationTestPushEndpointResolver(
  resolver: PushEndpointResolver | undefined,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Push endpoint test injection is unavailable in production.");
  }
  testPushResolver = resolver;
}

export async function resolvePersonEndpoint(
  transaction: Prisma.TransactionClient,
  personId: string,
  channel: OutboundChannel,
): Promise<ResolvedEndpoint> {
  if (channel === "PUSH") {
    const endpoint = testPushResolver ? await testPushResolver(personId) : null;
    return endpoint
      ? eligible(endpoint, "PUSH_TOKEN")
      : ineligible("MISSING_ENDPOINT", "PUSH_TOKEN");
  }

  const rows = await transaction.$queryRaw<Array<{
    email: string | null;
    emailVerified: boolean | null;
    phone: string | null;
    phoneVerifiedAt: Date | null;
  }>>`
    SELECT auth_user."email", auth_user."emailVerified",
           person."phone", person."phoneVerifiedAt"
    FROM "Person" AS person
    LEFT JOIN "user" AS auth_user ON auth_user."id" = person."authUserId"
    WHERE person."id" = ${personId}::uuid
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return ineligible("MISSING_ENDPOINT", channel === "EMAIL" ? "EMAIL" : "PHONE");

  if (channel === "EMAIL") {
    if (!row.email) return ineligible("MISSING_ENDPOINT", "EMAIL");
    if (!row.emailVerified) return ineligible("UNVERIFIED_ENDPOINT", "EMAIL");
    const normalized = normalizeEmail(row.email);
    return normalized ? eligible(normalized, "EMAIL") : ineligible("INVALID_ENDPOINT", "EMAIL");
  }

  if (!row.phone) return ineligible("MISSING_ENDPOINT", "PHONE");
  if (!row.phoneVerifiedAt) return ineligible("UNVERIFIED_ENDPOINT", "PHONE");
  const normalized = normalizePhone(row.phone);
  return normalized ? eligible(normalized, "PHONE") : ineligible("INVALID_ENDPOINT", "PHONE");
}

export function publicEndpointEligibility(endpoint: ResolvedEndpoint): EndpointEligibility {
  return {
    eligible: endpoint.eligible,
    reason: endpoint.reason,
  };
}

function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (/\r|\n/.test(normalized) || normalized.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized;
}

function normalizePhone(value: string): string | null {
  const normalized = value.replace(/[\s()-]/g, "");
  return /^\+[1-9][0-9]{7,14}$/.test(normalized) ? normalized : null;
}

function eligible(
  endpoint: string,
  endpointType: ResolvedEndpoint["endpointType"],
): ResolvedEndpoint {
  return {
    eligible: true,
    endpoint,
    endpointType,
    fingerprint: createHash("sha256").update(`${endpointType}:${endpoint}`).digest("hex"),
    reason: "ELIGIBLE",
  };
}

function ineligible(
  reason: Exclude<EndpointEligibility["reason"], "ELIGIBLE">,
  endpointType: ResolvedEndpoint["endpointType"],
): ResolvedEndpoint {
  return { eligible: false, endpoint: null, endpointType, fingerprint: null, reason };
}
