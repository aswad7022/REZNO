import "server-only";

import { Prisma } from "@prisma/client";

import { canAccessOrganizationConversations } from "@/features/identity/policies/authorization";
import type { MessageActor } from "@/features/messages/domain/contracts";
import { messageActorScopeKey } from "@/features/messages/domain/contracts";
import {
  decodeMessageCursor,
  encodeMessageCursor,
  messageFilterFingerprint,
} from "@/features/messages/domain/cursor";
import type {
  ConversationDetailDto,
  ConversationSourceDto,
  ConversationSummaryDto,
  MessagePageDto,
  MessageSummaryDto,
  MessageUnreadCountDto,
} from "@/features/messages/domain/dto";
import { messageError } from "@/features/messages/domain/errors";
import { canAccessConversation } from "@/features/messages/policies/conversation-access";
import { assertMessageActorCurrent } from "@/features/messages/services/actor";
import { messagingSerializable } from "@/features/messages/services/transaction";

export type ConversationListMode = "admin" | "all" | "booking" | "unread";

export interface ConversationListQuery {
  cursor?: string;
  limit: number;
  mode: ConversationListMode;
  search?: string;
}

export interface MessageHistoryQuery {
  cursor?: string;
  limit: number;
}

const accessSelect = {
  adminUserId: true,
  businessId: true,
  customerId: true,
  type: true,
  booking: {
    select: { customerId: true, memberId: true, organizationId: true },
  },
} satisfies Prisma.ConversationSelect;

const presentationSelect = {
  ...accessSelect,
  id: true,
  lastMessageAt: true,
  subject: true,
  business: { select: { name: true } },
  customer: { select: { displayName: true, firstName: true } },
  booking: {
    select: {
      customerId: true,
      id: true,
      memberId: true,
      organizationId: true,
      restaurantReservation: { select: { id: true } },
      serviceNameSnapshot: true,
      startsAt: true,
    },
  },
  messages: {
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    select: { body: true },
    take: 1,
  },
} satisfies Prisma.ConversationSelect;

type PresentationConversation = Prisma.ConversationGetPayload<{
  select: typeof presentationSelect;
}>;

export async function listConversations(
  actor: MessageActor,
  query: ConversationListQuery,
) {
  assertListQuery(query);
  return messagingSerializable(async (transaction) => {
    const currentActor = await assertMessageActorCurrent(transaction, actor);
    const authoritativeNow = await messageTransactionTime(transaction);
    const search = query.search?.trim() || undefined;
    const filter = messageFilterFingerprint({ mode: query.mode, search });
    const cursor = query.cursor
      ? decodeMessageCursor(query.cursor, {
          actor: currentActor,
          filter,
          kind: "conversation",
          pageSize: query.limit,
        }, authoritativeNow)
      : null;
    const snapshot = cursor?.snapshotDate ?? authoritativeNow;
    if (query.mode === "unread") {
      return listUnreadConversations(transaction, {
        actor: currentActor,
        cursor,
        filter,
        limit: query.limit,
        search,
        snapshot,
      });
    }
    const baseWhere = conversationWhereForActor(currentActor);
    const filteredWhere = conversationFilterWhere(query.mode, search);
    let anchor = cursor
      ? { id: cursor.id, lastMessageAt: cursor.sortDate }
      : null;
    const visible: Array<{
      conversation: PresentationConversation;
      unreadCount: number;
    }> = [];
    let exhausted = false;

    while (visible.length <= query.limit && !exhausted) {
      const batchSize = Math.min(Math.max(query.limit * 3, 50), 150);
      const rows = await transaction.conversation.findMany({
        where: {
          AND: [
            baseWhere,
            filteredWhere,
            { lastMessageAt: { lte: snapshot } },
            ...(anchor
              ? [
                  {
                    OR: [
                      { lastMessageAt: { lt: anchor.lastMessageAt } },
                      {
                        id: { lt: anchor.id },
                        lastMessageAt: anchor.lastMessageAt,
                      },
                    ],
                  } satisfies Prisma.ConversationWhereInput,
                ]
              : []),
          ],
        },
        orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
        select: presentationSelect,
        take: batchSize,
      });
      if (rows.length === 0) {
        exhausted = true;
        break;
      }
      const unread = await unreadCountsForConversations(
        transaction,
        currentActor,
        rows.map((row) => row.id),
      );
      for (const conversation of rows) {
        if (!canAccessConversation(conversation, currentActor)) continue;
        const unreadCount = unread.get(conversation.id) ?? 0;
        visible.push({ conversation, unreadCount });
        if (visible.length > query.limit) break;
      }
      const last = rows.at(-1)!;
      anchor = { id: last.id, lastMessageAt: last.lastMessageAt };
      exhausted = rows.length < batchSize;
    }

    const hasNextPage = visible.length > query.limit;
    const page = visible.slice(0, query.limit);
    const lastVisible = page.at(-1)?.conversation;
    return {
      data: page.map(({ conversation, unreadCount }) =>
        toConversationSummary(conversation, currentActor, unreadCount),
      ),
      nextCursor:
        hasNextPage && lastVisible
          ? encodeMessageCursor({
              filter,
              id: lastVisible.id,
              kind: "conversation",
              pageSize: query.limit,
              scope: messageActorScopeKey(currentActor),
              snapshot: snapshot.toISOString(),
              sortValue: lastVisible.lastMessageAt.toISOString(),
            })
          : null,
      snapshot: snapshot.toISOString(),
    };
  });
}

