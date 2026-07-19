import assert from "node:assert/strict";
import test from "node:test";

import {
  localeFromLanguage,
  notificationCategories,
  notificationDestinationKinds,
  notificationEventKey,
  notificationRequestHash,
  sanitizeLocalizationVariables,
  validateCanonicalNotificationEvent,
} from "../../../features/notifications/domain/contracts";
import {
  decodeNotificationCursor,
  encodeNotificationCursor,
  notificationFilterFingerprint,
} from "../../../features/notifications/domain/cursor";
import { NotificationDomainError } from "../../../features/notifications/domain/errors";
import { setNotificationCursorSigningSecretForTests } from "../../../features/notifications/domain/cursor-signing";
import {
  notificationEffectiveArchived,
  notificationEffectiveRead,
} from "../../../features/notifications/domain/state";
import {
  canReceiveOrganizationNotifications,
  notificationVisibilityWhere,
} from "../../../features/notifications/domain/visibility";
import { parseNotificationInboxQuery } from "../../../features/notifications/api/validation";
import { TEST_NOTIFICATION_CURSOR_SECRET } from "../../helpers/stage4-cursor-secret";

setNotificationCursorSigningSecretForTests(TEST_NOTIFICATION_CURSOR_SECRET);

const customer = { mode: "customer" as const, personId: "11111111-1111-4111-8111-111111111111" };
const owner = {
  effectiveCommercePermissions: ["ORDER_VIEW"] as const,
  membershipId: "22222222-2222-4222-8222-222222222222",
  mode: "business" as const,
  organizationId: "33333333-3333-4333-8333-333333333333",
  personId: "44444444-4444-4444-8444-444444444444",
  restaurant: false,
  roleId: "66666666-6666-4666-8666-666666666666",
  systemRole: "OWNER" as const,
};

test("canonical notification keys and request hashes are stable and actor-bound", () => {
  const input = { audience: "USER" as const, eventType: "booking.created", recipientPersonId: customer.personId, sourceId: owner.organizationId, sourceType: "BOOKING" as const };
  assert.equal(notificationEventKey(input), notificationEventKey({ ...input }));
  assert.notEqual(notificationEventKey(input), notificationEventKey({ ...input, recipientPersonId: owner.personId }));
  assert.equal(notificationRequestHash({ b: 2, a: 1 }), notificationRequestHash({ a: 1, b: 2 }));
});

test("canonical event validation rejects unsafe identities and localization PII", () => {
  assert.throws(() => validateCanonicalNotificationEvent({
    audience: "USER", body: "Body", category: "BOOKINGS", destinationKind: "CUSTOMER_BOOKING",
    eventKey: "event", eventType: "invalid", mandatory: false, priority: "NORMAL",
    recipientPersonId: customer.personId, sourceId: owner.organizationId, sourceType: "BOOKING", title: "Title",
  }), NotificationDomainError);
  assert.throws(() => sanitizeLocalizationVariables({ customerName: "private" }), NotificationDomainError);
  assert.throws(() => sanitizeLocalizationVariables({ token: "private" }), NotificationDomainError);
  assert.deepEqual(sanitizeLocalizationVariables({ guestCount: 2, status: "confirmed" }), { guestCount: 2, status: "confirmed" });
});

test("opaque cursor rejects filter, page-size, actor, role, organization and tamper reuse", () => {
  const filter = notificationFilterFingerprint({ filter: "all" });
  const cursor = encodeNotificationCursor({
    filter, id: "55555555-5555-4555-8555-555555555555", pageSize: 20,
    scope: `customer:${customer.personId}`, snapshot: "2026-07-18T10:00:00.000Z", sortValue: "2026-07-18T09:00:00.000Z",
  });
  assert.equal(decodeNotificationCursor(cursor, { context: customer, filter, pageSize: 20 }).id, "55555555-5555-4555-8555-555555555555");
  for (const expected of [
    { context: customer, filter: notificationFilterFingerprint({ filter: "read" }), pageSize: 20 },
    { context: customer, filter, pageSize: 10 },
    { context: owner, filter, pageSize: 20 },
  ]) assert.throws(() => decodeNotificationCursor(cursor, expected), NotificationDomainError);
  assert.throws(() => decodeNotificationCursor(`${cursor.slice(0, -1)}A`, { context: customer, filter, pageSize: 20 }), NotificationDomainError);
});

