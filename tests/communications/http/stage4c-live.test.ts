import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "../../../lib/db/prisma";

const baseUrl = process.env.COMMUNICATION_HTTP_BASE_URL ?? process.env.COMMERCE_HTTP_BASE_URL;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
const oidcToken = process.env.VERCEL_OIDC_TOKEN ?? "";
const marker = `stage4c-http-${randomUUID().slice(0, 8)}`;

function protectedHeaders(initial?: HeadersInit) {
  const headers = new Headers(initial);
  if (bypass) headers.set("x-vercel-protection-bypass", bypass);
  else if (oidcToken) headers.set("x-vercel-trusted-oidc-idp-token", oidcToken);
  return headers;
}

async function signUp(label: string) {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: protectedHeaders({ "content-type": "application/json", origin: baseUrl! }),
    body: JSON.stringify({ email: `${marker}-${label}@rezno.invalid`, name: label, password: "password123" }),
  });
  assert.equal(response.status, 200);
  const payload = await response.json() as { user: { id: string } };
  const cookie = response.headers.getSetCookie().find((value) => value.includes("session_token="));
  assert.ok(cookie);
  const [person] = await Promise.all([
    prisma.person.update({
      where: { authUserId: payload.user.id },
      data: { isOnboarded: true, status: "ACTIVE" },
    }),
    prisma.user.update({ where: { id: payload.user.id }, data: { emailVerified: true } }),
  ]);
  return { cookie: cookie.split(";")[0]!, person, userId: payload.user.id };
}

async function json(path: string, options: { body?: unknown; cookie?: string; key?: string; method?: string } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: protectedHeaders({
      ...(options.body === undefined ? {} : { "content-type": "application/json", origin: baseUrl! }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.key ? { "idempotency-key": options.key } : {}),
    }),
    redirect: "manual",
  });
  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  return { body, response };
}

