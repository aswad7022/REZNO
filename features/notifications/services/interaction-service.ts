import "server-only";

import { Prisma, type NotificationCategory } from "@prisma/client";

import {
  notificationRequestHash,
  notificationScopeKey,
  type NotificationActorContext,
} from "@/features/notifications/domain/contracts";
import { NotificationDomainError, notificationError } from "@/features/notifications/domain/errors";
import { assertMarkAllSnapshotCurrent } from "@/features/notifications/domain/mark-all";
import { notificationVisibilityWhere } from "@/features/notifications/domain/visibility";
import { assertNotificationActorCurrent } from "@/features/notifications/services/actor-current";
import { prisma } from "@/lib/db/prisma";

export interface NotificationStateMutationInput {
  action: "ARCHIVE" | "MARK_READ" | "MARK_UNREAD" | "RESTORE";
  expectedVersion: number;
  idempotencyKey: string;
  notificationId: string;
}

export interface NotificationPreferenceInput {
  adminAnnouncementsEnabled: boolean;
  bookingsEnabled: boolean;
  commerceEnabled: boolean;
  expectedVersion: number;
  idempotencyKey: string;
  messagesEnabled: boolean;
  restaurantEnabled: boolean;
}

export interface NotificationStateMutationResult {
  action: NotificationStateMutationInput["action"];
  archived: boolean;
  notificationId: string;
  readState: "READ" | "UNREAD" | null;
  replayed: boolean;
  version: number;
}

export interface NotificationMarkAllResult {
  action: "MARK_ALL_READ";
  readThrough: string;
  replayed: boolean;
  version: number;
}

export interface NotificationPreferenceResult {
  adminAnnouncementsEnabled: boolean;
  bookingsEnabled: boolean;
  commerceEnabled: boolean;
  messagesEnabled: boolean;
  replayed?: boolean;
  restaurantEnabled: boolean;
  version: number;
}

export async function mutateNotificationState(
  context: NotificationActorContext,
  input: NotificationStateMutationInput,
): Promise<NotificationStateMutationResult> {
  assertMutationInput(input);
  const scopeKey = notificationScopeKey(context);
  const requestHash = notificationRequestHash({
    action: input.action,
    expectedVersion: input.expectedVersion,
    notificationId: input.notificationId,
    personId: context.personId,
    scopeKey,
  });
  return serializable(async (transaction) => {
    const replay = await interactionReplay<NotificationStateMutationResult>(transaction, context.personId, input.idempotencyKey, requestHash);
    if (replay) return replay;
    const currentContext = await assertNotificationActorCurrent(transaction, context);
    const notification = await transaction.notification.findFirst({
      where: {
        id: input.notificationId,
        AND: [
          notificationVisibilityWhere(currentContext),
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } },
            ],
          },
        ],
      },
      select: { id: true },
    });
    if (!notification) notificationError("NOT_FOUND", "Notification was not found in this inbox.");
    const current = await transaction.notificationRecipientState.findUnique({
      where: { notificationId_personId: { notificationId: input.notificationId, personId: context.personId } },
    });
    const currentVersion = current?.version ?? 0;
    if (currentVersion !== input.expectedVersion) stale(currentVersion);
    const changedAt = new Date();
    const data = mutationData(input.action, changedAt);
    const state = current
      ? await transaction.notificationRecipientState.update({
          where: { id: current.id, version: currentVersion },
          data: { ...data, version: { increment: 1 } },
        })
      : await transaction.notificationRecipientState.create({
          data: {
            ...data,
            notificationId: input.notificationId,
            personId: context.personId,
          },
        });
    const result = {
      action: input.action,
      archived: Boolean(state.archivedAt),
      notificationId: input.notificationId,
      readState: state.readState,
      replayed: false,
      version: state.version,
    };
    await transaction.notificationInteraction.create({
      data: {
        action: input.action,
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
        notificationId: input.notificationId,
        personId: context.personId,
        requestHash,
        result,
        resultVersion: state.version,
        scopeKey,
      },
    });
    return result;
  });
}