test("query parser rejects duplicate, unknown, excessive and reversed filters", () => {
  assert.deepEqual(parseNotificationInboxQuery(new URLSearchParams("filter=unread&limit=20&category=commerce")), {
    category: "COMMERCE", cursor: undefined, filter: "unread", from: undefined, limit: 20, to: undefined,
  });
  for (const raw of ["filter=all&filter=read", "unknown=1", "limit=51", "category=secret", "from=2026-08-01&to=2026-07-01"]) {
    assert.throws(() => parseNotificationInboxQuery(new URLSearchParams(raw)), NotificationDomainError);
  }
});

test("visibility policy locks customer, owner and staff scopes", () => {
  const customerWhere = notificationVisibilityWhere(customer);
  assert.equal(JSON.stringify(customerWhere).includes(customer.personId), true);
  const ownerWhere = notificationVisibilityWhere(owner);
  assert.equal(JSON.stringify(ownerWhere).includes(owner.organizationId), true);
  assert.equal(JSON.stringify(ownerWhere).includes("BUSINESS_OWNERS"), true);
  const staffWhere = notificationVisibilityWhere({ ...owner, systemRole: "STAFF" });
  assert.equal(JSON.stringify(staffWhere).includes(owner.organizationId), false);
  assert.equal(JSON.stringify(staffWhere).includes(owner.personId), true);
});

test("Manager, Receptionist and Restaurant visibility remain explicit while Staff is direct-only", () => {
  const manager = { ...owner, systemRole: "MANAGER" as const };
  const receptionist = { ...owner, systemRole: "RECEPTIONIST" as const };
  const restaurant = { ...owner, restaurant: true };
  assert.equal(JSON.stringify(notificationVisibilityWhere(manager)).includes(owner.organizationId), true);
  assert.equal(JSON.stringify(notificationVisibilityWhere(manager)).includes("BUSINESS_OWNERS"), false);
  assert.equal(JSON.stringify(notificationVisibilityWhere(receptionist)).includes(owner.organizationId), true);
  assert.equal(JSON.stringify(notificationVisibilityWhere(restaurant)).includes("RESTAURANTS"), true);
  assert.equal(canReceiveOrganizationNotifications(manager), true);
  assert.equal(canReceiveOrganizationNotifications({ ...owner, systemRole: "STAFF" }), false);
});

test("read calculation honors sparse overrides, mark-all watermark and archive independently", () => {
  const createdAt = new Date("2026-07-18T10:00:00.000Z");
  const watermark = {
    readAt: new Date("2026-07-18T11:00:00.000Z"),
    readThrough: new Date("2026-07-18T10:30:00.000Z"),
  };
  assert.equal(notificationEffectiveRead(createdAt, undefined, null), false);
  assert.equal(notificationEffectiveRead(createdAt, undefined, watermark), true);
  assert.equal(notificationEffectiveRead(createdAt, {
    readState: "UNREAD", readStateChangedAt: new Date("2026-07-18T11:30:00.000Z"),
  }, watermark), false);
  assert.equal(notificationEffectiveRead(createdAt, {
    readState: "READ", readStateChangedAt: new Date("2026-07-18T11:30:00.000Z"),
  }, watermark), true);
  assert.equal(notificationEffectiveArchived({ archivedAt: null }), false);
  assert.equal(notificationEffectiveArchived({ archivedAt: new Date("2026-07-18T12:00:00.000Z") }), true);
});

test("locales, categories and destination families are closed allowlists", () => {
  assert.deepEqual([localeFromLanguage("AR"), localeFromLanguage("EN"), localeFromLanguage("KU")], ["AR", "EN", "KU"]);
  assert.equal(notificationCategories.includes("ACCOUNT"), true);
  assert.equal(notificationDestinationKinds.includes("BUSINESS_COMMERCE_ORDER"), true);
  assert.equal(notificationDestinationKinds.some((kind) => /https|javascript|data/i.test(kind)), false);
});
