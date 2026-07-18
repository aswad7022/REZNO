import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "../../../lib/db/prisma";

const baseUrl = process.env.COMMUNICATION_HTTP_BASE_URL ?? process.env.COMMERCE_HTTP_BASE_URL;
const marker = `stage4c-http-${randomUUID().slice(0, 8)}`;

async function signUp(label: string) {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl! },
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
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json", origin: baseUrl! }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.key ? { "idempotency-key": options.key } : {}),
    },
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

  t.after(async () => {
    await prisma.communicationCampaign.deleteMany({ where: { id: campaign.id } });
    await prisma.person.deleteMany({ where: { id: { in: [admin.person.id, customer.person.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.userId, customer.userId] } } });
    await prisma.$disconnect();
  });

  await t.test("Admin campaign pages render HTML/RSC and legacy route redirects", async () => {
    for (const rsc of [false, true]) {
      const response = await fetch(`${baseUrl}/admin/communications`, {
        headers: { cookie: admin.cookie, ...(rsc ? { accept: "text/x-component", rsc: "1" } : {}) },
        redirect: "manual",
      });
      const text = await response.text();
      assert.equal(response.status, 200);
      assert.match(text, new RegExp(campaign.id));
      assert.doesNotMatch(text, /@rezno\.invalid|postgresql:\/\/|DATABASE_URL|PrismaClient/);
    }
    const detail = await fetch(`${baseUrl}/admin/communications/${campaign.id}`, {
      headers: { cookie: admin.cookie },
      redirect: "manual",
    });
    assert.equal(detail.status, 200);
    assert.match(await detail.text(), /Campaign detail/);
    const legacy = await fetch(`${baseUrl}/admin/notifications`, {
      headers: { cookie: admin.cookie },
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
      headers: { cookie: admin.cookie },
      redirect: "manual",
    });
    const text = await response.text();
    assert.ok(response.status === 200 || response.status === 403 || response.status === 404);
    assert.equal(text.includes(campaign.id), false);
    if (response.status === 200) assert.match(text, /NEXT_HTTP_ERROR_FALLBACK;403|forbidden/i);
  });
});
