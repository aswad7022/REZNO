import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  mergeNotificationPage,
  notificationMatchesFilter,
  reconcileMarkAllRead,
  reconcileNotificationState,
} from "../../../apps/mobile/src/notifications/notification-filter-state";
import type { MobileNotificationInbox, MobileNotificationItem } from "../../../apps/mobile/src/types/notifications";

function item(overrides: Partial<MobileNotificationItem> = {}): MobileNotificationItem {
  return {
    archived: false,
    body: "Body",
    bodyKey: null,
    category: "BOOKINGS",
    createdAt: "2026-07-18T10:00:00.000Z",
    destination: { href: "/customer/notifications", kind: "NOTIFICATIONS", targetId: null },
    eventType: "booking.updated",
    id: "11111111-1111-4111-8111-111111111111",
    localizationVariables: null,
    mandatory: false,
    priority: "NORMAL",
    read: false,
    stateVersion: 0,
    title: "Title",
    titleKey: null,
    ...overrides,
  };
}

function inbox(data: MobileNotificationItem[], unreadCount = data.filter((row) => !row.archived && !row.read).length): MobileNotificationInbox {
  return {
    data,
    inboxVersion: 0,
    pageInfo: { hasNextPage: true, nextCursor: "stale-cursor" },
    snapshot: "2026-07-18T10:30:00.000Z",
    unreadCount,
  };
}

test("notificationMatchesFilter implements the canonical mobile filter policy", () => {
  assert.equal(notificationMatchesFilter(item(), "all"), true);
  assert.equal(notificationMatchesFilter(item({ archived: true }), "all"), false);
  assert.equal(notificationMatchesFilter(item({ archived: true }), "archived"), true);
  assert.equal(notificationMatchesFilter(item({ priority: "IMPORTANT" }), "important"), true);
  assert.equal(notificationMatchesFilter(item({ archived: true, priority: "IMPORTANT" }), "important"), false);
  assert.equal(notificationMatchesFilter(item({ read: true }), "read"), true);
  assert.equal(notificationMatchesFilter(item(), "unread"), true);
});

test("read and unread mutations remove rows from incompatible selected filters", () => {
  const unread = item();
  const readResult = reconcileNotificationState(inbox([unread]), "unread", unread.id, { archived: false, readState: "READ", version: 1 });
  assert.deepEqual(readResult.data, []);
  assert.equal(readResult.unreadCount, 0);
  const read = item({ read: true, stateVersion: 1 });
  const unreadResult = reconcileNotificationState(inbox([read], 0), "read", read.id, { archived: false, readState: "UNREAD", version: 2 });
  assert.deepEqual(unreadResult.data, []);
  assert.equal(unreadResult.unreadCount, 1);
});

test("archive and restore reconcile normal, important and archived filters", () => {
  const important = item({ priority: "IMPORTANT" });
  for (const filter of ["all", "read", "unread", "important"] as const) {
    const source = filter === "read" ? { ...important, read: true } : important;
    assert.deepEqual(reconcileNotificationState(inbox([source]), filter, source.id, { archived: true, readState: source.read ? "READ" : null, version: 1 }).data, []);
  }
  const archived = item({ archived: true });
  assert.deepEqual(reconcileNotificationState(inbox([archived], 0), "archived", archived.id, { archived: false, readState: null, version: 1 }).data, []);
});

test("mark-all clears pre-snapshot unread rows and invalidates stale unread pagination", () => {
  const before = item();
  const result = reconcileMarkAllRead(inbox([before]), "unread", { readThrough: "2026-07-18T10:30:00.000Z", version: 1 });
  assert.deepEqual(result.data, []);
  assert.equal(result.unreadCount, 0);
  assert.deepEqual(result.pageInfo, { hasNextPage: false, nextCursor: null });
});

test("mark-all updates read/all/important and archived rows without crossing its snapshot", () => {
  const oldImportant = item({ priority: "IMPORTANT" });
  const future = item({ createdAt: "2026-07-18T11:00:00.000Z", id: "22222222-2222-4222-8222-222222222222", priority: "IMPORTANT" });
  const important = reconcileMarkAllRead(inbox([oldImportant, future], 2), "important", { readThrough: "2026-07-18T10:30:00.000Z", version: 1 });
  assert.equal(important.data[0]?.read, true);
  assert.equal(important.data.find((row) => row.id === future.id)?.read, false);
  assert.equal(important.unreadCount, 1);
  const archived = item({ archived: true });
  assert.equal(reconcileMarkAllRead(inbox([archived], 0), "archived", { readThrough: "2026-07-18T10:30:00.000Z", version: 1 }).data[0]?.read, true);
});

test("page append deduplicates refreshed rows and preserves the authoritative page state", () => {
  const first = item();
  const duplicate = { ...first, read: true, stateVersion: 1 };
  const second = item({ id: "22222222-2222-4222-8222-222222222222" });
  const merged = mergeNotificationPage(inbox([first]), { ...inbox([duplicate, second]), pageInfo: { hasNextPage: false, nextCursor: null } }, "all");
  assert.deepEqual(merged.data.map((row) => row.id), [first.id, second.id]);
  assert.equal(merged.data[0]?.read, true);
  assert.deepEqual(merged.pageInfo, { hasNextPage: false, nextCursor: null });
});

test("mobile screen reloads the selected filter after success, stale/conflict failure, and unread opening", async () => {
  const screen = await readFile(new URL("../../../apps/mobile/src/screens/customer-notification-center.tsx", import.meta.url), "utf8");
  assert.match(screen, /setInbox\(\(current\) => current \? reconcileNotificationState\(current, filter, item\.id, result\)/);
  assert.match(screen, /catch \{\s*await load\(filter\);\s*\}/);
  assert.match(screen, /if \(!item\.read\) await updateState\(item, "MARK_READ"\)/);
});
