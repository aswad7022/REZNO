import "server-only";

import { Prisma, type NotificationCategory, type NotificationDestinationKind } from "@prisma/client";

import {
  type NotificationActorContext,
  notificationScopeKey,
} from "@/features/notifications/domain/contracts";
import {
  decodeNotificationCursor,
  encodeNotificationCursor,
  notificationFilterFingerprint,
} from "@/features/notifications/domain/cursor";
import {
  canAccessBusinessCommerceOrderDestination,
  canAccessBusinessMessagesDestination,
} from "@/features/notifications/domain/destination-policy";
import { notificationError } from "@/features/notifications/domain/errors";
import {
  notificationEffectiveArchived,
  notificationEffectiveRead,
} from "@/features/notifications/domain/state";
import { assertNotificationActorCurrent } from "@/features/notifications/services/actor-current";
import { prisma } from "@/lib/db/prisma";

export type NotificationInboxFilter = "all" | "archived" | "important" | "read" | "unread";

export interface NotificationInboxQuery {
  category?: NotificationCategory;
  cursor?: string;
  filter: NotificationInboxFilter;
  from?: Date;
  limit: number;
  to?: Date;
}

const inboxSelect = {
  body: true,
  bodyKey: true,
  category: true,
  createdAt: true,
  destinationKind: true,
  destinationTargetId: true,
  eventType: true,
  id: true,
  localizationVariables: true,
  localizedContent: true,
  mandatory: true,
  occurredAt: true,
  priority: true,
  sourceId: true,
  sourceType: true,
  title: true,
  titleKey: true,
} satisfies Prisma.NotificationSelect;

type InboxRecord = Prisma.NotificationGetPayload<{ select: typeof inboxSelect }>;