export async function markAllNotificationsRead(
  context: NotificationActorContext,
  input: { expectedVersion: number; idempotencyKey: string; snapshot: Date },
  options: { now?: () => Date } = {},
): Promise<NotificationMarkAllResult> {
  if (!isUuid(input.idempotencyKey) || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0 ||
    Number.isNaN(input.snapshot.getTime())) {
    notificationError("VALIDATION_ERROR", "Mark-all input is invalid.");
  }
  const scopeKey = notificationScopeKey(context);
  const requestHash = notificationRequestHash({
    action: "MARK_ALL_READ",
    expectedVersion: input.expectedVersion,
    personId: context.personId,
    scopeKey,
    snapshot: input.snapshot.toISOString(),
  });
  return serializable(async (transaction) => {
    const replay = await interactionReplay<NotificationMarkAllResult>(transaction, context.personId, input.idempotencyKey, requestHash);
    if (replay) return replay;
    await assertNotificationActorCurrent(transaction, context);
    const authoritativeNow = options.now ? options.now() : await notificationTransactionTime(transaction);
    assertMarkAllSnapshotCurrent(input.snapshot, authoritativeNow);
    const current = await transaction.notificationInboxState.findUnique({
      where: { personId_scopeKey: { personId: context.personId, scopeKey } },
    });
    const currentVersion = current?.version ?? 0;
    if (currentVersion !== input.expectedVersion) stale(currentVersion);
    const readAt = authoritativeNow;
    const readThrough = current && current.readThrough > input.snapshot ? current.readThrough : input.snapshot;
    const state = current
      ? await transaction.notificationInboxState.update({
          where: { id: current.id, version: currentVersion },
          data: { readAt, readThrough, version: { increment: 1 } },
        })
      : await transaction.notificationInboxState.create({
          data: { personId: context.personId, readAt, readThrough, scopeKey },
        });
    const result = {
      action: "MARK_ALL_READ" as const,
      readThrough: state.readThrough.toISOString(),
      replayed: false,
      version: state.version,
    };
    await transaction.notificationInteraction.create({
      data: {
        action: "MARK_ALL_READ",
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
        personId: context.personId,
        requestHash,
        result,
        resultVersion: state.version,
        scopeKey,
      },
    });
    return result;
  });
}

async function notificationTransactionTime(transaction: Prisma.TransactionClient) {
  const rows = await transaction.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
  const now = rows[0]?.now;
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error("Notification transaction time is unavailable.");
  return now;
}

export async function getNotificationPreferences(personId: string): Promise<NotificationPreferenceResult> {
  const row = await prisma.notificationPreference.findUnique({ where: { personId } });
  return preferenceResult(row);
}

export async function updateNotificationPreferences(
  context: NotificationActorContext,
  input: NotificationPreferenceInput,
): Promise<NotificationPreferenceResult & { replayed: boolean }> {
  assertPreferenceInput(input);
  const scopeKey = notificationScopeKey(context);
  const next = preferenceValues(input);
  const requestHash = notificationRequestHash({
    action: "UPDATE_PREFERENCES",
    expectedVersion: input.expectedVersion,
    next,
    personId: context.personId,
  });
  return serializable(async (transaction) => {
    const replay = await interactionReplay<NotificationPreferenceResult & { replayed: boolean }>(transaction, context.personId, input.idempotencyKey, requestHash);
    if (replay) return replay;
    await assertNotificationActorCurrent(transaction, context);
    const current = await transaction.notificationPreference.findUnique({ where: { personId: context.personId } });
    const currentVersion = current?.version ?? 0;
    if (currentVersion !== input.expectedVersion) stale(currentVersion);
    const previous = preferenceResult(current);
    const changedAt = new Date();
    await updateSuppressionWindows(transaction, context.personId, previous, next, changedAt);
    const row = current
      ? await transaction.notificationPreference.update({
          where: { id: current.id, version: currentVersion },
          data: { ...next, version: { increment: 1 } },
        })
      : await transaction.notificationPreference.create({ data: { ...next, personId: context.personId } });
    const result = { ...preferenceResult(row), replayed: false };
    await transaction.notificationInteraction.create({
      data: {
        action: "UPDATE_PREFERENCES",
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
        personId: context.personId,
        requestHash,
        result,
        resultVersion: row.version,
        scopeKey,
      },
    });
    return result;
  });
}