export async function getConversationDetail(
  actor: MessageActor,
  conversationId: string,
): Promise<ConversationDetailDto> {
  return messagingSerializable(async (transaction) => {
    const currentActor = await assertMessageActorCurrent(transaction, actor);
    const conversation = await transaction.conversation.findUnique({
      where: { id: conversationId },
      select: presentationSelect,
    });
    if (!conversation || !canAccessConversation(conversation, currentActor)) {
      messageError("NOT_FOUND", "Conversation was not found in this scope.");
    }
    const labels = conversationLabels(conversation, currentActor);
    return {
      canReply: currentActor.kind !== "admin" || currentActor.canSend,
      id: conversation.id,
      kind: "CONVERSATION_DETAIL",
      participantLabel: labels.participant,
      source: conversationSource(conversation),
      title: labels.title,
      type: conversation.type,
    };
  });
}

export async function listMessages(
  actor: MessageActor,
  conversationId: string,
  query: MessageHistoryQuery,
): Promise<MessagePageDto> {
  assertHistoryQuery(query);
  return messagingSerializable(async (transaction) => {
    const currentActor = await assertMessageActorCurrent(transaction, actor);
    const authoritativeNow = await messageTransactionTime(transaction);
    const conversation = await transaction.conversation.findUnique({
      where: { id: conversationId },
      select: {
        ...accessSelect,
        customer: { select: { authUserId: true } },
      },
    });
    if (!conversation || !canAccessConversation(conversation, currentActor)) {
      messageError("NOT_FOUND", "Conversation was not found in this scope.");
    }
    const filter = messageFilterFingerprint({ conversationId });
    const cursor = query.cursor
      ? decodeMessageCursor(query.cursor, {
          actor: currentActor,
          conversationId,
          filter,
          kind: "message",
          pageSize: query.limit,
        }, authoritativeNow)
      : null;
    const snapshot = cursor?.snapshotDate ?? authoritativeNow;
    const rows = await transaction.message.findMany({
      where: {
        conversationId,
        createdAt: { lte: snapshot },
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.sortDate } },
                { createdAt: cursor.sortDate, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { body: true, createdAt: true, id: true, senderUserId: true },
      take: query.limit + 1,
    });
    const hasNextPage = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      data: page.map((message) =>
        toMessageSummary(message, currentActor, conversation),
      ),
      kind: "MESSAGE_PAGE",
      nextCursor:
        hasNextPage && last
          ? encodeMessageCursor({
              conversationId,
              filter,
              id: last.id,
              kind: "message",
              pageSize: query.limit,
              scope: messageActorScopeKey(currentActor),
              snapshot: snapshot.toISOString(),
              sortValue: last.createdAt.toISOString(),
            })
          : null,
      snapshot: snapshot.toISOString(),
    };
  });
}

