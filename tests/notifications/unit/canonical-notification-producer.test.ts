import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { Prisma } from "@prisma/client";

import type { CanonicalNotificationEvent } from "../../../features/notifications/domain/contracts";
import { createCanonicalNotifications } from "../../../features/notifications/services/producer";

function event(input: Partial<CanonicalNotificationEvent> = {}): CanonicalNotificationEvent {
  return {
    audience: "USER",
    body: "Body",
    category: "BOOKINGS",
    destinationKind: "NOTIFICATIONS",
    eventKey: `producer:${input.audience ?? "USER"}:${input.sourceId ?? "11111111-1111-4111-8111-111111111111"}`,
    eventType: "booking.updated",
    mandatory: false,
    priority: "NORMAL",
    recipientPersonId: "22222222-2222-4222-8222-222222222222",
    sourceId: "11111111-1111-4111-8111-111111111111",
    sourceType: "BOOKING",
    title: "Title",
    ...input,
  };
}

function transactionCapture() {
  const rows: Array<Record<string, unknown>> = [];
  const transaction = {
    notificationPreference: { findMany: async () => [] },
    notification: { createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { rows.push(...data); return { count: data.length }; } },
  } as unknown as Prisma.TransactionClient;
  return { rows, transaction };
}

test("canonical producer persists explicit occurrence time as the inbox creation time", async () => {
  const { rows, transaction } = transactionCapture();
  const occurredAt = new Date("2026-01-02T03:04:05.000Z");
  await createCanonicalNotifications(transaction, [event({ occurredAt })], { producedAt: new Date("2026-07-18T10:00:00.000Z") });
  assert.equal(rows[0]?.createdAt, occurredAt);
  assert.equal(rows[0]?.occurredAt, occurredAt);
});

test("direct and broadcast live events share one injected producer timestamp", async () => {
  const { rows, transaction } = transactionCapture();
  const producedAt = new Date("2026-07-18T10:00:00.000Z");
  await createCanonicalNotifications(transaction, [
    event(),
    event({ audience: "ALL", eventKey: "producer:ALL:broadcast", recipientPersonId: undefined }),
  ], { producedAt });
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.createdAt, producedAt);
    assert.equal(row.occurredAt, producedAt);
  }
});

test("migration 36 repairs only deterministic backfill occurrence timestamps", async () => {
  const migration = await readFile(new URL("../../../prisma/migrations/20260718080000_notification_backfill_occurrence_time/migration.sql", import.meta.url), "utf8");
  assert.match(migration, /SET "createdAt" = "occurredAt"/);
  assert.match(migration, /WHERE "eventKey" LIKE 'backfill:%'/);
  assert.match(migration, /"createdAt" IS DISTINCT FROM "occurredAt"/);
  assert.equal(Array.from(migration.matchAll(/\bUPDATE\b/gi)).length, 1);
  assert.match(migration, /UPDATE "Notification"/);
  assert.doesNotMatch(migration, /DELETE|TRUNCATE|DROP|ALTER TABLE/i);
});
