import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "../../../lib/db/prisma";

const baseUrl = process.env.STORAGE_HTTP_BASE_URL;
const marker = `gate5a-http-${randomUUID().slice(0, 8)}`;

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
    data: { isOnboarded: true, status: "ACTIVE" },
  });
  return { cookie: cookie.split(";", 1)[0]!, person, userId: payload.user.id };
}

async function request(path: string, options: {
  body?: string | Record<string, unknown>;
  cookie?: string;
  key?: string;
  method?: string;
} = {}) {
  const body = typeof options.body === "string"
    ? options.body
    : options.body === undefined ? undefined : JSON.stringify(options.body);
  const response = await fetch(`${baseUrl}${path}`, {
    body,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.key ? { "idempotency-key": options.key } : {}),
    },
    method: options.method ?? "GET",
    redirect: "manual",
  });
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  return { body: await response.json() as Record<string, unknown>, response };
}

test("Gate 5A production storage handlers fail closed without a configured provider", {
  concurrency: false,
  skip: baseUrl ? false : "STORAGE_HTTP_BASE_URL is required",
}, async (t) => {
  const [customer, owner, admin] = await Promise.all([signUp("customer"), signUp("owner"), signUp("admin")]);
  const organization = await prisma.organization.create({ data: { name: marker, slug: marker } });
  const ownerRole = await prisma.role.create({
    data: { isSystem: true, name: `${marker}-owner`, organizationId: organization.id, systemRole: "OWNER" },
  });
  await prisma.organizationMember.create({
    data: { organizationId: organization.id, personId: owner.person.id, roleId: ownerRole.id },
  });
  await prisma.adminAccess.create({
    data: { permissions: ["STORAGE_RECORDS_VIEW", "STORAGE_RECORDS_MANAGE"], userId: admin.userId },
  });
  const businessCookie = `${owner.cookie}; rezno-active-business-id=${organization.id}`;

  t.after(async () => {
    await prisma.organizationMember.deleteMany({ where: { organizationId: organization.id } });
    await prisma.role.deleteMany({ where: { organizationId: organization.id } });
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.person.deleteMany({ where: { id: { in: [customer.person.id, owner.person.id, admin.person.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [customer.userId, owner.userId, admin.userId] } } });
    await prisma.$disconnect();
  });

  await t.test("authentication, strict JSON, unknown fields, arbitrary provider data, and oversized body are rejected", async () => {
    assert.equal((await request("/api/storage/customer/assets")).response.status, 403);
    const validBody = {
      expectedMimeType: "image/png",
      expectedSizeBytes: 64,
      purpose: "CUSTOMER_AVATAR",
    };
    const noProvider = await request("/api/storage/customer/sessions", {
      body: validBody,
      cookie: customer.cookie,
      key: randomUUID(),
      method: "POST",
    });
    assert.equal(noProvider.response.status, 503);
    assert.equal((noProvider.body.error as { code: string }).code, "STORAGE_PROVIDER_NOT_CONFIGURED");
    for (const extra of [
      { provider: "DETERMINISTIC_TEST" },
      { objectKey: "production/customer-avatar/escape" },
      { url: "https://attacker.invalid/file" },
      { organizationId: organization.id },
      { visibility: "PUBLIC" },
    ]) {
      const result = await request("/api/storage/customer/sessions", {
        body: { ...validBody, ...extra }, cookie: customer.cookie, key: randomUUID(), method: "POST",
      });
      assert.equal(result.response.status, 400);
      assert.equal((result.body.error as { code: string }).code, "VALIDATION_ERROR");
    }
    const oversized = await request("/api/storage/customer/sessions", {
      body: JSON.stringify({ ...validBody, displayName: "x".repeat(33 * 1024) }),
      cookie: customer.cookie,
      key: randomUUID(),
      method: "POST",
    });
    assert.equal(oversized.response.status, 400);
    const downloadOverride = await request(`/api/storage/customer/assets/${randomUUID()}/download`, {
      body: { url: "https://attacker.invalid/redirect" },
      cookie: customer.cookie,
      method: "POST",
    });
    assert.equal(downloadOverride.response.status, 400);
  });

  await t.test("Business handler resolves active Owner and rejects unsupported MIME before provider selection", async () => {
    const unsupported = await request("/api/storage/business/sessions", {
      body: { expectedMimeType: "image/svg+xml", expectedSizeBytes: 64, purpose: "BUSINESS_LOGO" },
      cookie: businessCookie,
      key: randomUUID(),
      method: "POST",
    });
    assert.equal(unsupported.response.status, 415);
    assert.equal((unsupported.body.error as { code: string }).code, "UNSUPPORTED_MEDIA_TYPE");
    const noProvider = await request("/api/storage/business/sessions", {
      body: { expectedMimeType: "image/png", expectedSizeBytes: 64, purpose: "BUSINESS_LOGO" },
      cookie: businessCookie,
      key: randomUUID(),
      method: "POST",
    });
    assert.equal(noProvider.response.status, 503);
  });

  await t.test("list cursors reject duplicate parameters and safe output leaks no provider/secret detail", async () => {
    const duplicate = await request("/api/storage/customer/assets?limit=10&limit=20", { cookie: customer.cookie });
    assert.equal(duplicate.response.status, 400);
    const listed = await request("/api/admin/storage/assets?limit=10", { cookie: admin.cookie });
    assert.equal(listed.response.status, 200);
    const serialized = JSON.stringify(listed.body);
    assert.doesNotMatch(serialized, /DATABASE_URL|BETTER_AUTH_SECRET|objectKey|checksumSha256|authorization|bucket|postgresql:\/\//i);
    const missingPublic = await request(`/api/storage/public/assets/${randomUUID()}/download`);
    assert.equal(missingPublic.response.status, 404);
    const missingAdminDelete = await request(`/api/admin/storage/assets/${randomUUID()}`, {
      body: { expectedVersion: 1 },
      cookie: admin.cookie,
      key: randomUUID(),
      method: "DELETE",
    });
    assert.equal(missingAdminDelete.response.status, 404);
    const quota = await request("/api/storage/customer/quota", { cookie: customer.cookie });
    assert.equal(quota.response.status, 200);
    assert.equal(((quota.body.data as { type: string }).type), "STORAGE_QUOTA_STATUS");
  });
});
