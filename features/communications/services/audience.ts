import "server-only";

import { Prisma, type NotificationAudience, type NotificationCategory } from "@prisma/client";

import type {
  AudiencePreviewDto,
  CommunicationLocale,
  OutboundChannel,
} from "@/features/communications/domain/contracts";
import { outboundChannels } from "@/features/communications/domain/contracts";
import { communicationError } from "@/features/communications/domain/errors";
import { localeFromPersonLanguage } from "@/features/communications/domain/validation";
import { resolvePersonEndpointsBulk } from "@/features/communications/services/endpoints";

export const MAX_CAMPAIGN_RECIPIENTS = 5_000;

export type EvaluatedRecipient = {
  personId: string;
  locale: CommunicationLocale;
  active: boolean;
  inAppEnabled: boolean;
  outboundEnabled: Record<OutboundChannel, boolean>;
};

type AudienceInput = {
  audience: NotificationAudience;
  targetPersonId: string | null;
  targetOrganizationId: string | null;
  category: NotificationCategory;
  mandatory: boolean;
};

type AudienceRow = {
  personId: string;
  preferredLanguage: "AR" | "EN" | "TR" | "KU";
  active: boolean;
  bookingsEnabled: boolean | null;
  restaurantEnabled: boolean | null;
  commerceEnabled: boolean | null;
  messagesEnabled: boolean | null;
  adminAnnouncementsEnabled: boolean | null;
  emailCategories: NotificationCategory[] | null;
  smsCategories: NotificationCategory[] | null;
  pushCategories: NotificationCategory[] | null;
};

export async function evaluateAudience(
  transaction: Prisma.TransactionClient,
  input: AudienceInput,
): Promise<{ recipients: EvaluatedRecipient[]; tooLarge: boolean }> {
  const rows = await queryAudienceRows(transaction, input);
  const tooLarge = rows.length > MAX_CAMPAIGN_RECIPIENTS;
  return {
    tooLarge,
    recipients: rows.slice(0, MAX_CAMPAIGN_RECIPIENTS).map((row) => ({
      personId: row.personId,
      locale: localeFromPersonLanguage(row.preferredLanguage),
      active: row.active,
      inAppEnabled: input.mandatory || inAppCategoryEnabled(row, input.category),
      outboundEnabled: {
        EMAIL: input.mandatory || Boolean(row.emailCategories?.includes(input.category)),
        SMS: input.mandatory || Boolean(row.smsCategories?.includes(input.category)),
        PUSH: input.mandatory || Boolean(row.pushCategories?.includes(input.category)),
      },
    })),
  };
}

export async function previewAudience(
  transaction: Prisma.TransactionClient,
  input: AudienceInput & { channels: Array<"IN_APP" | OutboundChannel> },
): Promise<AudiencePreviewDto> {
  const evaluation = await evaluateAudience(transaction, input);
  const active = evaluation.recipients.filter((recipient) => recipient.active);
  const result: AudiencePreviewDto = {
    kind: "AUDIENCE_PREVIEW",
    evaluated: evaluation.recipients.length,
    inactiveOrRevoked: evaluation.recipients.length - active.length,
    tooLarge: evaluation.tooLarge,
    samplePersonIds: active.slice(0, 5).map((recipient) => recipient.personId),
    channels: {},
  };

  if (input.channels.includes("IN_APP")) {
    result.channels.IN_APP = {
      eligible: active.filter((recipient) => recipient.inAppEnabled).length,
      missingEndpoint: 0,
      suppressed: active.filter((recipient) => !recipient.inAppEnabled).length,
    };
  }
  const selectedOutbound = outboundChannels.filter((channel) => input.channels.includes(channel));
  const endpointCandidates = active.filter((recipient) =>
    selectedOutbound.some((channel) => recipient.outboundEnabled[channel]));
  const endpoints = await resolvePersonEndpointsBulk(
    transaction,
    endpointCandidates.map((recipient) => recipient.personId),
    selectedOutbound,
  );
  for (const channel of outboundChannels) {
    if (!input.channels.includes(channel)) continue;
    let eligible = 0;
    let missingEndpoint = 0;
    let suppressed = 0;
    for (const recipient of active) {
      if (!recipient.outboundEnabled[channel]) {
        suppressed += 1;
        continue;
      }
      const endpoint = endpoints.byPerson.get(recipient.personId)?.[channel];
      if (endpoint?.eligible) eligible += 1;
      else missingEndpoint += 1;
    }
    result.channels[channel] = { eligible, missingEndpoint, suppressed };
  }
  return result;
}

