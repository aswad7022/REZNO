import "server-only";

import { Prisma, type NotificationCategory } from "@prisma/client";

import {
  campaignCategories,
  outboundChannels,
  type OutboundPreferencesDto,
} from "@/features/communications/domain/contracts";
import { communicationError } from "@/features/communications/domain/errors";
import {
  communicationRequestHash,
  parseOrValidationError,
  preferenceUpdateSchema,
} from "@/features/communications/domain/validation";
import {
  publicEndpointEligibility,
  resolvePersonEndpoint,
} from "@/features/communications/services/endpoints";
import { communicationSerializable } from "@/features/communications/services/transaction";
import { prisma } from "@/lib/db/prisma";

export type OutboundPreferenceContext = {
  personId: string;
  userId: string;
};

export async function getOutboundPreferences(
  context: OutboundPreferenceContext,
): Promise<OutboundPreferencesDto> {
  return prisma.$transaction(async (transaction) => {
    await assertPreferenceActorCurrent(transaction, context, false);
    return preferenceDto(transaction, context.personId);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function updateOutboundPreferences(
  context: OutboundPreferenceContext,
  rawInput: unknown,
): Promise<OutboundPreferencesDto> {
  const input = parseOrValidationError(preferenceUpdateSchema, rawInput);
  const requestHash = communicationRequestHash({
    action: "UPDATE_OUTBOUND_PREFERENCES",
    actor: context.personId,
    categories: input.categories,
    expectedVersion: input.expectedVersion,
  });

  return communicationSerializable(async (transaction) => {
    await assertPreferenceActorCurrent(transaction, context, true);
    await transaction.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`outbound-preferences:${context.personId}:${input.idempotencyKey}`}, 0)
      ) IS NULL AS "acquired"
    `);
    const replay = await transaction.outboundPreferenceMutation.findUnique({
      where: {
        personId_idempotencyKey: {
          personId: context.personId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (replay) {
      if (replay.requestHash !== requestHash) {
        communicationError("IDEMPOTENCY_CONFLICT", "The preference idempotency key was reused.");
      }
      return parsePreferenceResult(replay.result);
    }

    await transaction.$queryRaw(Prisma.sql`
      SELECT preference."id"
      FROM "OutboundPreference" AS preference
      WHERE preference."personId" = ${context.personId}::uuid
      FOR UPDATE OF preference
    `);
    const current = await transaction.outboundPreference.findUnique({
      where: { personId: context.personId },
    });
    const currentVersion = current?.version ?? 1;
    if (currentVersion !== input.expectedVersion) {
      communicationError("STALE_VERSION", "Outbound preferences changed. Refresh and retry.");
    }
    const nextVersion = currentVersion + 1;
    await transaction.outboundPreference.upsert({
      where: { personId: context.personId },
      create: {
        personId: context.personId,
        version: nextVersion,
        emailCategories: input.categories.EMAIL,
        smsCategories: input.categories.SMS,
        pushCategories: input.categories.PUSH,
      },
      update: {
        version: nextVersion,
        emailCategories: input.categories.EMAIL,
        smsCategories: input.categories.SMS,
        pushCategories: input.categories.PUSH,
      },
    });
    const result = await preferenceDto(transaction, context.personId);
    await transaction.outboundPreferenceMutation.create({
      data: {
        personId: context.personId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        expectedVersion: input.expectedVersion,
        resultVersion: nextVersion,
        result: result as unknown as Prisma.InputJsonValue,
      },
    });
    return result;
  });
}

async function preferenceDto(
  transaction: Prisma.TransactionClient,
  personId: string,
): Promise<OutboundPreferencesDto> {
  const preference = await transaction.outboundPreference.findUnique({ where: { personId } });
  const endpoints = await Promise.all(outboundChannels.map(async (channel) => [
    channel,
    publicEndpointEligibility(await resolvePersonEndpoint(transaction, personId, channel)),
  ] as const));
  return {
    kind: "OUTBOUND_PREFERENCES",
    version: preference?.version ?? 1,
    categories: {
      EMAIL: normalizeCategories(preference?.emailCategories ?? []),
      SMS: normalizeCategories(preference?.smsCategories ?? []),
      PUSH: normalizeCategories(preference?.pushCategories ?? []),
    },
    endpoints: Object.fromEntries(endpoints) as OutboundPreferencesDto["endpoints"],
    mandatoryAccountEnabled: true,
  };
}

async function assertPreferenceActorCurrent(
  transaction: Prisma.TransactionClient,
  context: OutboundPreferenceContext,
  write: boolean,
) {
  const lock = write ? Prisma.sql`FOR UPDATE OF person, auth_user` : Prisma.sql`FOR SHARE OF person, auth_user`;
  const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT person."id"
    FROM "Person" AS person
    JOIN "user" AS auth_user ON auth_user."id" = person."authUserId"
    WHERE person."id" = ${context.personId}::uuid
      AND person."authUserId" = ${context.userId}
      AND person."deletedAt" IS NULL
      AND person."isOnboarded" = TRUE
      AND person."status" = 'ACTIVE'
    ${lock}
  `);
  if (!rows[0]) communicationError("FORBIDDEN", "The current Person identity changed.");
}

function normalizeCategories(categories: NotificationCategory[]): NotificationCategory[] {
  const selected = new Set(categories);
  return campaignCategories.filter((category) => selected.has(category));
}

function parsePreferenceResult(value: Prisma.JsonValue): OutboundPreferencesDto {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    communicationError("IDEMPOTENCY_CONFLICT", "The original preference result is unavailable.");
  }
  const record = value as Record<string, Prisma.JsonValue>;
  if (record.kind !== "OUTBOUND_PREFERENCES" || typeof record.version !== "number") {
    communicationError("IDEMPOTENCY_CONFLICT", "The original preference result is invalid.");
  }
  return value as unknown as OutboundPreferencesDto;
}
