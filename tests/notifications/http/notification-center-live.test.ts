import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import type { CanonicalNotificationEvent } from "../../../features/notifications/domain/contracts";
import { createCanonicalNotifications } from "../../../features/notifications/services/producer";
import { prisma } from "../../../lib/db/prisma";

const baseUrl = process.env.NOTIFICATION_HTTP_BASE_URL ?? process.env.COMMERCE_HTTP_BASE_URL;
const marker = `stage4a-http-${randomUUID().slice(0, 8)}`;

function forgePublicShaCursor(cursor: string, changes: Record<string, unknown>) {
  const decoded = {
    ...JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>,
    ...changes,
  };
  const { mac: _mac, ...core } = decoded;
  void _mac;
  return Buffer.from(JSON.stringify({
    ...decoded,
    mac: createHash("sha256").update(JSON.stringify(core)).digest("hex"),
  }), "utf8").toString("base64url");
}

async function signUp(label: string) {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    body: JSON.stringify({ email: `${marker}-${label}@rezno.invalid`, name: label, password: "password123" }),
    headers: { "content-type": "application/json", origin: baseUrl! },
    method: "POST",
  });
  assert.equal(response.status, 200);
  const payload = await response.json() as { user: { id: string } };
  const cookie = response.headers.getSetCookie().find((value) => value.includes("session_token="));
  assert.ok(cookie);
  const person = await prisma.person.update({
    where: { authUserId: payload.user.id },
    data: { isOnboarded: true, phone: "+9647500000410", status: "ACTIVE" },
  });
  return { cookie: cookie.split(";")[0]!, person, userId: payload.user.id };
}

async function jsonRequest(
  path: string,
  options: { body?: unknown; cookie?: string; idempotencyKey?: string; method?: string } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json", origin: baseUrl! }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
    },
    method: options.method ?? "GET",
    redirect: "manual",
  });
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  return { body: await response.json() as Record<string, unknown>, response };
}

async function page(path: string, cookie: string, rsc = false) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { cookie, ...(rsc ? { accept: "text/x-component", rsc: "1" } : {}) },
    redirect: "manual",
  });
  return { response, text: await response.text() };
}

function canonical(input: Partial<CanonicalNotificationEvent> & Pick<CanonicalNotificationEvent, "eventKey" | "title">): CanonicalNotificationEvent {
  return {
    audience: "USER",
    body: "Bounded HTTP notification body.",
    category: "BOOKINGS",
    destinationKind: "NOTIFICATIONS",
    eventType: "stage4a.http",
    mandatory: false,
    priority: "NORMAL",
    sourceId: randomUUID(),
    sourceType: "BOOKING",
    ...input,
  };
}

