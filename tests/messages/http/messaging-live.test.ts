import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "../../../lib/db/prisma";

const baseUrl = process.env.MESSAGE_HTTP_BASE_URL ?? process.env.COMMERCE_HTTP_BASE_URL;
const marker = `stage4b-http-${randomUUID().slice(0, 8)}`;

async function signUp(label: string) {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    body: JSON.stringify({
      email: `${marker}-${label}@rezno.invalid`,
      name: `${marker}-${label}`,
      password: "password123",
    }),
    headers: { "content-type": "application/json", origin: baseUrl! },
    method: "POST",
  });
  assert.equal(response.status, 200);
  const payload = await response.json() as { user: { id: string } };
  const cookie = response.headers.getSetCookie().find((value) => value.includes("session_token="));
  assert.ok(cookie);
  const person = await prisma.person.update({
    where: { authUserId: payload.user.id },
    data: { isOnboarded: true, status: "ACTIVE" },
  });
  return { cookie: cookie.split(";")[0]!, person, userId: payload.user.id };
}

async function jsonRequest(
  path: string,
  options: {
    body?: unknown;
    cookie?: string;
    expoOrigin?: string | null;
    idempotencyKey?: string;
    method?: "GET" | "PATCH" | "POST";
  } = {},
) {
  const mutation = options.method === "PATCH" || options.method === "POST";
  const response = await fetch(`${baseUrl}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
      ...(mutation && options.expoOrigin !== null
        ? { "expo-origin": options.expoOrigin ?? "rezno://" }
        : {}),
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
    headers: {
      cookie,
      ...(rsc ? { accept: "text/x-component", rsc: "1" } : {}),
    },
    redirect: "manual",
  });
  return { response, text: await response.text() };
}

test("Gate 4B production RSC and Customer Mobile messaging contracts", {
  concurrency: false,
  skip: baseUrl ? false : "MESSAGE_HTTP_BASE_URL or COMMERCE_HTTP_BASE_URL is required",
}, async (t) => {
  const [customer, foreignCustomer, business] = await Promise.all([
    signUp("customer"),
    signUp("foreign"),
    signUp("business"),
  ]);
  const admin = business;
  const [organization, foreignOrganization] = await Promise.all([
    prisma.organization.create({
      data: { name: `${marker} BUSINESS`, slug: `${marker}-business` },
    }),
    prisma.organization.create({
      data: { name: `${marker} FOREIGN BUSINESS`, slug: `${marker}-foreign` },
    }),
  ]);
  const [branch, foreignBranch] = await Promise.all([
    prisma.branch.create({ data: { name: "Main", organizationId: organization.id, slug: "main" } }),
    prisma.branch.create({ data: { name: "Foreign", organizationId: foreignOrganization.id, slug: "foreign" } }),
  ]);
  const [ownerRole, foreignOwnerRole] = await Promise.all([
    prisma.role.create({ data: {
      isSystem: true, name: `${marker}-OWNER`, organizationId: organization.id, systemRole: "OWNER",
    } }),
    prisma.role.create({ data: {
      isSystem: true, name: `${marker}-FOREIGN-OWNER`, organizationId: foreignOrganization.id, systemRole: "OWNER",
    } }),
  ]);
  await prisma.organizationMember.createMany({ data: [
    { organizationId: organization.id, personId: business.person.id, roleId: ownerRole.id },
    { organizationId: foreignOrganization.id, personId: business.person.id, roleId: foreignOwnerRole.id },
  ] });
  await prisma.adminAccess.create({
    data: { permissions: ["MESSAGES_SEND", "MESSAGES_VIEW"], userId: admin.userId },
  });
  await prisma.booking.create({ data: {
    branchId: branch.id,
    customerId: customer.person.id,
    customerNameSnapshot: "PRIVATE HTTP CUSTOMER",
    endsAt: new Date("2026-09-18T11:00:00.000Z"),
    organizationId: organization.id,
    priceSnapshot: "1",
    serviceNameSnapshot: "HTTP service",
    startsAt: new Date("2026-09-18T10:00:00.000Z"),
  } });
  await prisma.booking.create({ data: {
    branchId: foreignBranch.id,
    customerId: foreignCustomer.person.id,
    customerNameSnapshot: "FOREIGN PRIVATE CUSTOMER",
    endsAt: new Date("2026-09-19T11:00:00.000Z"),
    organizationId: foreignOrganization.id,
    priceSnapshot: "1",
    serviceNameSnapshot: "Foreign HTTP service",
    startsAt: new Date("2026-09-19T10:00:00.000Z"),
  } });
  const businessCookie = `${business.cookie}; rezno-active-business-id=${organization.id}`;
  const foreignBusinessCookie = `${business.cookie}; rezno-active-business-id=${foreignOrganization.id}`;

  t.after(async () => {
    await prisma.conversation.deleteMany({
      where: {
        OR: [
          { businessId: { in: [organization.id, foreignOrganization.id] } },
          { customerId: { in: [customer.person.id, foreignCustomer.person.id] } },
          { adminUserId: admin.userId },
        ],
      },
    });
    await prisma.booking.deleteMany({
      where: { organizationId: { in: [organization.id, foreignOrganization.id] } },
    });
    await prisma.organizationMember.deleteMany({
      where: { organizationId: { in: [organization.id, foreignOrganization.id] } },
    });
    await prisma.role.deleteMany({
      where: { organizationId: { in: [organization.id, foreignOrganization.id] } },
    });
    await prisma.branch.deleteMany({
      where: { organizationId: { in: [organization.id, foreignOrganization.id] } },
    });
    await prisma.organization.deleteMany({ where: { id: { in: [organization.id, foreignOrganization.id] } } });
    await prisma.person.deleteMany({ where: { id: { in: [customer.person.id, foreignCustomer.person.id, business.person.id, admin.person.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [customer.userId, foreignCustomer.userId, business.userId, admin.userId] } } });
    await prisma.$disconnect();
  });

  let conversationId = "";
  let sentMessageId = "";

  await t.test("authenticated start/list/detail/history/send/read/count stay strict and scoped", async () => {
    assert.equal((await jsonRequest("/api/mobile/messages/conversations")).response.status, 401);
    const startKey = randomUUID();
    const started = await jsonRequest("/api/mobile/messages/conversations", {
      body: { body: `${marker} FIRST MESSAGE`, businessId: organization.id },
      cookie: customer.cookie,
      idempotencyKey: startKey,
      method: "POST",
    });
    assert.equal(started.response.status, 201);
    const startedData = started.body.data as {
      conversationId: string;
      message: { id: string };
    };
    conversationId = startedData.conversationId;
    const replay = await jsonRequest("/api/mobile/messages/conversations", {
      body: { body: `${marker} FIRST MESSAGE`, businessId: organization.id },
      cookie: customer.cookie,
      idempotencyKey: startKey,
      method: "POST",
    });
    assert.equal(replay.response.status, 200);
    assert.equal((replay.body.data as { replayed: boolean }).replayed, true);

    const listed = await jsonRequest("/api/mobile/messages/conversations?mode=all&limit=20", {
      cookie: customer.cookie,
    });
    assert.equal(listed.response.status, 200);
    const summaries = (listed.body.data as { data: Array<{ id: string; title: string }> }).data;
    assert.equal(summaries.some((item) => item.id === conversationId), true);
    assert.equal(JSON.stringify(summaries).includes("@rezno.invalid"), false);
    assert.equal(JSON.stringify(summaries).includes("PRIVATE HTTP CUSTOMER"), false);

    const detail = await jsonRequest(`/api/mobile/messages/conversations/${conversationId}`, {
      cookie: customer.cookie,
    });
    assert.equal(detail.response.status, 200);
    assert.equal((detail.body.data as { id: string }).id, conversationId);
    const history = await jsonRequest(`/api/mobile/messages/conversations/${conversationId}/messages?limit=30`, {
      cookie: customer.cookie,
    });
    assert.equal(history.response.status, 200);
    assert.equal((history.body.data as { data: unknown[] }).data.length, 1);

    for (let index = 1; index < 10; index += 1) {
      const quotaMessage = await jsonRequest("/api/mobile/messages/conversations", {
        body: { body: `${marker} QUOTA MESSAGE ${index}`, businessId: organization.id },
        cookie: customer.cookie,
        idempotencyKey: randomUUID(),
        method: "POST",
      });
      assert.equal(quotaMessage.response.status, 201);
    }
    const exhausted = await jsonRequest("/api/mobile/messages/conversations", {
      body: { body: `${marker} OVER QUOTA`, businessId: organization.id },
      cookie: customer.cookie,
      idempotencyKey: randomUUID(),
      method: "POST",
    });
    assert.equal(exhausted.response.status, 429);
    assert.equal((exhausted.body.error as { code: string }).code, "RATE_LIMITED");
    const replayAfterExhaustion = await jsonRequest("/api/mobile/messages/conversations", {
      body: { body: `${marker} FIRST MESSAGE`, businessId: organization.id },
      cookie: customer.cookie,
      idempotencyKey: startKey,
      method: "POST",
    });
    assert.equal(replayAfterExhaustion.response.status, 200);
    assert.equal((replayAfterExhaustion.body.data as { replayed: boolean }).replayed, true);
    const changedReplay = await jsonRequest("/api/mobile/messages/conversations", {
      body: { body: "changed replay", businessId: organization.id },
      cookie: customer.cookie,
      idempotencyKey: startKey,
      method: "POST",
    });
    assert.equal(changedReplay.response.status, 409);
    assert.equal((changedReplay.body.error as { code: string }).code, "IDEMPOTENCY_CONFLICT");
    const changedTargetReplay = await jsonRequest("/api/mobile/messages/conversations", {
      body: { body: `${marker} FIRST MESSAGE`, businessId: foreignOrganization.id },
      cookie: customer.cookie,
      idempotencyKey: startKey,
      method: "POST",
    });
    assert.equal(changedTargetReplay.response.status, 409);
    const crossActor = await jsonRequest("/api/mobile/messages/conversations", {
      body: { body: `${marker} CROSS ACTOR`, businessId: foreignOrganization.id },
      cookie: foreignCustomer.cookie,
      idempotencyKey: startKey,
      method: "POST",
    });
    assert.equal(crossActor.response.status, 201);
    assert.notEqual(
      (crossActor.body.data as { message: { id: string } }).message.id,
      startedData.message.id,
    );
    assert.equal(await prisma.message.count({
      where: { idempotencyKey: startKey, senderUserId: customer.userId },
    }), 1);
    assert.equal(await prisma.notification.count({
      where: { eventKey: { startsWith: `message:${startedData.message.id}:recipient:` } },
    }), 1);

    const sendKey = randomUUID();
    const sent = await jsonRequest(`/api/mobile/messages/conversations/${conversationId}/messages`, {
      body: { body: `<img src=x onerror=alert('${marker}')>` },
      cookie: customer.cookie,
      idempotencyKey: sendKey,
      method: "POST",
    });
    assert.equal(sent.response.status, 201);
    sentMessageId = (sent.body.data as { message: { id: string } }).message.id;
    const sendReplay = await jsonRequest(`/api/mobile/messages/conversations/${conversationId}/messages`, {
      body: { body: `<img src=x onerror=alert('${marker}')>` },
      cookie: customer.cookie,
      idempotencyKey: sendKey,
      method: "POST",
    });
    assert.equal((sendReplay.body.data as { replayed: boolean }).replayed, true);
    const conflict = await jsonRequest(`/api/mobile/messages/conversations/${conversationId}/messages`, {
      body: { body: "different" }, cookie: customer.cookie, idempotencyKey: sendKey, method: "POST",
    });
    assert.equal(conflict.response.status, 409);
    assert.equal((conflict.body.error as { code: string }).code, "IDEMPOTENCY_CONFLICT");

    await prisma.message.create({ data: {
      body: `${marker} BUSINESS REPLY`,
      conversationId,
      senderUserId: business.userId,
    } });
    const unread = await jsonRequest("/api/mobile/messages/unread-count", { cookie: customer.cookie });
    assert.ok((unread.body.data as { count: number }).count >= 1);
    const currentHistory = await jsonRequest(`/api/mobile/messages/conversations/${conversationId}/messages?limit=30`, {
      cookie: customer.cookie,
    });
    const throughMessageId = (currentHistory.body.data as { data: Array<{ id: string }> }).data[0]!.id;
    const read = await jsonRequest(`/api/mobile/messages/conversations/${conversationId}/read`, {
      body: { throughMessageId }, cookie: customer.cookie, method: "PATCH",
    });
    assert.equal(read.response.status, 200);
    assert.equal((read.body.data as { authorized: boolean }).authorized, true);
    assert.equal((await jsonRequest("/api/mobile/messages/unread-count", { cookie: customer.cookie }).then((item) => item.body.data) as { count: number }).count, 0);
  });

  await t.test("IDOR, mass assignment, malformed inputs, duplicate queries and mobile-origin checks return stable errors", async () => {
    const foreign = await jsonRequest(`/api/mobile/messages/conversations/${conversationId}`, {
      cookie: foreignCustomer.cookie,
    });
    assert.equal(foreign.response.status, 404);
    assert.equal((foreign.body.error as { code: string }).code, "NOT_FOUND");
    const cases = [
      jsonRequest(`/api/mobile/messages/conversations/${conversationId}/messages`, {
        body: { body: "x", personId: customer.person.id }, cookie: customer.cookie,
        idempotencyKey: randomUUID(), method: "POST",
      }),
      jsonRequest(`/api/mobile/messages/conversations/${conversationId}/messages`, {
        body: { body: "" }, cookie: customer.cookie, idempotencyKey: randomUUID(), method: "POST",
      }),
      jsonRequest(`/api/mobile/messages/conversations/${conversationId}/messages`, {
        body: { body: "x".repeat(1001) }, cookie: customer.cookie,
        idempotencyKey: randomUUID(), method: "POST",
      }),
      jsonRequest(`/api/mobile/messages/conversations/${conversationId}/messages`, {
        body: { body: "x" }, cookie: customer.cookie, idempotencyKey: "bad", method: "POST",
      }),
      jsonRequest(`/api/mobile/messages/conversations/${conversationId}/messages`, {
        body: { body: "x" }, cookie: customer.cookie, expoOrigin: null,
        idempotencyKey: randomUUID(), method: "POST",
      }),
      jsonRequest("/api/mobile/messages/conversations?limit=10&limit=20", { cookie: customer.cookie }),
      jsonRequest("/api/mobile/messages/conversations?cursor=forged&limit=10", { cookie: customer.cookie }),
      jsonRequest("/api/mobile/messages/conversations/not-a-uuid", { cookie: customer.cookie }),
    ];
    const results = await Promise.all(cases);
    for (const result of results) {
      assert.ok([400, 403].includes(result.response.status));
      assert.equal(JSON.stringify(result.body).includes("Prisma"), false);
      assert.equal(JSON.stringify(result.body).includes("PostgreSQL"), false);
    }
    const noRelationship = await jsonRequest("/api/mobile/messages/conversations", {
      body: { body: "forbidden target", businessId: organization.id },
      cookie: foreignCustomer.cookie,
      idempotencyKey: randomUUID(),
      method: "POST",
    });
    assert.equal(noRelationship.response.status, 404);
  });

  await t.test("a cursor cannot outlive the current Customer identity", async () => {
    await prisma.conversation.create({ data: {
      businessId: organization.id,
      customerId: customer.person.id,
      identityKey: `cursor:${randomUUID()}`,
      type: "CUSTOMER_BUSINESS",
    } });
    const firstPage = await jsonRequest("/api/mobile/messages/conversations?mode=all&limit=1", {
      cookie: customer.cookie,
    });
    assert.equal(firstPage.response.status, 200);
    const cursor = (firstPage.body.data as { nextCursor: string | null }).nextCursor;
    assert.ok(cursor);
    await prisma.person.update({
      where: { id: customer.person.id },
      data: { status: "INACTIVE" },
    });
    const staleCursor = await jsonRequest(
      `/api/mobile/messages/conversations?mode=all&limit=1&cursor=${encodeURIComponent(cursor)}`,
      { cookie: customer.cookie },
    );
    assert.equal(staleCursor.response.status, 403);
    assert.notEqual((staleCursor.body.error as { code: string }).code, "INVALID_CURSOR");
    await prisma.person.update({
      where: { id: customer.person.id },
      data: { status: "ACTIVE" },
    });
  });

  await t.test("Customer, Business and Admin HTML/RSC expose only legal Conversations and escape Message HTML", async () => {
    const foreignConversation = await prisma.conversation.create({
      data: {
        businessId: foreignOrganization.id,
        customerId: foreignCustomer.person.id,
        identityKey: `legacy:${randomUUID()}`,
        subject: `${marker} FOREIGN PRIVATE SUBJECT`,
        type: "CUSTOMER_BUSINESS",
        messages: { create: { body: `${marker} FOREIGN PRIVATE BODY`, senderUserId: foreignCustomer.userId } },
      },
    });
    const adminConversation = await prisma.conversation.create({
      data: {
        adminUserId: admin.userId,
        customerId: customer.person.id,
        identityKey: `admin-user:${admin.userId}:${customer.person.id}`,
        subject: `${marker} ADMIN SUBJECT`,
        type: "ADMIN_USER",
        messages: { create: { body: `${marker} ADMIN BODY`, senderUserId: admin.userId } },
      },
    });
    for (const rsc of [false, true]) {
      const customerPage = await page(`/customer/messages?conversationId=${conversationId}`, customer.cookie, rsc);
      assert.equal(customerPage.response.status, 200);
      assert.match(customerPage.text, new RegExp(marker));
      assert.equal(customerPage.text.includes("FOREIGN PRIVATE BODY"), false);
      if (rsc) {
        assert.match(customerPage.text, /(?:\\u003c|<)img src=x onerror=/);
      } else {
        assert.equal(customerPage.text.includes("&lt;img"), true);
      }

      const businessPage = await page(`/business/messages?conversationId=${conversationId}`, businessCookie, rsc);
      assert.equal(businessPage.response.status, 200);
      assert.match(businessPage.text, new RegExp(marker));
      assert.equal(businessPage.text.includes("FOREIGN PRIVATE BODY"), false);

      const adminPage = await page(`/admin/messages?conversationId=${adminConversation.id}`, admin.cookie, rsc);
      assert.equal(adminPage.response.status, 200);
      assert.match(adminPage.text, new RegExp(`${marker} ADMIN BODY`));
      assert.equal(adminPage.text.includes("FOREIGN PRIVATE BODY"), false);
    }
    const switched = await page(`/business/messages?conversationId=${foreignConversation.id}`, foreignBusinessCookie);
    assert.equal(switched.response.status, 200);
    assert.match(switched.text, new RegExp(`${marker} FOREIGN PRIVATE BODY`));
    assert.equal(switched.text.includes(`${marker} FIRST MESSAGE`), false);
    assert.ok(sentMessageId);
  });
});
