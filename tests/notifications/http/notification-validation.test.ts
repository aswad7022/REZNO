import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { NotificationDomainError } from "../../../features/notifications/domain/errors";
import {
  parseMarkAllRequest,
  parseNotificationPreferencesRequest,
  parseNotificationStateRequest,
} from "../../../features/notifications/api/validation";

test("notification mutation HTTP contracts require exact JSON and one UUID key", async () => {
  const id = randomUUID();
  const key = randomUUID();
  const request = new Request("https://rezno.invalid/api/mobile/notifications/state", {
    body: JSON.stringify({ action: "MARK_READ", expectedVersion: 0 }),
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    method: "PATCH",
  });
  assert.deepEqual(await parseNotificationStateRequest(request, id), {
    action: "MARK_READ", expectedVersion: 0, idempotencyKey: key, notificationId: id,
  });
  await assert.rejects(parseNotificationStateRequest(new Request("https://rezno.invalid", {
    body: JSON.stringify({ action: "MARK_READ", expectedVersion: 0, personId: randomUUID() }),
    headers: { "Content-Type": "application/json", "Idempotency-Key": key }, method: "PATCH",
  }), id), NotificationDomainError);
});

test("mark-all snapshot and preference bodies are strict", async () => {
  const key = randomUUID();
  const mark = await parseMarkAllRequest(new Request("https://rezno.invalid", {
    body: JSON.stringify({ expectedVersion: 2, snapshot: "2026-07-18T12:00:00.000Z" }),
    headers: { "Content-Type": "application/json", "Idempotency-Key": key }, method: "POST",
  }));
  assert.equal(mark.snapshot.toISOString(), "2026-07-18T12:00:00.000Z");
  const preferences = await parseNotificationPreferencesRequest(new Request("https://rezno.invalid", {
    body: JSON.stringify({
      adminAnnouncementsEnabled: true, bookingsEnabled: false, commerceEnabled: true,
      expectedVersion: 0, messagesEnabled: true, restaurantEnabled: false,
    }),
    headers: { "Content-Type": "application/json", "Idempotency-Key": key }, method: "PATCH",
  }));
  assert.equal(preferences.bookingsEnabled, false);
  await assert.rejects(parseMarkAllRequest(new Request("https://rezno.invalid", {
    body: JSON.stringify({ expectedVersion: 0, snapshot: "yesterday" }),
    headers: { "Content-Type": "application/json", "Idempotency-Key": key }, method: "POST",
  })), NotificationDomainError);
});