export async function getUnreadMessageCount(
  actor: MessageActor,
): Promise<MessageUnreadCountDto> {
  return messagingSerializable(async (transaction) => {
    const currentActor = await assertMessageActorCurrent(transaction, actor);
    const scopeKey = messageActorScopeKey(currentActor);
    const [result] = await transaction.$queryRaw<Array<{ count: number }>>(
      Prisma.sql`
    SELECT COUNT(*)::integer AS "count"
    FROM "Message" AS message
    JOIN "Conversation" AS conversation
      ON conversation."id" = message."conversationId"
    LEFT JOIN "ConversationReadState" AS state
      ON state."conversationId" = conversation."id"
      AND state."scopeKey" = ${scopeKey}
    WHERE ${conversationAccessSql(currentActor)}
      AND message."senderUserId" <> ${currentActor.userId}
      AND ${unreadBoundarySql()}
      `,
    );
    const count = result?.count ?? 0;
    return {
      count,
      display: count > 99 ? "99+" : String(count),
      kind: "MESSAGE_UNREAD_COUNT",
    };
  });
}

async function listUnreadConversations(
  transaction: Prisma.TransactionClient,
  {
    actor,
    cursor,
    filter,
    limit,
    search,
    snapshot,
  }: {
    actor: MessageActor;
    cursor: { id: string; sortDate: Date } | null;
    filter: string;
    limit: number;
    search: string | undefined;
    snapshot: Date;
  },
) {
  const scopeKey = messageActorScopeKey(actor);
  const rows = await transaction.$queryRaw<
    Array<{ id: string; lastMessageAt: Date }>
  >(Prisma.sql`
    SELECT conversation."id", conversation."lastMessageAt"
    FROM "Conversation" AS conversation
    WHERE ${conversationAccessSql(actor)}
      AND conversation."lastMessageAt" <= ${snapshot}
      ${
        cursor
          ? Prisma.sql`AND (
            conversation."lastMessageAt" < ${cursor.sortDate}
            OR (
              conversation."lastMessageAt" = ${cursor.sortDate}
              AND conversation."id" < ${cursor.id}::uuid
            )
          )`
          : Prisma.empty
      }
      ${conversationSearchSql(search)}
      AND EXISTS (
        SELECT 1
        FROM "Message" AS message
        LEFT JOIN "ConversationReadState" AS state
          ON state."conversationId" = message."conversationId"
          AND state."scopeKey" = ${scopeKey}
        WHERE message."conversationId" = conversation."id"
          AND message."senderUserId" <> ${actor.userId}
          AND ${unreadBoundarySql()}
      )
    ORDER BY conversation."lastMessageAt" DESC, conversation."id" DESC
    LIMIT ${limit + 1}
  `);
  const hasNextPage = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const conversations =
    pageRows.length === 0
      ? []
      : await transaction.conversation.findMany({
          where: { id: { in: pageRows.map((row) => row.id) } },
          select: presentationSelect,
        });
  const byId = new Map(
    conversations.map((conversation) => [conversation.id, conversation]),
  );
  const authorized = pageRows.flatMap((row) => {
    const conversation = byId.get(row.id);
    return conversation && canAccessConversation(conversation, actor)
      ? [conversation]
      : [];
  });
  const unread = await unreadCountsForConversations(
    transaction,
    actor,
    authorized.map((conversation) => conversation.id),
  );
  const last = authorized.at(-1);
  return {
    data: authorized.map((conversation) =>
      toConversationSummary(
        conversation,
        actor,
        unread.get(conversation.id) ?? 0,
      ),
    ),
    nextCursor:
      hasNextPage && last
        ? encodeMessageCursor({
            filter,
            id: last.id,
            kind: "conversation",
            pageSize: limit,
            scope: messageActorScopeKey(actor),
            snapshot: snapshot.toISOString(),
            sortValue: last.lastMessageAt.toISOString(),
          })
        : null,
    snapshot: snapshot.toISOString(),
  };
}