export async function assertAudienceWithinLimit(
  transaction: Prisma.TransactionClient,
  input: AudienceInput,
) {
  const evaluation = await evaluateAudience(transaction, input);
  if (evaluation.tooLarge) {
    communicationError("VALIDATION_ERROR", `Campaign audience exceeds ${MAX_CAMPAIGN_RECIPIENTS} People.`);
  }
  return evaluation.recipients;
}

async function queryAudienceRows(
  transaction: Prisma.TransactionClient,
  input: AudienceInput,
): Promise<AudienceRow[]> {
  const limit = MAX_CAMPAIGN_RECIPIENTS + 1;
  const projection = Prisma.sql`
    person."id" AS "personId",
    person."preferredLanguage",
    notification_preference."bookingsEnabled",
    notification_preference."restaurantEnabled",
    notification_preference."commerceEnabled",
    notification_preference."messagesEnabled",
    notification_preference."adminAnnouncementsEnabled",
    outbound_preference."emailCategories",
    outbound_preference."smsCategories",
    outbound_preference."pushCategories"
  `;
  const preferenceJoins = Prisma.sql`
    LEFT JOIN "NotificationPreference" AS notification_preference
      ON notification_preference."personId" = person."id"
    LEFT JOIN "OutboundPreference" AS outbound_preference
      ON outbound_preference."personId" = person."id"
  `;

  if (input.audience === "USER") {
    return transaction.$queryRaw<AudienceRow[]>(Prisma.sql`
      SELECT ${projection},
        (person."deletedAt" IS NULL AND person."status" = 'ACTIVE' AND person."isOnboarded" = TRUE) AS active
      FROM "Person" AS person
      ${preferenceJoins}
      WHERE person."id" = ${input.targetPersonId}::uuid
      LIMIT 1
    `);
  }
  if (input.audience === "ALL" || input.audience === "CUSTOMERS") {
    return transaction.$queryRaw<AudienceRow[]>(Prisma.sql`
      SELECT ${projection},
        (person."deletedAt" IS NULL AND person."status" = 'ACTIVE' AND person."isOnboarded" = TRUE) AS active
      FROM "Person" AS person
      ${preferenceJoins}
      ORDER BY person."id"
      LIMIT ${limit}
    `);
  }

  const organizationFilter = input.audience === "BUSINESS"
    ? Prisma.sql`AND organization."id" = ${input.targetOrganizationId}::uuid`
    : Prisma.empty;
  const roleFilter = input.audience === "BUSINESS_OWNERS"
    ? Prisma.sql`AND role."systemRole" = 'OWNER'`
    : Prisma.sql`AND role."systemRole" IN ('OWNER', 'MANAGER', 'RECEPTIONIST')`;
  const verticalFilter = input.audience === "RESTAURANTS"
    ? Prisma.sql`AND organization."vertical" IN ('RESTAURANT', 'CAFE')`
    : Prisma.empty;

  return transaction.$queryRaw<AudienceRow[]>(Prisma.sql`
    SELECT DISTINCT ON (person."id") ${projection},
      (
        person."deletedAt" IS NULL
        AND person."status" = 'ACTIVE'
        AND person."isOnboarded" = TRUE
        AND membership."deletedAt" IS NULL
        AND membership."status" = 'ACTIVE'
        AND organization."deletedAt" IS NULL
        AND organization."status" = 'ACTIVE'
        AND organization."isActive" = TRUE
      ) AS active
    FROM "OrganizationMember" AS membership
    JOIN "Person" AS person ON person."id" = membership."personId"
    JOIN "Organization" AS organization ON organization."id" = membership."organizationId"
    JOIN "Role" AS role ON role."id" = membership."roleId"
    ${preferenceJoins}
    WHERE TRUE ${organizationFilter} ${roleFilter} ${verticalFilter}
    ORDER BY person."id", membership."id"
    LIMIT ${limit}
  `);
}

function inAppCategoryEnabled(row: AudienceRow, category: NotificationCategory): boolean {
  if (category === "ACCOUNT") return true;
  if (category === "BOOKINGS") return row.bookingsEnabled ?? true;
  if (category === "RESTAURANT") return row.restaurantEnabled ?? true;
  if (category === "COMMERCE") return row.commerceEnabled ?? true;
  if (category === "MESSAGES") return row.messagesEnabled ?? true;
  return row.adminAnnouncementsEnabled ?? true;
}