test("Gate 4A production HTML, RSC and mobile APIs enforce canonical notification contracts", {
  concurrency: false,
  skip: baseUrl ? false : "NOTIFICATION_HTTP_BASE_URL or COMMERCE_HTTP_BASE_URL is required",
}, async (t) => {
  const [customer, foreignCustomer, business] = await Promise.all([
    signUp("customer"), signUp("foreign"), signUp("business"),
  ]);
  const [organization, foreignOrganization] = await Promise.all([
    prisma.organization.create({ data: { name: `${marker} business`, slug: `${marker}-business` } }),
    prisma.organization.create({ data: { name: `${marker} foreign`, slug: `${marker}-foreign` } }),
  ]);
  const roles = await Promise.all((["OWNER", "MANAGER", "RECEPTIONIST", "STAFF"] as const).map((systemRole) =>
    prisma.role.create({ data: {
      commercePermissions: systemRole === "STAFF" ? [] : ["ORDER_VIEW"],
      isSystem: true,
      name: `${marker}-${systemRole}`,
      organizationId: organization.id,
      systemRole,
    } }),
  ));
  const foreignOwnerRole = await prisma.role.create({ data: {
    commercePermissions: ["ORDER_VIEW"],
    isSystem: true,
    name: `${marker}-FOREIGN-OWNER`,
    organizationId: foreignOrganization.id,
    systemRole: "OWNER",
  } });
  const membership = await prisma.organizationMember.create({ data: {
    organizationId: organization.id,
    personId: business.person.id,
    roleId: roles[0]!.id,
  } });
  await prisma.organizationMember.create({ data: {
    organizationId: foreignOrganization.id,
    personId: business.person.id,
    roleId: foreignOwnerRole.id,
  } });
  const businessCookie = `${business.cookie}; rezno-active-business-id=${organization.id}`;
  const foreignBusinessCookie = `${business.cookie}; rezno-active-business-id=${foreignOrganization.id}`;
  const eventPrefix = `${marker}:`;
  const historicalTime = new Date("2025-01-02T10:00:00.000Z");
  const customerEvent = canonical({ eventKey: `${eventPrefix}customer`, occurredAt: historicalTime, recipientPersonId: customer.person.id, title: `${marker} CUSTOMER VISIBLE` });
  const foreignEvent = canonical({ eventKey: `${eventPrefix}foreign`, recipientPersonId: foreignCustomer.person.id, title: `${marker} FOREIGN PRIVATE` });
  const businessEvent = canonical({ audience: "BUSINESS", businessId: organization.id, eventKey: `${eventPrefix}business`, recipientPersonId: undefined, title: `${marker} BUSINESS VISIBLE` });
  const foreignBusinessEvent = canonical({ audience: "BUSINESS", businessId: foreignOrganization.id, eventKey: `${eventPrefix}foreign-business`, recipientPersonId: undefined, title: `${marker} FOREIGN BUSINESS PRIVATE` });
  const ownerEvent = canonical({ audience: "BUSINESS_OWNERS", eventKey: `${eventPrefix}owner`, recipientPersonId: undefined, title: `${marker} OWNER VISIBLE` });
  const directBusinessEvent = canonical({ businessId: organization.id, eventKey: `${eventPrefix}direct-business`, recipientPersonId: business.person.id, title: `${marker} DIRECT BUSINESS VISIBLE` });
  const unsafeEvent = canonical({ destinationKind: "CUSTOMER_BOOKING", destinationTargetId: randomUUID(), eventKey: `${eventPrefix}unsafe`, recipientPersonId: customer.person.id, title: `${marker} UNSAFE FALLBACK` });
  await prisma.$transaction((transaction) => createCanonicalNotifications(transaction, [
    customerEvent, foreignEvent, businessEvent, foreignBusinessEvent, ownerEvent, directBusinessEvent, unsafeEvent,
  ]));

  t.after(async () => {
    await prisma.notification.deleteMany({ where: { eventKey: { startsWith: eventPrefix } } });
    await prisma.organizationMember.deleteMany({ where: { organizationId: { in: [organization.id, foreignOrganization.id] } } });
    await prisma.role.deleteMany({ where: { organizationId: { in: [organization.id, foreignOrganization.id] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [organization.id, foreignOrganization.id] } } });
    await prisma.person.deleteMany({ where: { id: { in: [customer.person.id, foreignCustomer.person.id, business.person.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [customer.userId, foreignCustomer.userId, business.userId] } } });
    await prisma.$disconnect();
  });

  await t.test("Customer and Business HTML/RSC are role and tenant scoped", async () => {
    for (const rsc of [false, true]) {
      const customerPage = await page("/customer/notifications?filter=all", customer.cookie, rsc);
      assert.equal(customerPage.response.status, 200);
      assert.match(customerPage.text, new RegExp(`${marker} CUSTOMER VISIBLE`));
      assert.match(customerPage.text, /2025-01-02T10:00:00\.000Z/);
      assert.equal(customerPage.text.includes(`${marker} FOREIGN PRIVATE`), false);

      const ownerPage = await page("/business/notifications?filter=all", businessCookie, rsc);
      assert.equal(ownerPage.response.status, 200);
      assert.match(ownerPage.text, new RegExp(`${marker} BUSINESS VISIBLE`));
      assert.match(ownerPage.text, new RegExp(`${marker} OWNER VISIBLE`));
      assert.equal(ownerPage.text.includes(`${marker} FOREIGN BUSINESS PRIVATE`), false);
      assert.equal(ownerPage.text.includes(`${marker} FOREIGN PRIVATE`), false);
    }
    const communications = await page("/business/communications", businessCookie, true);
    assert.equal(communications.response.status, 200);
    assert.equal(communications.text.includes("NEXT_HTTP_ERROR_FALLBACK;403"), false);
    assert.equal(communications.text.includes("NEXT_HTTP_ERROR_FALLBACK;404"), false);
    assert.match(communications.text, /communications/);

    await prisma.organizationMember.update({ where: { id: membership.id }, data: { roleId: roles[1]!.id } });
    const managerPage = await page("/business/notifications?filter=all", businessCookie);
    assert.match(managerPage.text, new RegExp(`${marker} BUSINESS VISIBLE`));
    assert.equal(managerPage.text.includes(`${marker} OWNER VISIBLE`), false);
    await prisma.organizationMember.update({ where: { id: membership.id }, data: { roleId: roles[2]!.id } });
    assert.match((await page("/business/notifications?filter=all", businessCookie)).text, new RegExp(`${marker} BUSINESS VISIBLE`));
    await prisma.organizationMember.update({ where: { id: membership.id }, data: { roleId: roles[3]!.id } });
    const staffPage = await page("/business/notifications?filter=all", businessCookie);
    assert.match(staffPage.text, new RegExp(`${marker} DIRECT BUSINESS VISIBLE`));
    assert.equal(staffPage.text.includes(`${marker} BUSINESS VISIBLE`), false);
    await prisma.organizationMember.update({ where: { id: membership.id }, data: { roleId: roles[0]!.id } });

    const switchedPage = await page("/business/notifications?filter=all", foreignBusinessCookie);
    assert.match(switchedPage.text, new RegExp(`${marker} FOREIGN BUSINESS PRIVATE`));
    assert.equal(switchedPage.text.includes(`${marker} BUSINESS VISIBLE`), false);

    await prisma.organizationMember.update({ where: { id: membership.id }, data: { status: "INACTIVE" } });
    const revokedPage = await page("/business/notifications?filter=all", businessCookie);
    assert.equal(revokedPage.text.includes(`${marker} BUSINESS VISIBLE`), false);
    await prisma.organizationMember.update({ where: { id: membership.id }, data: { status: "ACTIVE" } });
    await prisma.person.update({ where: { id: business.person.id }, data: { status: "INACTIVE" } });
    const inactivePersonPage = await page("/business/notifications?filter=all", businessCookie);
    assert.equal(inactivePersonPage.text.includes(`${marker} BUSINESS VISIBLE`), false);
    await prisma.person.update({ where: { id: business.person.id }, data: { status: "ACTIVE" } });
  });

  await t.test("mobile list, state, mark-all, preferences and errors use stable JSON", async () => {
    const unauthenticated = await jsonRequest("/api/mobile/notifications?filter=all&limit=10");
    assert.equal(unauthenticated.response.status, 401);
    const listed = await jsonRequest("/api/mobile/notifications?filter=all&limit=50", { cookie: customer.cookie });
    assert.equal(listed.response.status, 200);
    const inbox = listed.body.data as {
      data: Array<{ createdAt: string; destination: { href: string; kind: string }; id: string; stateVersion: number; title: string }>;
      inboxVersion: number;
      snapshot: string;
      unreadCount: number;
    };
    const item = inbox.data.find((row) => row.title === `${marker} CUSTOMER VISIBLE`);
    const unsafe = inbox.data.find((row) => row.title === `${marker} UNSAFE FALLBACK`);
    assert.ok(item);
    assert.equal(item.createdAt, historicalTime.toISOString());
    assert.deepEqual(unsafe?.destination, { href: "/customer/notifications", kind: "NOTIFICATIONS", targetId: null });
    assert.ok(inbox.unreadCount >= 2);
    const count = await jsonRequest("/api/mobile/notifications/count", { cookie: customer.cookie });
    assert.ok((count.body.data as { unreadCount: number }).unreadCount >= 2);
    const invalidCursor = await jsonRequest("/api/mobile/notifications?filter=all&cursor=forged&limit=10", { cookie: customer.cookie });
    assert.equal(invalidCursor.response.status, 400);
    assert.equal((invalidCursor.body.error as { code: string }).code, "INVALID_CURSOR");
    const cursorPage = await jsonRequest("/api/mobile/notifications?filter=all&limit=1", { cookie: customer.cookie });
    const cursor = (cursorPage.body.data as { pageInfo: { nextCursor: string | null } }).pageInfo.nextCursor;
    assert.ok(cursor);
    const forgedCursor = await jsonRequest(
      `/api/mobile/notifications?filter=all&limit=1&cursor=${encodeURIComponent(forgePublicShaCursor(cursor, { pageSize: 10 }))}`,
      { cookie: customer.cookie },
    );
    assert.equal(forgedCursor.response.status, 400);
    assert.equal((forgedCursor.body.error as { code: string }).code, "INVALID_CURSOR");
    assert.doesNotMatch(JSON.stringify(forgedCursor.body), /mac|scope|snapshot|BETTER_AUTH_SECRET|HMAC|HKDF/i);

    const readKey = randomUUID();
    const readInput = { action: "MARK_READ", expectedVersion: item.stateVersion };
    const read = await jsonRequest(`/api/mobile/notifications/${item.id}/state`, {
      body: readInput, cookie: customer.cookie, idempotencyKey: readKey, method: "PATCH",
    });
    assert.equal(read.response.status, 200);
    assert.equal((read.body.data as { version: number }).version, 1);
    const replay = await jsonRequest(`/api/mobile/notifications/${item.id}/state`, {
      body: readInput, cookie: customer.cookie, idempotencyKey: readKey, method: "PATCH",
    });
    assert.deepEqual(replay.body, { data: { ...(read.body.data as object), replayed: true } });
    const conflict = await jsonRequest(`/api/mobile/notifications/${item.id}/state`, {
      body: { action: "ARCHIVE", expectedVersion: 1 }, cookie: customer.cookie, idempotencyKey: readKey, method: "PATCH",
    });
    assert.equal(conflict.response.status, 409);
    assert.equal((conflict.body.error as { code: string }).code, "IDEMPOTENCY_CONFLICT");
    const unread = await jsonRequest(`/api/mobile/notifications/${item.id}/state`, {
      body: { action: "MARK_UNREAD", expectedVersion: 1 }, cookie: customer.cookie, idempotencyKey: randomUUID(), method: "PATCH",
    });
    assert.equal((unread.body.data as { readState: string }).readState, "UNREAD");
    const archived = await jsonRequest(`/api/mobile/notifications/${item.id}/state`, {
      body: { action: "ARCHIVE", expectedVersion: 2 }, cookie: customer.cookie, idempotencyKey: randomUUID(), method: "PATCH",
    });
    assert.equal((archived.body.data as { archived: boolean }).archived, true);
    const restored = await jsonRequest(`/api/mobile/notifications/${item.id}/state`, {
      body: { action: "RESTORE", expectedVersion: 3 }, cookie: customer.cookie, idempotencyKey: randomUUID(), method: "PATCH",
    });
    assert.equal((restored.body.data as { archived: boolean }).archived, false);

    const postSnapshot = canonical({
      eventKey: `${eventPrefix}post-snapshot`,
      occurredAt: new Date(new Date(inbox.snapshot).getTime() + 1),
      recipientPersonId: customer.person.id,
      title: `${marker} POST SNAPSHOT UNREAD`,
    });
    await prisma.$transaction((transaction) => createCanonicalNotifications(transaction, [postSnapshot]));
    const markAll = await jsonRequest("/api/mobile/notifications/mark-all-read", {
      body: { expectedVersion: inbox.inboxVersion, snapshot: inbox.snapshot }, cookie: customer.cookie,
      idempotencyKey: randomUUID(), method: "POST",
    });
    assert.equal(markAll.response.status, 200);
    const unreadAfterMarkAll = await jsonRequest("/api/mobile/notifications?filter=unread&limit=50", { cookie: customer.cookie });
    const unreadAfterMarkAllData = (unreadAfterMarkAll.body.data as { data: Array<{ title: string }> }).data;
    assert.equal(unreadAfterMarkAllData.some((row) => row.title === `${marker} POST SNAPSHOT UNREAD`), true);
    const preferences = await jsonRequest("/api/mobile/notifications/preferences", { cookie: customer.cookie });
    const preference = preferences.body.data as { version: number };
    const preferenceInput = {
      adminAnnouncementsEnabled: true, bookingsEnabled: true, commerceEnabled: true,
      expectedVersion: preference.version, messagesEnabled: false, restaurantEnabled: true,
    };
    const preferenceKey = randomUUID();
    const updated = await jsonRequest("/api/mobile/notifications/preferences", {
      body: preferenceInput, cookie: customer.cookie, idempotencyKey: preferenceKey, method: "PATCH",
    });
    assert.equal(updated.response.status, 200);
    const preferenceReplay = await jsonRequest("/api/mobile/notifications/preferences", {
      body: preferenceInput, cookie: customer.cookie, idempotencyKey: preferenceKey, method: "PATCH",
    });
    assert.equal((preferenceReplay.body.data as { replayed: boolean }).replayed, true);
    const optionalMessage = canonical({
      category: "MESSAGES",
      destinationKind: "CUSTOMER_MESSAGES",
      eventKey: `${eventPrefix}optional-message`,
      eventType: "message.arrived",
      recipientPersonId: customer.person.id,
      sourceType: "CONVERSATION",
      title: `${marker} OPTIONAL MESSAGE SUPPRESSED`,
    });
    const mandatoryMessage = canonical({
      category: "MESSAGES",
      destinationKind: "CUSTOMER_MESSAGES",
      eventKey: `${eventPrefix}mandatory-message`,
      eventType: "message.security-alert",
      mandatory: true,
      recipientPersonId: customer.person.id,
      sourceType: "CONVERSATION",
      title: `${marker} MANDATORY MESSAGE VISIBLE`,
    });
    const preferenceDelivery = await prisma.$transaction((transaction) =>
      createCanonicalNotifications(transaction, [optionalMessage, mandatoryMessage]));
    assert.deepEqual(preferenceDelivery, { created: 1, suppressed: 1 });
    const messageInbox = await jsonRequest("/api/mobile/notifications?category=MESSAGES&filter=all&limit=50", { cookie: customer.cookie });
    const messageRows = (messageInbox.body.data as { data: Array<{ title: string }> }).data;
    assert.equal(messageRows.some((row) => row.title === `${marker} OPTIONAL MESSAGE SUPPRESSED`), false);
    assert.equal(messageRows.some((row) => row.title === `${marker} MANDATORY MESSAGE VISIBLE`), true);
    assert.equal(JSON.stringify([listed.body, read.body, updated.body]).includes("Prisma"), false);
    assert.equal(JSON.stringify([listed.body, read.body, updated.body]).includes("PostgreSQL"), false);
  });
});