function conversationAccessSql(actor: MessageActor) {
  if (actor.kind === "customer") {
    return Prisma.sql`
      conversation."customerId" = ${actor.personId}::uuid
      AND conversation."type" IN ('CUSTOMER_BUSINESS', 'ADMIN_USER')
      AND (
        conversation."bookingId" IS NULL
        OR EXISTS (
          SELECT 1 FROM "Booking" AS booking
          WHERE booking."id" = conversation."bookingId"
            AND booking."customerId" = ${actor.personId}::uuid
        )
      )
    `;
  }
  if (actor.kind === "admin") {
    return Prisma.sql`
      conversation."adminUserId" = ${actor.userId}
      AND conversation."type" IN ('ADMIN_USER', 'ADMIN_BUSINESS')
    `;
  }
  if (canAccessOrganizationConversations(actor.systemRole)) {
    return Prisma.sql`
      conversation."businessId" = ${actor.organizationId}::uuid
      AND conversation."type" IN ('CUSTOMER_BUSINESS', 'ADMIN_BUSINESS')
    `;
  }
  if (actor.systemRole === "RECEPTIONIST") {
    return Prisma.sql`
      conversation."businessId" = ${actor.organizationId}::uuid
      AND conversation."type" = 'CUSTOMER_BUSINESS'
      AND EXISTS (
        SELECT 1 FROM "Booking" AS booking
        WHERE booking."id" = conversation."bookingId"
          AND booking."organizationId" = ${actor.organizationId}::uuid
      )
    `;
  }
  return Prisma.sql`
    conversation."businessId" = ${actor.organizationId}::uuid
    AND conversation."type" = 'CUSTOMER_BUSINESS'
    AND EXISTS (
      SELECT 1 FROM "Booking" AS booking
      WHERE booking."id" = conversation."bookingId"
        AND booking."organizationId" = ${actor.organizationId}::uuid
        AND booking."memberId" = ${actor.membershipId}::uuid
    )
  `;
}

function conversationSearchSql(search: string | undefined) {
  if (!search) return Prisma.empty;
  const pattern = `%${search}%`;
  return Prisma.sql`
    AND (
      conversation."subject" ILIKE ${pattern}
      OR EXISTS (
        SELECT 1 FROM "Organization" AS business
        WHERE business."id" = conversation."businessId"
          AND business."name" ILIKE ${pattern}
      )
      OR EXISTS (
        SELECT 1 FROM "Person" AS customer
        WHERE customer."id" = conversation."customerId"
          AND (
            customer."displayName" ILIKE ${pattern}
            OR customer."firstName" ILIKE ${pattern}
          )
      )
    )
  `;
}

function unreadBoundarySql() {
  return Prisma.sql`
    (
      state."lastReadMessageCreatedAt" IS NULL
      OR message."createdAt" > state."lastReadMessageCreatedAt"
      OR (
        message."createdAt" = state."lastReadMessageCreatedAt"
        AND message."id" > state."lastReadMessageId"
      )
    )
  `;
}

async function messageTransactionTime(transaction: Prisma.TransactionClient) {
  // Keep PostgreSQL authoritative while making its microsecond clock a
  // lossless upper fence in JavaScript's millisecond Date representation.
  const [row] = await transaction.$queryRaw<Array<{ authoritativeNow: Date }>>(Prisma.sql`
    SELECT date_trunc('milliseconds', clock_timestamp()) + interval '1 millisecond'
      AS "authoritativeNow"
  `);
  if (!row?.authoritativeNow) messageError("FORBIDDEN", "Messaging transaction time is unavailable.");
  return row.authoritativeNow;
}