export async function listNotificationInbox(
  context: NotificationActorContext,
  query: NotificationInboxQuery,
) {
  assertQuery(query);
  return prisma.$transaction(async (transaction) => {
    const currentContext = await assertNotificationActorCurrent(transaction, context);
    const currentPerson = await transaction.person.findUnique({
      where: { id: currentContext.personId },
      select: { preferredLanguage: true },
    });
    // PostgreSQL keeps microseconds while JavaScript Date keeps milliseconds.
    // A database-derived millisecond ceiling prevents round-trip truncation
    // from hiding an already-committed row at the first cursor boundary.
    const [{ authoritativeNow }] = await transaction.$queryRaw<Array<{ authoritativeNow: Date }>>(Prisma.sql`
      SELECT date_trunc('milliseconds', clock_timestamp()) + interval '1 millisecond'
        AS "authoritativeNow"
    `);
    const scopeKey = notificationScopeKey(currentContext);
    const fingerprint = notificationFilterFingerprint({
      category: query.category,
      filter: query.filter,
      from: query.from?.toISOString(),
      to: query.to?.toISOString(),
    });
    const cursor = query.cursor
      ? decodeNotificationCursor(
          query.cursor,
          { context: currentContext, filter: fingerprint, pageSize: query.limit },
          authoritativeNow,
        )
      : null;
    const snapshot = cursor?.snapshotDate ?? authoritativeNow;
    const inboxState = await transaction.notificationInboxState.findUnique({
      where: { personId_scopeKey: { personId: currentContext.personId, scopeKey } },
    });
    const conditions = baseConditions(currentContext, query, snapshot, inboxState, cursor);
    const ids = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT n."id"
      FROM "Notification" n
      LEFT JOIN "NotificationRecipientState" s
        ON s."notificationId" = n."id" AND s."personId" = ${currentContext.personId}::uuid
      WHERE ${Prisma.join(conditions, " AND ")}
      ORDER BY n."createdAt" DESC, n."id" DESC
      LIMIT ${query.limit + 1}
    `);
    const pageIds = ids.slice(0, query.limit).map((item) => item.id);
    const [records, states] = await Promise.all([
      pageIds.length
        ? transaction.notification.findMany({ where: { id: { in: pageIds } }, select: inboxSelect })
        : Promise.resolve([]),
      pageIds.length
        ? transaction.notificationRecipientState.findMany({
            where: { notificationId: { in: pageIds }, personId: currentContext.personId },
          })
        : Promise.resolve([]),
    ]);
    const recordById = new Map(records.map((record) => [record.id, record]));
    const stateById = new Map(states.map((state) => [state.notificationId, state]));
    const ordered = pageIds.map((id) => recordById.get(id)).filter((item): item is InboxRecord => Boolean(item));
    const destinationById = await authorizeDestinations(transaction, currentContext, ordered);
    const last = ordered.at(-1);
    return {
      data: ordered.map((record) => {
        const state = stateById.get(record.id);
        const localized = localizedCopy(record.localizedContent, currentPerson?.preferredLanguage);
        return {
          archived: notificationEffectiveArchived(state),
          body: localized?.body ?? record.body,
          bodyKey: record.bodyKey,
          category: record.category,
          createdAt: record.createdAt.toISOString(),
          destination: destinationById.get(record.id) ?? fallbackDestination(currentContext),
          eventType: record.eventType,
          id: record.id,
          localizationVariables: safeVariables(record.localizationVariables),
          mandatory: record.mandatory,
          priority: record.priority,
          read: notificationEffectiveRead(record.createdAt, state, inboxState),
          stateVersion: state?.version ?? 0,
          title: localized?.title ?? record.title,
          titleKey: record.titleKey,
        };
      }),
      inboxVersion: inboxState?.version ?? 0,
      pageInfo: {
        hasNextPage: ids.length > query.limit,
        nextCursor: ids.length > query.limit && last
          ? encodeNotificationCursor({
              filter: fingerprint,
              id: last.id,
              pageSize: query.limit,
              scope: scopeKey,
              snapshot: snapshot.toISOString(),
              sortValue: last.createdAt.toISOString(),
            })
          : null,
      },
      snapshot: snapshot.toISOString(),
      unreadCount: await countUnreadNotificationsInTransaction(transaction, currentContext, snapshot),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

function localizedCopy(
  value: Prisma.JsonValue,
  language: "AR" | "EN" | "TR" | "KU" | undefined,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const locale = language === "AR" ? "AR" : language === "KU" ? "CKB" : "EN";
  const copy = (value as Record<string, Prisma.JsonValue>)[locale];
  if (!copy || typeof copy !== "object" || Array.isArray(copy)) return null;
  const record = copy as Record<string, Prisma.JsonValue>;
  return typeof record.title === "string" && typeof record.body === "string"
    ? { title: record.title, body: record.body }
    : null;
}

export async function countUnreadNotifications(
  context: NotificationActorContext,
  snapshot = new Date(),
) {
  return prisma.$transaction(async (transaction) => {
    const currentContext = await assertNotificationActorCurrent(transaction, context);
    return countUnreadNotificationsInTransaction(transaction, currentContext, snapshot);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

async function countUnreadNotificationsInTransaction(
  transaction: Prisma.TransactionClient,
  context: NotificationActorContext,
  snapshot: Date,
) {
  const scopeKey = notificationScopeKey(context);
  const inboxState = await transaction.notificationInboxState.findUnique({
    where: { personId_scopeKey: { personId: context.personId, scopeKey } },
  });
  const conditions = baseConditions(
    context,
    { filter: "unread" },
    snapshot,
    inboxState,
    null,
  );
  const rows = await transaction.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count FROM (
      SELECT 1
      FROM "Notification" n
      LEFT JOIN "NotificationRecipientState" s
        ON s."notificationId" = n."id" AND s."personId" = ${context.personId}::uuid
      WHERE ${Prisma.join(conditions, " AND ")}
      LIMIT 100000
    ) visible_notifications
  `);
  return Math.min(Number(rows[0]?.count ?? BigInt(0)), 100_000);
}

function baseConditions(
  context: NotificationActorContext,
  query: Pick<NotificationInboxQuery, "category" | "filter" | "from" | "to">,
  snapshot: Date,
  inboxState: { readAt: Date; readThrough: Date } | null,
  cursor: { id: string; sortDate: Date } | null,
) {
  const conditions: Prisma.Sql[] = [
    visibilitySql(context),
    Prisma.sql`n."createdAt" <= ${snapshot}`,
    Prisma.sql`(n."expiresAt" IS NULL OR n."expiresAt" > ${snapshot})`,
    Prisma.sql`(
      n."mandatory" = true OR NOT EXISTS (
        SELECT 1 FROM "NotificationPreferenceSuppression" ps
        WHERE ps."personId" = ${context.personId}::uuid
          AND ps."category" = n."category"
          AND n."occurredAt" >= ps."disabledAt"
          AND (ps."enabledAt" IS NULL OR n."occurredAt" < ps."enabledAt")
      )
    )`,
  ];
  if (query.category) conditions.push(Prisma.sql`n."category" = ${query.category}::"NotificationCategory"`);
  if (query.from) conditions.push(Prisma.sql`n."createdAt" >= ${query.from}`);
  if (query.to) conditions.push(Prisma.sql`n."createdAt" <= ${query.to}`);
  if (query.filter === "archived") conditions.push(Prisma.sql`s."archivedAt" IS NOT NULL`);
  else conditions.push(Prisma.sql`s."archivedAt" IS NULL`);
  if (query.filter === "important") conditions.push(Prisma.sql`n."priority" = 'IMPORTANT'::"NotificationPriority"`);
  if (query.filter === "read") conditions.push(readSql(inboxState));
  if (query.filter === "unread") conditions.push(Prisma.sql`NOT (${readSql(inboxState)})`);
  if (cursor) conditions.push(Prisma.sql`(
    n."createdAt" < ${cursor.sortDate} OR
    (n."createdAt" = ${cursor.sortDate} AND n."id" < ${cursor.id}::uuid)
  )`);
  return conditions;
}

function visibilitySql(context: NotificationActorContext) {
  if (context.mode === "customer") return Prisma.sql`(
    n."audience" = 'ALL'::"NotificationAudience" OR
    n."audience" = 'CUSTOMERS'::"NotificationAudience" OR
    (n."audience" = 'USER'::"NotificationAudience" AND n."recipientPersonId" = ${context.personId}::uuid)
  )`;
  const direct = Prisma.sql`(n."audience" = 'USER'::"NotificationAudience" AND n."recipientPersonId" = ${context.personId}::uuid)`;
  if (context.systemRole === "STAFF") return Prisma.sql`(n."audience" = 'ALL'::"NotificationAudience" OR ${direct})`;
  const organizationId = context.organizationId!;
  return Prisma.sql`(
    n."audience" = 'ALL'::"NotificationAudience" OR
    ${direct} OR
    ${context.systemRole === "OWNER" ? Prisma.sql`n."audience" = 'BUSINESS_OWNERS'::"NotificationAudience" OR` : Prisma.empty}
    (n."audience" = 'BUSINESS'::"NotificationAudience" AND n."businessId" = ${organizationId}::uuid) OR
    ${context.restaurant ? Prisma.sql`n."audience" = 'RESTAURANTS'::"NotificationAudience"` : Prisma.sql`false`}
  )`;
}

function readSql(inboxState: { readAt: Date; readThrough: Date } | null) {
  if (!inboxState) return Prisma.sql`COALESCE(s."readState" = 'READ'::"NotificationReadState", false)`;
  return Prisma.sql`COALESCE((
    (s."readStateChangedAt" > ${inboxState.readAt} AND s."readState" = 'READ'::"NotificationReadState") OR
    ((s."readStateChangedAt" IS NULL OR s."readStateChangedAt" <= ${inboxState.readAt}) AND n."createdAt" <= ${inboxState.readThrough})
  ), false)`;
}

async function authorizeDestinations(transaction: Prisma.TransactionClient, context: NotificationActorContext, records: InboxRecord[]) {
  const bookingIds = uniqueTargets(records, ["CUSTOMER_BOOKING", "CUSTOMER_RESTAURANT", "BUSINESS_BOOKING", "BUSINESS_RESTAURANT"]);
  const orderIds = uniqueTargets(records, ["CUSTOMER_COMMERCE_ORDER", "BUSINESS_COMMERCE_ORDER"]);
  const conversationIds = uniqueTargets(records, ["CUSTOMER_MESSAGES", "BUSINESS_MESSAGES"]);
  const [bookings, orders, conversations] = await Promise.all([
    bookingIds.length ? transaction.booking.findMany({
      where: { id: { in: bookingIds } },
      select: { customerId: true, id: true, memberId: true, organizationId: true, restaurantReservation: { select: { id: true } } },
    }) : [],
    orderIds.length ? transaction.order.findMany({
      where: { id: { in: orderIds } },
      select: { customerId: true, id: true, store: { select: { organizationId: true } } },
    }) : [],
    conversationIds.length ? transaction.conversation.findMany({
      where: { id: { in: conversationIds } },
      select: {
        booking: { select: { memberId: true, organizationId: true } },
        businessId: true,
        customerId: true,
        id: true,
      },
    }) : [],
  ]);
  const result = new Map<string, { href: string; kind: NotificationDestinationKind; targetId: string | null }>();
  for (const record of records) {
    const targetId = record.destinationTargetId;
    const destination = destinationFor(context, record.destinationKind, targetId, { bookings, conversations, orders });
    result.set(record.id, destination ?? fallbackDestination(context));
  }
  return result;
}

function destinationFor(
  context: NotificationActorContext,
  kind: NotificationDestinationKind,
  targetId: string | null,
  data: {
    bookings: Array<{ customerId: string; id: string; memberId: string | null; organizationId: string; restaurantReservation: { id: string } | null }>;
    conversations: Array<{
      booking: { memberId: string | null; organizationId: string } | null;
      businessId: string | null;
      customerId: string | null;
      id: string;
    }>;
    orders: Array<{ customerId: string; id: string; store: { organizationId: string } }>;
  },
) {
  if (kind === "NOTIFICATIONS") return fallbackDestination(context);
  if (kind === "CUSTOMER_ACCOUNT" && context.mode === "customer") return destination(kind, null, "/customer/profile");
  if (kind === "CUSTOMER_MESSAGES" && context.mode === "customer") {
    if (!targetId || data.conversations.some((item) => item.id === targetId && item.customerId === context.personId)) {
      return destination(kind, targetId, "/customer/messages");
    }
  }
  if (kind === "BUSINESS_MESSAGES" && context.mode === "business") {
    const conversation = targetId
      ? data.conversations.find((item) => item.id === targetId)
      : undefined;
    if (canAccessBusinessMessagesDestination(context, conversation) &&
      (!targetId || conversation?.businessId === context.organizationId)) {
      return destination(kind, targetId, "/business/messages");
    }
  }
  if ((kind === "CUSTOMER_BOOKING" || kind === "CUSTOMER_RESTAURANT") && context.mode === "customer" && targetId) {
    const item = data.bookings.find((booking) => booking.id === targetId && booking.customerId === context.personId);
    if (item && (kind !== "CUSTOMER_RESTAURANT" || item.restaurantReservation)) {
      return destination(kind, targetId, `/customer/bookings/${targetId}`);
    }
  }
  if ((kind === "BUSINESS_BOOKING" || kind === "BUSINESS_RESTAURANT") && context.mode === "business" && targetId) {
    const item = data.bookings.find((booking) => booking.id === targetId && booking.organizationId === context.organizationId &&
      (context.systemRole !== "STAFF" || booking.memberId === context.membershipId));
    if (item && (kind !== "BUSINESS_RESTAURANT" || item.restaurantReservation)) {
      return destination(kind, targetId, kind === "BUSINESS_RESTAURANT" ? `/business/reservations/${targetId}` : `/business/bookings/${targetId}`);
    }
  }
  if (kind === "CUSTOMER_COMMERCE_ORDER" && context.mode === "customer" && targetId &&
    data.orders.some((order) => order.id === targetId && order.customerId === context.personId)) {
    return destination(kind, targetId, "/customer/notifications");
  }
  if (kind === "BUSINESS_COMMERCE_ORDER" && context.mode === "business" && targetId &&
    canAccessBusinessCommerceOrderDestination(context) &&
    data.orders.some((order) => order.id === targetId && order.store.organizationId === context.organizationId)) {
    return destination(kind, targetId, `/business/commerce/orders/${targetId}`);
  }
  if (kind === "BUSINESS_CALENDAR" && context.mode === "business") return destination(kind, null, "/business/calendar");
  if (kind === "BUSINESS_NOTIFICATIONS" && context.mode === "business") return destination(kind, null, "/business/notifications");
  return null;
}

function destination(kind: NotificationDestinationKind, targetId: string | null, href: string) {
  return { href, kind, targetId };
}

function fallbackDestination(context: NotificationActorContext) {
  return destination("NOTIFICATIONS", null, context.mode === "customer" ? "/customer/notifications" : "/business/notifications");
}

function uniqueTargets(records: InboxRecord[], kinds: NotificationDestinationKind[]) {
  const allowed = new Set(kinds);
  return Array.from(new Set(records
    .filter((item) => allowed.has(item.destinationKind) && item.destinationTargetId)
    .map((item) => item.destinationTargetId!)
  ));
}

function safeVariables(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value).filter(([, child]) =>
    typeof child === "boolean" || typeof child === "number" || typeof child === "string"
  ));
}

function assertQuery(query: NotificationInboxQuery) {
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 50) {
    notificationError("VALIDATION_ERROR", "Notification page size must be between 1 and 50.");
  }
  if (query.from && query.to && query.from > query.to) notificationError("VALIDATION_ERROR", "Notification date range is reversed.");
  if (query.from && query.to && query.to.getTime() - query.from.getTime() > 366 * 86_400_000) {
    notificationError("VALIDATION_ERROR", "Notification date range exceeds 366 days.");
  }
}
