import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { CanonicalNotificationEvent, NotificationActorContext } from "../../../features/notifications/domain/contracts";
import { NotificationDomainError } from "../../../features/notifications/domain/errors";
import { backfillNotificationCenter } from "../../../features/notifications/services/backfill-service";
import { listNotificationInbox } from "../../../features/notifications/services/inbox-service";
import {
  markAllNotificationsRead,
  mutateNotificationState,
  updateNotificationPreferences,
} from "../../../features/notifications/services/interaction-service";
import { createCanonicalNotifications } from "../../../features/notifications/services/producer";
import { prisma } from "../../../lib/db/prisma";

function notificationError(code: NotificationDomainError["code"]) {
  return (error: unknown) => error instanceof NotificationDomainError && error.code === code;
}

async function reset() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  assert.match(rows[0]?.database ?? "", /stage4a|test/i);
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Organization", "Person" CASCADE');
}

async function person(label: string) {
  return prisma.person.create({ data: {
    authUserId: `stage4a-${label}-${randomUUID()}`,
    firstName: label,
    isOnboarded: true,
    preferredLanguage: "EN",
    status: "ACTIVE",
  } });
}

async function businessMember(organizationId: string, personId: string, role: "MANAGER" | "OWNER" | "RECEPTIONIST" | "STAFF") {
  const roleRow = await prisma.role.create({ data: {
    commercePermissions: role === "STAFF" ? [] : ["ORDER_VIEW"],
    isSystem: true,
    name: `${role}-${randomUUID().slice(0, 6)}`,
    organizationId,
    systemRole: role,
  } });
  return prisma.organizationMember.create({ data: { organizationId, personId, roleId: roleRow.id } });
}

function event(input: Partial<CanonicalNotificationEvent> = {}): CanonicalNotificationEvent {
  const sourceId = input.sourceId ?? randomUUID();
  return {
    audience: "USER",
    body: "A safe operational update is available.",
    category: "BOOKINGS",
    destinationKind: "NOTIFICATIONS",
    eventKey: `stage4a:${sourceId}:${randomUUID()}`,
    eventType: "stage4a.test-event",
    mandatory: false,
    priority: "NORMAL",
    sourceId,
    sourceType: "BOOKING",
    title: "Operational update",
    ...input,
  };
}

async function createEvents(events: CanonicalNotificationEvent[]) {
  return prisma.$transaction((transaction) => createCanonicalNotifications(transaction, events));
}