function mutationData(action: NotificationStateMutationInput["action"], changedAt: Date) {
  if (action === "MARK_READ") return { readState: "READ" as const, readStateChangedAt: changedAt };
  if (action === "MARK_UNREAD") return { readState: "UNREAD" as const, readStateChangedAt: changedAt };
  if (action === "ARCHIVE") return { archivedAt: changedAt };
  return { archivedAt: null };
}

async function interactionReplay<T extends { replayed: boolean }>(
  transaction: Prisma.TransactionClient,
  personId: string,
  idempotencyKey: string,
  requestHash: string,
): Promise<T | null> {
  const existing = await transaction.notificationInteraction.findUnique({
    where: { personId_idempotencyKey: { personId, idempotencyKey } },
  });
  if (!existing) return null;
  if (existing.requestHash !== requestHash) notificationError("IDEMPOTENCY_CONFLICT", "Notification key was used for different input.");
  if (!existing.result || typeof existing.result !== "object" || Array.isArray(existing.result)) {
    notificationError("IDEMPOTENCY_CONFLICT", "Notification replay result is unavailable.");
  }
  return { ...(existing.result as Record<string, unknown>), replayed: true } as T;
}

async function serializable<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof NotificationDomainError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002") && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("Notification transaction retry exhausted.");
}

function preferenceResult(row: {
  adminAnnouncementsEnabled: boolean;
  bookingsEnabled: boolean;
  commerceEnabled: boolean;
  messagesEnabled: boolean;
  restaurantEnabled: boolean;
  version: number;
} | null): NotificationPreferenceResult {
  return row ? {
    adminAnnouncementsEnabled: row.adminAnnouncementsEnabled,
    bookingsEnabled: row.bookingsEnabled,
    commerceEnabled: row.commerceEnabled,
    messagesEnabled: row.messagesEnabled,
    restaurantEnabled: row.restaurantEnabled,
    version: row.version,
  } : {
    adminAnnouncementsEnabled: true,
    bookingsEnabled: true,
    commerceEnabled: true,
    messagesEnabled: true,
    restaurantEnabled: true,
    version: 0,
  };
}

function preferenceValues(input: NotificationPreferenceInput) {
  return {
    adminAnnouncementsEnabled: input.adminAnnouncementsEnabled,
    bookingsEnabled: input.bookingsEnabled,
    commerceEnabled: input.commerceEnabled,
    messagesEnabled: input.messagesEnabled,
    restaurantEnabled: input.restaurantEnabled,
  };
}

async function updateSuppressionWindows(
  transaction: Prisma.TransactionClient,
  personId: string,
  previous: ReturnType<typeof preferenceResult>,
  next: ReturnType<typeof preferenceValues>,
  changedAt: Date,
) {
  const fields = [
    ["BOOKINGS", "bookingsEnabled"],
    ["RESTAURANT", "restaurantEnabled"],
    ["COMMERCE", "commerceEnabled"],
    ["PAYMENTS", "commerceEnabled"],
    ["MESSAGES", "messagesEnabled"],
    ["ADMIN_ANNOUNCEMENT", "adminAnnouncementsEnabled"],
  ] as const satisfies readonly (readonly [NotificationCategory, keyof typeof next])[];
  for (const [category, field] of fields) {
    if (previous[field] && !next[field]) {
      await transaction.notificationPreferenceSuppression.create({ data: { category, disabledAt: changedAt, personId } });
    } else if (!previous[field] && next[field]) {
      await transaction.notificationPreferenceSuppression.updateMany({
        where: { category, enabledAt: null, personId },
        data: { enabledAt: changedAt },
      });
    }
  }
}

function assertMutationInput(input: NotificationStateMutationInput) {
  if (!isUuid(input.notificationId) || !isUuid(input.idempotencyKey) ||
    !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    notificationError("VALIDATION_ERROR", "Notification mutation input is invalid.");
  }
}

function assertPreferenceInput(input: NotificationPreferenceInput) {
  if (!isUuid(input.idempotencyKey) || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    notificationError("VALIDATION_ERROR", "Notification preference input is invalid.");
  }
  for (const value of Object.values(preferenceValues(input))) {
    if (typeof value !== "boolean") notificationError("VALIDATION_ERROR", "Notification preference value is invalid.");
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function stale(currentVersion: number): never {
  return notificationError("STALE_VERSION", "Notification state changed.", { currentVersion });
}