test("Gate 4C production HTML, RSC, redirect, and Customer Mobile outbound contracts", {
  concurrency: false,
  skip: baseUrl ? false : "COMMUNICATION_HTTP_BASE_URL or COMMERCE_HTTP_BASE_URL is required",
}, async (t) => {
  const [admin, customer] = await Promise.all([signUp("admin"), signUp("customer")]);
  const access = await prisma.adminAccess.create({
    data: {
      userId: admin.userId,
      permissions: ["NOTIFICATIONS_VIEW", "NOTIFICATIONS_SEND", "COMMUNICATIONS_DISPATCH"],
    },
  });
  const campaign = await prisma.communicationCampaign.create({
    data: {
      createdByAdminUserId: admin.userId,
      updatedByAdminUserId: admin.userId,
      audience: "USER",
      targetPersonId: customer.person.id,
      channels: ["IN_APP"],
      category: "ADMIN_ANNOUNCEMENT",
      destinationKind: "NOTIFICATIONS",
      localizedContent: {
        AR: { inApp: { title: "اختبار", body: "محتوى" } },
        EN: { inApp: { title: "Test", body: "Content" } },
        CKB: { inApp: { title: "تاقیکردنەوە", body: "ناوەڕۆک" } },
      },
    },
  });
  const deliveryRecipients = Array.from({ length: 21 }, (_, index) => ({
    personId: randomUUID(),
    userId: randomUUID(),
    index,
  }));
  await prisma.user.createMany({
    data: deliveryRecipients.map((item) => ({
      id: item.userId,
      name: `Stage 4C delivery ${item.index}`,
      email: `${marker}-delivery-${item.index}@rezno.invalid`,
      emailVerified: true,
    })),
  });
  await prisma.person.createMany({
    data: deliveryRecipients.map((item) => ({
      id: item.personId,
      authUserId: item.userId,
      firstName: "Stage 4C delivery",
      isOnboarded: true,
      status: "ACTIVE",
    })),
  });
  await prisma.communicationCampaign.createMany({
    data: Array.from({ length: 20 }, () => ({
      createdByAdminUserId: admin.userId,
      updatedByAdminUserId: admin.userId,
      audience: "USER" as const,
      targetPersonId: customer.person.id,
      channels: ["IN_APP" as const],
      category: "ADMIN_ANNOUNCEMENT" as const,
      destinationKind: "NOTIFICATIONS" as const,
      localizedContent: {
        AR: { inApp: { title: "اختبار", body: "محتوى" } },
        EN: { inApp: { title: "Test", body: "Content" } },
        CKB: { inApp: { title: "تاقیکردنەوە", body: "ناوەڕۆک" } },
      },
    })),
  });
  const deliveryRows = deliveryRecipients.map((item) => ({
    campaignId: campaign.id,
    personId: item.personId,
    channel: "EMAIL" as const,
    locale: "EN",
    endpointType: "EMAIL",
    status: "PENDING" as const,
  }));
  await prisma.outboundDelivery.createMany({ data: deliveryRows });
  const selectedDelivery = await prisma.outboundDelivery.findFirstOrThrow({
    where: { campaignId: campaign.id }, orderBy: { id: "asc" },
  });

  t.after(async () => {
    await prisma.outboundDelivery.deleteMany({ where: { campaign: { createdByAdminUserId: admin.userId } } });
    await prisma.communicationCampaign.deleteMany({ where: { createdByAdminUserId: admin.userId } });
    await prisma.person.deleteMany({ where: { id: { in: deliveryRecipients.map((item) => item.personId) } } });
    await prisma.user.deleteMany({ where: { id: { in: deliveryRecipients.map((item) => item.userId) } } });
    await prisma.person.deleteMany({ where: { id: { in: [admin.person.id, customer.person.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.userId, customer.userId] } } });
    await prisma.$disconnect();
  });

  await t.test("Admin campaign pages render HTML/RSC and legacy route redirects", async () => {
    for (const rsc of [false, true]) {
      const response = await fetch(`${baseUrl}/admin/communications`, {
        headers: protectedHeaders({ cookie: admin.cookie, ...(rsc ? { accept: "text/x-component", rsc: "1" } : {}) }),
        redirect: "manual",
      });
      const text = await response.text();
      assert.equal(response.status, 200);
      assert.match(text, new RegExp(campaign.id));
      assert.doesNotMatch(text, /@rezno\.invalid|postgresql:\/\/|DATABASE_URL|PrismaClient/);
    }
    const filtered = await fetch(`${baseUrl}/admin/communications?status=DRAFT`, {
      headers: protectedHeaders({ cookie: admin.cookie }),
      redirect: "manual",
    });
    const filteredText = await filtered.text();
    assert.equal(filtered.status, 200);
    assert.match(filteredText, /cursor=/);
    assert.match(filteredText, /status=DRAFT/);

    const detail = await fetch(`${baseUrl}/admin/communications/${campaign.id}?deliveryStatus=PENDING&deliveryId=${selectedDelivery.id}`, {
      headers: protectedHeaders({ cookie: admin.cookie }),
      redirect: "manual",
    });
    assert.equal(detail.status, 200);
    const detailText = await detail.text();
    assert.match(detailText, /Campaign detail/);
    assert.match(detailText, /deliveryCursor=/);
    assert.match(detailText, /deliveryStatus=PENDING/);
    assert.match(detailText, new RegExp(`deliveryId=${selectedDelivery.id}`));

    const malformed = await fetch(`${baseUrl}/admin/communications?status=DRAFT&cursor=malformed`, {
      headers: protectedHeaders({ cookie: admin.cookie }),
      redirect: "manual",
    });
    const malformedText = await malformed.text();
    assert.ok([200, 400, 500].includes(malformed.status));
    assert.match(malformedText, /Communications reporting is temporarily unavailable/);
    assert.doesNotMatch(malformedText, /PrismaClient|postgresql:\/\/|DATABASE_URL|node_modules|at getCampaignPage/);
    const legacy = await fetch(`${baseUrl}/admin/notifications`, {
      headers: protectedHeaders({ cookie: admin.cookie }),
      redirect: "manual",
    });
    const legacyText = await legacy.text();
    if ([303, 307, 308].includes(legacy.status)) {
      assert.equal(new URL(legacy.headers.get("location")!, baseUrl).pathname, "/admin/communications");
    } else {
      assert.equal(legacy.status, 200);
      assert.match(legacyText, /NEXT_REDIRECT|admin\/communications/);
    }
  });

  await t.test("Mobile outbound preference API is strict, idempotent, and contact-free", async () => {
    const unauthenticated = await json("/api/mobile/notifications/outbound-preferences");
    assert.equal(unauthenticated.response.status, 401);
    const read = await json("/api/mobile/notifications/outbound-preferences", { cookie: customer.cookie });
    assert.equal(read.response.status, 200);
    const preferences = read.body.data as { version: number; endpoints: { EMAIL: { eligible: boolean } } };
    assert.equal(preferences.endpoints.EMAIL.eligible, true);
    assert.doesNotMatch(JSON.stringify(read.body), /@rezno\.invalid|fingerprint/i);
    const key = randomUUID();
    const input = {
      expectedVersion: preferences.version,
      categories: { EMAIL: ["ADMIN_ANNOUNCEMENT"], SMS: [], PUSH: [] },
    };
    const updated = await json("/api/mobile/notifications/outbound-preferences", {
      body: input, cookie: customer.cookie, key, method: "PATCH",
    });
    assert.equal(updated.response.status, 200);
    const replay = await json("/api/mobile/notifications/outbound-preferences", {
      body: input, cookie: customer.cookie, key, method: "PATCH",
    });
    assert.deepEqual(replay.body, updated.body);
    const conflict = await json("/api/mobile/notifications/outbound-preferences", {
      body: { ...input, categories: { EMAIL: [], SMS: [], PUSH: [] } }, cookie: customer.cookie, key, method: "PATCH",
    });
    assert.equal(conflict.response.status, 409);
    const unknown = await json("/api/mobile/notifications/outbound-preferences", {
      body: { ...input, providerPayload: { authorization: "forged" } }, cookie: customer.cookie, key: randomUUID(), method: "PATCH",
    });
    assert.equal(unknown.response.status, 400);
    assert.doesNotMatch(JSON.stringify([updated.body, conflict.body, unknown.body]), /Prisma|PostgreSQL|DATABASE_URL|Authorization/i);
  });

  await t.test("revoked Admin loses the page on the next authoritative read", async () => {
    await prisma.adminAccess.update({ where: { id: access.id }, data: { status: "REVOKED" } });
    const response = await fetch(`${baseUrl}/admin/communications`, {
      headers: protectedHeaders({ cookie: admin.cookie }),
      redirect: "manual",
    });
    const text = await response.text();
    assert.ok(response.status === 200 || response.status === 403 || response.status === 404);
    assert.equal(text.includes(campaign.id), false);
    if (response.status === 200) assert.match(text, /NEXT_HTTP_ERROR_FALLBACK;403|forbidden/i);
  });
});