test("Gate 4A Notification Center is tenant-safe, idempotent and persistent", { concurrency: false }, async (t) => {
  await reset();
  t.after(async () => { await reset(); await prisma.$disconnect(); });

  const [customer, foreignCustomer, ownerPerson, managerPerson, receptionistPerson, staffPerson, foreignOwnerPerson, restaurantOwnerPerson] = await Promise.all([
    person("customer"), person("foreign-customer"), person("owner"), person("manager"), person("receptionist"), person("staff"), person("foreign-owner"), person("restaurant-owner"),
  ]);
  const [organization, foreignOrganization, restaurantOrganization] = await Promise.all([
    prisma.organization.create({ data: { name: "Stage 4A Business", slug: `stage4a-${randomUUID().slice(0, 8)}` } }),
    prisma.organization.create({ data: { name: "Foreign Business", slug: `foreign-${randomUUID().slice(0, 8)}` } }),
    prisma.organization.create({ data: { name: "Stage 4A Restaurant", slug: `restaurant-${randomUUID().slice(0, 8)}`, vertical: "RESTAURANT" } }),
  ]);
  const [owner, manager, receptionist, staff, foreignOwner, restaurantOwner, switchedOwner] = await Promise.all([
    businessMember(organization.id, ownerPerson.id, "OWNER"),
    businessMember(organization.id, managerPerson.id, "MANAGER"),
    businessMember(organization.id, receptionistPerson.id, "RECEPTIONIST"),
    businessMember(organization.id, staffPerson.id, "STAFF"),
    businessMember(foreignOrganization.id, foreignOwnerPerson.id, "OWNER"),
    businessMember(restaurantOrganization.id, restaurantOwnerPerson.id, "OWNER"),
    businessMember(foreignOrganization.id, ownerPerson.id, "OWNER"),
  ]);
  const customerContext = { mode: "customer", personId: customer.id } satisfies NotificationActorContext;
  const foreignCustomerContext = { mode: "customer", personId: foreignCustomer.id } satisfies NotificationActorContext;
  const ownerContext = { commercePermissions: ["ORDER_VIEW"], membershipId: owner.id, mode: "business", organizationId: organization.id, personId: ownerPerson.id, role: "OWNER" } satisfies NotificationActorContext;
  const managerContext = { commercePermissions: ["ORDER_VIEW"], membershipId: manager.id, mode: "business", organizationId: organization.id, personId: managerPerson.id, role: "MANAGER" } satisfies NotificationActorContext;
  const receptionistContext = { membershipId: receptionist.id, mode: "business", organizationId: organization.id, personId: receptionistPerson.id, role: "RECEPTIONIST" } satisfies NotificationActorContext;
  const staffContext = { membershipId: staff.id, mode: "business", organizationId: organization.id, personId: staffPerson.id, role: "STAFF" } satisfies NotificationActorContext;
  const foreignOwnerContext = { membershipId: foreignOwner.id, mode: "business", organizationId: foreignOrganization.id, personId: foreignOwnerPerson.id, role: "OWNER" } satisfies NotificationActorContext;
  const restaurantOwnerContext = { membershipId: restaurantOwner.id, mode: "business", organizationId: restaurantOrganization.id, personId: restaurantOwnerPerson.id, restaurant: true, role: "OWNER" } satisfies NotificationActorContext;
  const switchedOwnerContext = { membershipId: switchedOwner.id, mode: "business", organizationId: foreignOrganization.id, personId: ownerPerson.id, role: "OWNER" } satisfies NotificationActorContext;

  await t.test("consumer policy isolates broadcasts, direct recipients, roles, Restaurant and active Organizations", async () => {
    const directCustomer = event({ recipientPersonId: customer.id });
    const directForeign = event({ recipientPersonId: foreignCustomer.id });
    const organizationEvent = event({ audience: "BUSINESS", businessId: organization.id, recipientPersonId: undefined });
    const foreignBusiness = event({ audience: "BUSINESS", businessId: foreignOrganization.id, recipientPersonId: undefined });
    const directStaff = event({ businessId: organization.id, recipientPersonId: staffPerson.id });
    const all = event({ audience: "ALL", recipientPersonId: undefined });
    const customers = event({ audience: "CUSTOMERS", recipientPersonId: undefined });
    const ownerOnly = event({ audience: "BUSINESS_OWNERS", recipientPersonId: undefined });
    const restaurantOnly = event({ audience: "RESTAURANTS", category: "RESTAURANT", recipientPersonId: undefined, sourceType: "RESTAURANT_RESERVATION" });
    await createEvents([directCustomer, directForeign, organizationEvent, foreignBusiness, directStaff, all, customers, ownerOnly, restaurantOnly]);
    const [directCustomerId, directForeignId, organizationEventId, foreignBusinessId, directStaffId, customersId, ownerOnlyId, restaurantOnlyId] = await Promise.all([
      directCustomer, directForeign, organizationEvent, foreignBusiness, directStaff, customers, ownerOnly, restaurantOnly,
    ].map(async (item) => (await prisma.notification.findUniqueOrThrow({ where: { eventKey: item.eventKey } })).id));

    const customerIds = new Set((await listNotificationInbox(customerContext, { filter: "all", limit: 50 })).data.map((item) => item.id));
    assert.equal(customerIds.has(directCustomerId), true);
    assert.equal(customerIds.has(directForeignId), false);
    assert.equal(customerIds.has(customersId), true);
    assert.equal(customerIds.has(ownerOnlyId), false);
    const ownerData = await listNotificationInbox(ownerContext, { filter: "all", limit: 50 });
    assert.equal(ownerData.data.some((item) => item.eventType === organizationEvent.eventType && item.id === organizationEventId), true);
    assert.equal(ownerData.data.some((item) => item.id === foreignBusinessId), false);
    assert.equal(ownerData.data.some((item) => item.id === ownerOnlyId), true);
    assert.equal(ownerData.data.some((item) => item.id === restaurantOnlyId), false);
    const managerData = await listNotificationInbox(managerContext, { filter: "all", limit: 50 });
    assert.equal(managerData.data.some((item) => item.id === organizationEventId), true);
    assert.equal(managerData.data.some((item) => item.id === ownerOnlyId), false);
    const receptionData = await listNotificationInbox(receptionistContext, { filter: "all", limit: 50 });
    assert.equal(receptionData.data.some((item) => item.id === organizationEventId), true);
    const staffData = await listNotificationInbox(staffContext, { filter: "all", limit: 50 });
    assert.equal(staffData.data.some((item) => item.id === organizationEventId), false);
    assert.equal(staffData.data.some((item) => item.id === directStaffId), true);
    const foreignData = await listNotificationInbox(foreignOwnerContext, { filter: "all", limit: 50 });
    assert.equal(foreignData.data.some((item) => item.id === organizationEventId), false);
    const restaurantData = await listNotificationInbox(restaurantOwnerContext, { filter: "all", limit: 50 });
    assert.equal(restaurantData.data.some((item) => item.id === restaurantOnlyId), true);
    const switchedData = await listNotificationInbox(switchedOwnerContext, { filter: "all", limit: 2 });
    assert.equal(switchedData.data.some((item) => item.id === organizationEventId), false);
    const switchedAll = await listNotificationInbox(switchedOwnerContext, { filter: "all", limit: 50 });
    assert.equal(switchedAll.data.some((item) => item.id === foreignBusinessId), true);
    if (switchedData.pageInfo.nextCursor) {
      await assert.rejects(
        listNotificationInbox(ownerContext, { cursor: switchedData.pageInfo.nextCursor, filter: "all", limit: 2 }),
        notificationError("INVALID_CURSOR"),
      );
    }
  });

  await t.test("revoked membership and inactive Person fail closed while direct Person history remains personal", async () => {
    const directManager = event({ recipientPersonId: managerPerson.id });
    await createEvents([directManager]);
    const directManagerId = (await prisma.notification.findUniqueOrThrow({ where: { eventKey: directManager.eventKey } })).id;
    await prisma.organizationMember.update({ where: { id: manager.id }, data: { status: "INACTIVE" } });
    await assert.rejects(listNotificationInbox(managerContext, { filter: "all", limit: 10 }), notificationError("FORBIDDEN"));
    const personal = await listNotificationInbox({ mode: "customer", personId: managerPerson.id }, { filter: "all", limit: 50 });
    assert.equal(personal.data.some((item) => item.id === directManagerId), true);
    await prisma.organizationMember.update({ where: { id: manager.id }, data: { status: "ACTIVE" } });
    await prisma.person.update({ where: { id: staffPerson.id }, data: { status: "INACTIVE" } });
    await assert.rejects(listNotificationInbox(staffContext, { filter: "all", limit: 10 }), notificationError("FORBIDDEN"));
    await prisma.person.update({ where: { id: staffPerson.id }, data: { status: "ACTIVE" } });
  });

  await t.test("pagination is stable and cursors cannot cross filters or actor scopes", async () => {
    await createEvents(Array.from({ length: 5 }, () => event({ recipientPersonId: customer.id })));
    const first = await listNotificationInbox(customerContext, { filter: "all", limit: 2 });
    assert.equal(first.data.length, 2);
    assert.ok(first.pageInfo.nextCursor);
    const second = await listNotificationInbox(customerContext, { cursor: first.pageInfo.nextCursor!, filter: "all", limit: 2 });
    assert.equal(new Set([...first.data, ...second.data].map((item) => item.id)).size, first.data.length + second.data.length);
    await assert.rejects(listNotificationInbox(customerContext, { cursor: first.pageInfo.nextCursor!, filter: "read", limit: 2 }), notificationError("INVALID_CURSOR"));
    await assert.rejects(listNotificationInbox(foreignCustomerContext, { cursor: first.pageInfo.nextCursor!, filter: "all", limit: 2 }), notificationError("INVALID_CURSOR"));
  });

  await t.test("read/unread/archive interactions are replay-safe, versioned and Person scoped", async () => {
    const source = event({ recipientPersonId: customer.id });
    await createEvents([source]);
    const notification = await prisma.notification.findUniqueOrThrow({ where: { eventKey: source.eventKey } });
    const key = randomUUID();
    const read = await mutateNotificationState(customerContext, { action: "MARK_READ", expectedVersion: 0, idempotencyKey: key, notificationId: notification.id });
    assert.equal(read.version, 1);
    assert.equal((await mutateNotificationState(customerContext, { action: "MARK_READ", expectedVersion: 0, idempotencyKey: key, notificationId: notification.id })).replayed, true);
    await assert.rejects(mutateNotificationState(customerContext, { action: "ARCHIVE", expectedVersion: 1, idempotencyKey: key, notificationId: notification.id }), notificationError("IDEMPOTENCY_CONFLICT"));
    assert.equal((await listNotificationInbox(customerContext, { filter: "read", limit: 50 })).data.some((item) => item.id === notification.id), true);
    const unread = await mutateNotificationState(customerContext, { action: "MARK_UNREAD", expectedVersion: 1, idempotencyKey: randomUUID(), notificationId: notification.id });
    assert.equal(unread.readState, "UNREAD");
    await assert.rejects(mutateNotificationState(customerContext, { action: "MARK_UNREAD", expectedVersion: 0, idempotencyKey: randomUUID(), notificationId: notification.id }), notificationError("STALE_VERSION"));
    await assert.rejects(mutateNotificationState(foreignCustomerContext, { action: "MARK_READ", expectedVersion: 0, idempotencyKey: randomUUID(), notificationId: notification.id }), notificationError("NOT_FOUND"));
    const archived = await mutateNotificationState(customerContext, { action: "ARCHIVE", expectedVersion: 2, idempotencyKey: randomUUID(), notificationId: notification.id });
    assert.equal(archived.archived, true);
    assert.equal((await listNotificationInbox(customerContext, { filter: "archived", limit: 50 })).data.some((item) => item.id === notification.id), true);
    const restored = await mutateNotificationState(customerContext, { action: "RESTORE", expectedVersion: 3, idempotencyKey: randomUUID(), notificationId: notification.id });
    assert.equal(restored.archived, false);
  });

  await t.test("concurrent state writes allow one winner and reject a stale loser", async () => {
    const source = event({ recipientPersonId: customer.id });
    await createEvents([source]);
    const notification = await prisma.notification.findUniqueOrThrow({ where: { eventKey: source.eventKey } });
    const results = await Promise.allSettled([
      mutateNotificationState(customerContext, { action: "MARK_READ", expectedVersion: 0, idempotencyKey: randomUUID(), notificationId: notification.id }),
      mutateNotificationState(customerContext, { action: "ARCHIVE", expectedVersion: 0, idempotencyKey: randomUUID(), notificationId: notification.id }),
    ]);
    assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(results.filter((item) => item.status === "rejected" && notificationError("STALE_VERSION")(item.reason)).length, 1);
  });

  await t.test("mark-all uses a bounded watermark and preserves notifications arriving after the snapshot", async () => {
    const old = event({ recipientPersonId: customer.id });
    await createEvents([old]);
    const snapshot = await listNotificationInbox(customerContext, { filter: "all", limit: 50 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const next = event({ recipientPersonId: customer.id });
    await createEvents([next]);
    const result = await markAllNotificationsRead(customerContext, {
      expectedVersion: snapshot.inboxVersion, idempotencyKey: randomUUID(), snapshot: new Date(snapshot.snapshot),
    });
    assert.equal(result.version, snapshot.inboxVersion + 1);
    const unread = await listNotificationInbox(customerContext, { filter: "unread", limit: 50 });
    const nextId = (await prisma.notification.findUniqueOrThrow({ where: { eventKey: next.eventKey } })).id;
    const oldId = (await prisma.notification.findUniqueOrThrow({ where: { eventKey: old.eventKey } })).id;
    assert.equal(unread.data.some((item) => item.id === nextId), true);
    assert.equal(unread.data.some((item) => item.id === oldId), false);
    assert.ok(unread.unreadCount >= 1);
  });

  await t.test("preferences keep mandatory events and suppression windows do not resurrect hidden broadcasts", async () => {
    const preferenceKey = randomUUID();
    const preferenceInput = {
      adminAnnouncementsEnabled: false, bookingsEnabled: true, commerceEnabled: true, expectedVersion: 0,
      idempotencyKey: preferenceKey, messagesEnabled: true, restaurantEnabled: true,
    };
    const disabled = await updateNotificationPreferences(customerContext, preferenceInput);
    assert.equal((await updateNotificationPreferences(customerContext, preferenceInput)).replayed, true);
    await assert.rejects(updateNotificationPreferences(customerContext, {
      ...preferenceInput, bookingsEnabled: false,
    }), notificationError("IDEMPOTENCY_CONFLICT"));
    await assert.rejects(updateNotificationPreferences(customerContext, {
      ...preferenceInput, expectedVersion: 0, idempotencyKey: randomUUID(),
    }), notificationError("STALE_VERSION"));
    const optional = event({ audience: "CUSTOMERS", category: "ADMIN_ANNOUNCEMENT", mandatory: false, recipientPersonId: undefined, sourceType: "ADMIN_ANNOUNCEMENT" });
    const mandatory = event({ audience: "CUSTOMERS", category: "ADMIN_ANNOUNCEMENT", mandatory: true, recipientPersonId: undefined, sourceType: "ADMIN_ANNOUNCEMENT" });
    await createEvents([optional, mandatory]);
    const during = await listNotificationInbox(customerContext, { filter: "all", limit: 50 });
    const optionalId = (await prisma.notification.findUniqueOrThrow({ where: { eventKey: optional.eventKey } })).id;
    const mandatoryId = (await prisma.notification.findUniqueOrThrow({ where: { eventKey: mandatory.eventKey } })).id;
    assert.equal(during.data.some((item) => item.id === optionalId), false);
    assert.equal(during.data.some((item) => item.id === mandatoryId), true);
    await updateNotificationPreferences(customerContext, {
      adminAnnouncementsEnabled: true, bookingsEnabled: true, commerceEnabled: true, expectedVersion: disabled.version,
      idempotencyKey: randomUUID(), messagesEnabled: true, restaurantEnabled: true,
    });
    const after = event({ audience: "CUSTOMERS", category: "ADMIN_ANNOUNCEMENT", mandatory: false, recipientPersonId: undefined, sourceType: "ADMIN_ANNOUNCEMENT" });
    await createEvents([after]);
    const afterId = (await prisma.notification.findUniqueOrThrow({ where: { eventKey: after.eventKey } })).id;
    const reenabled = await listNotificationInbox(customerContext, { filter: "all", limit: 50 });
    assert.equal(reenabled.data.some((item) => item.id === optionalId), false);
    assert.equal(reenabled.data.some((item) => item.id === afterId), true);
  });

  await t.test("Booking, Restaurant, Commerce and Message producers are exact-once and transactional", async () => {
    const events = [
      event({ category: "BOOKINGS", eventType: "booking.confirmed", sourceType: "BOOKING", recipientPersonId: customer.id }),
      event({ category: "RESTAURANT", eventType: "restaurant.reservation.created", sourceType: "RESTAURANT_RESERVATION", recipientPersonId: customer.id }),
      event({ category: "COMMERCE", eventType: "order.created", sourceType: "COMMERCE_ORDER", recipientPersonId: customer.id }),
      event({ category: "MESSAGES", eventType: "message.arrived", sourceType: "CONVERSATION", recipientPersonId: customer.id }),
    ];
    assert.equal((await createEvents(events)).created, 4);
    assert.equal((await createEvents(events)).created, 0);
    assert.equal(await prisma.notification.count({ where: { eventKey: { in: events.map((item) => item.eventKey) } } }), 4);

    const rollbackEvent = event({ recipientPersonId: customer.id });
    await assert.rejects(prisma.$transaction(async (transaction) => {
      await createCanonicalNotifications(transaction, [rollbackEvent]);
      throw new Error("forced notification rollback");
    }), /forced notification rollback/);
    assert.equal(await prisma.notification.count({ where: { eventKey: rollbackEvent.eventKey } }), 0);
  });

  await t.test("typed destinations authorize the target and fall back when a direct event points to a foreign Booking", async () => {
    const foreignBranch = await prisma.branch.create({ data: { name: "Foreign", organizationId: foreignOrganization.id, slug: "foreign" } });
    const foreignBooking = await prisma.booking.create({ data: {
      branchId: foreignBranch.id, customerId: foreignCustomer.id, customerNameSnapshot: "PRIVATE NAME",
      endsAt: new Date(Date.now() + 7_200_000), organizationId: foreignOrganization.id, priceSnapshot: "1",
      serviceNameSnapshot: "Foreign", startsAt: new Date(Date.now() + 3_600_000),
    } });
    const unsafe = event({ destinationKind: "CUSTOMER_BOOKING", destinationTargetId: foreignBooking.id, recipientPersonId: customer.id });
    await createEvents([unsafe]);
    const unsafeId = (await prisma.notification.findUniqueOrThrow({ where: { eventKey: unsafe.eventKey } })).id;
    const listed = await listNotificationInbox(customerContext, { filter: "all", limit: 50 });
    assert.deepEqual(listed.data.find((item) => item.id === unsafeId)?.destination, { href: "/customer/notifications", kind: "NOTIFICATIONS", targetId: null });
  });

  await t.test("historical backfill is deterministic, rerunnable and preserves all domain ledgers", async () => {
    const branch = await prisma.branch.create({ data: { name: "Main", organizationId: organization.id, slug: "main" } });
    const booking = await prisma.booking.create({ data: {
      branchId: branch.id, customerId: customer.id, customerNameSnapshot: "PRIVATE BACKFILL NAME",
      endsAt: new Date(Date.now() - 3_600_000), organizationId: organization.id, priceSnapshot: "25000",
      serviceNameSnapshot: "Private service snapshot", startsAt: new Date(Date.now() - 7_200_000), status: "COMPLETED",
      statusHistory: { create: { toStatus: "COMPLETED" } },
    } });
    const dry = await backfillNotificationCenter(prisma, { batchSize: 1, dryRun: true });
    assert.ok(dry.candidates.bookingHistory >= 1);
    assert.equal(dry.created, 0);
    const first = await backfillNotificationCenter(prisma, { batchSize: 1, dryRun: false });
    const second = await backfillNotificationCenter(prisma, { batchSize: 1, dryRun: false });
    assert.ok(first.created >= 2);
    assert.equal(second.created, 0);
    assert.deepEqual(first.domainFingerprintBefore, first.domainFingerprintAfter);
    assert.deepEqual(second.domainFingerprintBefore, second.domainFingerprintAfter);
    const rows = await prisma.notification.findMany({ where: { sourceId: booking.id } });
    assert.equal(JSON.stringify(rows).includes("PRIVATE BACKFILL NAME"), false);
    assert.equal(JSON.stringify(rows).includes("Private service snapshot"), false);
  });
});