export async function searchMessageTargets(
  actor: MessageActor,
  query: string | undefined,
  limit = 20,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    messageError("VALIDATION_ERROR", "Message target limit is invalid.");
  }
  const search = query?.trim();
  if (search && Array.from(search).length > 80) {
    messageError("VALIDATION_ERROR", "Message target search is invalid.");
  }
  return messagingSerializable(async (transaction) => {
    const currentActor = await assertMessageActorCurrent(
      transaction,
      actor,
      actor.kind === "admin" ? "MESSAGES_SEND" : "MESSAGES_VIEW",
    );
    if (currentActor.kind === "customer") {
      const businesses = await transaction.organization.findMany({
        where: {
          bookings: { some: { customerId: currentActor.personId } },
          deletedAt: null,
          isActive: true,
          status: "ACTIVE",
          ...(search
            ? { name: { contains: search, mode: "insensitive" } }
            : {}),
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: { id: true, name: true },
        take: limit,
      });
      return businesses.map((item) => ({
        id: item.id,
        kind: "BUSINESS" as const,
        label: item.name,
      }));
    }
    if (currentActor.kind !== "admin" || !currentActor.canSend) return [];
    if (!search || search.length < 2) return [];
    const people = await transaction.person.findMany({
      where: {
        deletedAt: null,
        isOnboarded: true,
        status: "ACTIVE",
        OR: [
          { displayName: { contains: search, mode: "insensitive" } },
          { firstName: { contains: search, mode: "insensitive" } },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { displayName: true, firstName: true, id: true },
      take: limit,
    });
    const businesses = await transaction.organization.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        name: { contains: search, mode: "insensitive" },
        status: "ACTIVE",
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
      take: limit,
    });
    return [
      ...people.map((item) => ({
        id: item.id,
        kind: "USER" as const,
        label: item.displayName ?? item.firstName,
      })),
      ...businesses.map((item) => ({
        id: item.id,
        kind: "BUSINESS" as const,
        label: item.name,
      })),
    ].slice(0, limit);
  });
}

export function conversationWhereForActor(
  actor: MessageActor,
): Prisma.ConversationWhereInput {
  if (actor.kind === "customer") {
    return {
      customerId: actor.personId,
      type: { in: ["CUSTOMER_BUSINESS", "ADMIN_USER"] },
      OR: [{ bookingId: null }, { booking: { customerId: actor.personId } }],
    };
  }
  if (actor.kind === "admin") {
    return {
      adminUserId: actor.userId,
      type: { in: ["ADMIN_USER", "ADMIN_BUSINESS"] },
    };
  }
  if (canAccessOrganizationConversations(actor.systemRole)) {
    return {
      businessId: actor.organizationId,
      type: { in: ["CUSTOMER_BUSINESS", "ADMIN_BUSINESS"] },
    };
  }
  if (actor.systemRole === "RECEPTIONIST") {
    return {
      businessId: actor.organizationId,
      booking: { organizationId: actor.organizationId },
      type: "CUSTOMER_BUSINESS",
    };
  }
  return {
    businessId: actor.organizationId,
    booking: {
      memberId: actor.membershipId,
      organizationId: actor.organizationId,
    },
    type: "CUSTOMER_BUSINESS",
  };
}

async function unreadCountsForConversations(
  transaction: Prisma.TransactionClient,
  actor: MessageActor,
  conversationIds: string[],
) {
  if (conversationIds.length === 0) return new Map<string, number>();
  const scopeKey = messageActorScopeKey(actor);
  const rows = await transaction.$queryRaw<
    Array<{ conversationId: string; unreadCount: number }>
  >(Prisma.sql`
    SELECT
      message."conversationId" AS "conversationId",
      COUNT(*)::integer AS "unreadCount"
    FROM "Message" AS message
    LEFT JOIN "ConversationReadState" AS state
      ON state."conversationId" = message."conversationId"
      AND state."scopeKey" = ${scopeKey}
    WHERE message."conversationId" IN (${Prisma.join(
      conversationIds.map((id) => Prisma.sql`${id}::uuid`),
    )})
      AND message."senderUserId" <> ${actor.userId}
      AND (
        state."lastReadMessageCreatedAt" IS NULL
        OR message."createdAt" > state."lastReadMessageCreatedAt"
        OR (
          message."createdAt" = state."lastReadMessageCreatedAt"
          AND message."id" > state."lastReadMessageId"
        )
      )
    GROUP BY message."conversationId"
  `);
  return new Map(rows.map((row) => [row.conversationId, row.unreadCount]));
}

