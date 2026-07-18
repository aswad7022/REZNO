import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import type {
  EndpointEligibility,
  OutboundChannel,
} from "@/features/communications/domain/contracts";

export type ResolvedEndpoint = EndpointEligibility & {
  endpoint: string | null;
  endpointType: "EMAIL" | "PHONE" | "PUSH_TOKEN";
  fingerprint: string | null;
};

export const ENDPOINT_RESOLUTION_CHUNK_SIZE = 1_000;

type PushEndpointResolver = (
  personIds: readonly string[],
) => Promise<ReadonlyMap<string, string | null> | Readonly<Record<string, string | null>>>
  | ReadonlyMap<string, string | null>
  | Readonly<Record<string, string | null>>;

export type BulkEndpointResolution = {
  byPerson: Map<string, Partial<Record<OutboundChannel, ResolvedEndpoint>>>;
  diagnostics: {
    endpointQueryCount: number;
    personCount: number;
    pushResolverCallCount: number;
    queryChunkCount: number;
    selectedChannels: OutboundChannel[];
  };
};

type EndpointRow = {
  personId: string;
  email: string | null;
  emailVerified: boolean | null;
  phone: string | null;
  phoneVerifiedAt: Date | null;
};

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
  const resolved = await resolvePersonEndpointsBulk(transaction, [personId], [channel]);
  return resolved.byPerson.get(personId)?.[channel]
    ?? ineligible("MISSING_ENDPOINT", endpointType(channel));
}

export async function resolvePersonEndpointsBulk(
  transaction: Prisma.TransactionClient,
  personIds: readonly string[],
  channels: readonly OutboundChannel[],
): Promise<BulkEndpointResolution> {
  const uniquePersonIds = Array.from(new Set(personIds)).sort();
  const selectedChannels = Array.from(new Set(channels)).sort() as OutboundChannel[];
  const byPerson = new Map<string, Partial<Record<OutboundChannel, ResolvedEndpoint>>>(
    uniquePersonIds.map((personId) => [personId, {}]),
  );
  const contactChannels = selectedChannels.filter(
    (channel): channel is "EMAIL" | "SMS" => channel === "EMAIL" || channel === "SMS",
  );
  let endpointQueryCount = 0;
  let queryChunkCount = 0;

  if (contactChannels.length > 0) {
    for (const personIdChunk of chunks(uniquePersonIds, ENDPOINT_RESOLUTION_CHUNK_SIZE)) {
      queryChunkCount += 1;
      endpointQueryCount += 1;
      const rows = await transaction.$queryRaw<EndpointRow[]>(Prisma.sql`
        SELECT person."id" AS "personId",
               auth_user."email", auth_user."emailVerified",
               person."phone", person."phoneVerifiedAt"
        FROM "Person" AS person
        LEFT JOIN "user" AS auth_user ON auth_user."id" = person."authUserId"
        WHERE person."id" IN (${Prisma.join(
          personIdChunk.map((personId) => Prisma.sql`${personId}::uuid`),
        )})
      `);
      const rowsByPerson = new Map(rows.map((row) => [row.personId, row]));
      for (const personId of personIdChunk) {
        const row = rowsByPerson.get(personId);
        const endpoints = byPerson.get(personId)!;
        for (const channel of contactChannels) {
          endpoints[channel] = resolveContactEndpoint(row, channel);
        }
      }
    }
  }

  let pushResolverCallCount = 0;
  if (selectedChannels.includes("PUSH")) {
    const pushEndpoints = testPushResolver
      ? normalizePushResult(await testPushResolver(uniquePersonIds))
      : new Map<string, string | null>();
    if (testPushResolver && uniquePersonIds.length > 0) pushResolverCallCount = 1;
    for (const personId of uniquePersonIds) {
      const endpoint = pushEndpoints.get(personId) ?? null;
      byPerson.get(personId)!.PUSH = endpoint
        ? eligible(endpoint, "PUSH_TOKEN")
        : ineligible("MISSING_ENDPOINT", "PUSH_TOKEN");
    }
  }

  return {
    byPerson,
    diagnostics: {
      endpointQueryCount,
      personCount: uniquePersonIds.length,
      pushResolverCallCount,
      queryChunkCount,
      selectedChannels,
    },
  };
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

function resolveContactEndpoint(
  row: EndpointRow | undefined,
  channel: "EMAIL" | "SMS",
): ResolvedEndpoint {
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

function endpointType(channel: OutboundChannel): ResolvedEndpoint["endpointType"] {
  if (channel === "EMAIL") return "EMAIL";
  if (channel === "SMS") return "PHONE";
  return "PUSH_TOKEN";
}

function normalizePushResult(
  value: ReadonlyMap<string, string | null> | Readonly<Record<string, string | null>>,
) {
  return value instanceof Map ? new Map(value) : new Map(Object.entries(value));
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size));
  }
  return result;
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