function conversationFilterWhere(
  mode: ConversationListMode,
  search: string | undefined,
): Prisma.ConversationWhereInput {
  return {
    ...(mode === "booking" ? { bookingId: { not: null } } : {}),
    ...(mode === "admin"
      ? { type: { in: ["ADMIN_USER", "ADMIN_BUSINESS"] } }
      : {}),
    ...(search
      ? {
          OR: [
            { subject: { contains: search, mode: "insensitive" } },
            { business: { name: { contains: search, mode: "insensitive" } } },
            {
              customer: {
                OR: [
                  {
                    displayName: {
                      contains: search,
                      mode: "insensitive",
                    },
                  },
                  { firstName: { contains: search, mode: "insensitive" } },
                ],
              },
            },
          ],
        }
      : {}),
  };
}

function toConversationSummary(
  conversation: PresentationConversation,
  actor: MessageActor,
  unreadCount: number,
): ConversationSummaryDto {
  const labels = conversationLabels(conversation, actor);
  const role = actor.kind === "admin" ? "admin" : actor.kind;
  return {
    destination: `/${role}/messages?conversationId=${conversation.id}`,
    id: conversation.id,
    kind: "CONVERSATION_SUMMARY",
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    lastMessagePreview: truncate(conversation.messages[0]?.body ?? "", 160),
    participantLabel: labels.participant,
    source: conversationSource(conversation),
    title: labels.title,
    type: conversation.type,
    unread: unreadCount > 0,
    unreadCount,
  };
}

function conversationLabels(
  conversation: PresentationConversation,
  actor: MessageActor,
) {
  if (conversation.type === "ADMIN_USER") {
    const customer =
      conversation.customer?.displayName ??
      conversation.customer?.firstName ??
      "Customer";
    return actor.kind === "admin"
      ? { participant: customer, title: customer }
      : { participant: "REZNO", title: "REZNO" };
  }
  if (conversation.type === "ADMIN_BUSINESS") {
    return actor.kind === "admin"
      ? {
          participant: conversation.business?.name ?? "Business",
          title: conversation.business?.name ?? "Business",
        }
      : { participant: "REZNO", title: "REZNO" };
  }
  if (actor.kind === "customer") {
    const business = conversation.business?.name ?? "Business";
    return { participant: business, title: business };
  }
  const customer =
    conversation.customer?.displayName ??
    conversation.customer?.firstName ??
    "Customer";
  return { participant: customer, title: customer };
}

function conversationSource(
  conversation: PresentationConversation,
): ConversationSourceDto | null {
  if (!conversation.booking) return null;
  return {
    bookingId: conversation.booking.id,
    kind: conversation.booking.restaurantReservation
      ? "RESTAURANT_RESERVATION"
      : "BOOKING",
    label: truncate(conversation.booking.serviceNameSnapshot, 120),
    startsAt: conversation.booking.startsAt.toISOString(),
  };
}

export function toMessageSummary(
  message: {
    body: string;
    createdAt: Date;
    id: string;
    senderUserId: string;
  },
  actor: MessageActor,
  conversation: {
    adminUserId: string | null;
    customer: { authUserId: string } | null;
    type: "ADMIN_BUSINESS" | "ADMIN_USER" | "CUSTOMER_BUSINESS";
  },
): MessageSummaryDto {
  const own = message.senderUserId === actor.userId;
  return {
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    id: message.id,
    kind: "MESSAGE_SUMMARY",
    own,
    sender: own
      ? "YOU"
      : message.senderUserId === conversation.adminUserId
        ? "ADMIN"
        : message.senderUserId === conversation.customer?.authUserId
          ? "CUSTOMER"
          : "BUSINESS",
  };
}

function assertListQuery(query: ConversationListQuery) {
  if (
    !Number.isInteger(query.limit) ||
    query.limit < 1 ||
    query.limit > 50 ||
    !["admin", "all", "booking", "unread"].includes(query.mode) ||
    (query.search !== undefined &&
      (query.search.trim().length === 0 ||
        Array.from(query.search.trim()).length > 80))
  ) {
    messageError("VALIDATION_ERROR", "Conversation list query is invalid.");
  }
}

function assertHistoryQuery(query: MessageHistoryQuery) {
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 50) {
    messageError("VALIDATION_ERROR", "Message history query is invalid.");
  }
}

function truncate(value: string, length: number) {
  const characters = Array.from(value);
  return characters.length <= length
    ? value
    : `${characters.slice(0, length - 1).join("")}…`;
}
