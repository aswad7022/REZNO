import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { StoragePurpose } from "@prisma/client";

import { generateStorageObjectKey } from "../../../features/storage/domain/policy";
import { prisma } from "../../../lib/db/prisma";

const baseUrl = process.env.MEDIA_HTTP_BASE_URL;
const marker = `gate5b-http-${randomUUID().slice(0, 8)}`;

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
  contentType?: string;
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
      ...(body === undefined ? {} : { "content-type": options.contentType ?? "application/json" }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.key ? { "idempotency-key": options.key } : {}),
    },
    method: options.method ?? "GET",
    redirect: "manual",
  });
  const contentType = response.headers.get("content-type") ?? "";
  const responseBody = contentType.startsWith("application/json")
    ? await response.json() as Record<string, unknown>
    : { html: await response.text() };
  return { body: responseBody, response };
}

test("Gate 5B production handlers expose strict tenant-safe media contracts", {
  concurrency: false,
  skip: baseUrl ? false : "MEDIA_HTTP_BASE_URL is required",
}, async (t) => {
  const customer = await signUp("customer");
  const owner = await signUp("owner");
  const receptionist = await signUp("receptionist");
  const organization = await prisma.organization.create({
    data: { name: marker, slug: marker, vertical: "RESTAURANT" },
  });
  await prisma.organizationSettings.create({ data: { organizationId: organization.id } });
  await prisma.businessProfile.create({ data: { organizationId: organization.id, description: marker } });
  const memberships = await Promise.all([
    membership(owner.person.id, organization.id, "OWNER"),
    membership(receptionist.person.id, organization.id, "RECEPTIONIST"),
  ]);
  const [ownerMembership, receptionistMembership] = memberships;
  const staffRole = await prisma.role.create({
    data: { isSystem: true, name: `${marker}-STAFF`, organizationId: organization.id, systemRole: "STAFF" },
  });
  const businessCookie = `${owner.cookie}; rezno-active-business-id=${organization.id}`;
  const receptionistCookie = `${receptionist.cookie}; rezno-active-business-id=${organization.id}`;

  const category = await prisma.category.create({ data: { name: marker, slug: `${marker}-service` } });
  const service = await prisma.service.create({ data: { categoryId: category.id, name: marker, organizationId: organization.id } });
  const store = await prisma.store.create({ data: { name: marker, organizationId: organization.id, slug: `${marker}-store` } });
  const marketplaceCategory = await prisma.marketplaceCategory.create({
    data: { name: marker, normalizedName: marker, slug: `${marker}-product` },
  });
  const product = await prisma.product.create({
    data: { categoryId: marketplaceCategory.id, name: marker, normalizedSearchText: marker, slug: marker, storeId: store.id },
  });
  const menuCategory = await prisma.menuCategory.create({ data: { businessId: organization.id, name: marker } });
  const menuItem = await prisma.menuItem.create({
    data: { businessId: organization.id, menuCategoryId: menuCategory.id, name: marker, price: "1000" },
  });

  t.after(async () => {
    const personIds = [customer.person.id, owner.person.id, receptionist.person.id];
    await prisma.mediaMutation.deleteMany({ where: { actorPersonId: { in: personIds } } });
    await prisma.mediaBinding.deleteMany({ where: { createdByPersonId: { in: personIds } } });
    await prisma.mediaContainer.deleteMany({ where: { OR: [{ personId: { in: personIds } }, { organizationId: organization.id }] } });
    await prisma.storedAsset.deleteMany({ where: { createdByPersonId: { in: personIds } } });
    await prisma.uploadSession.deleteMany({ where: { actorPersonId: { in: personIds } } });
    await prisma.menuItem.deleteMany({ where: { businessId: organization.id } });
    await prisma.menuCategory.deleteMany({ where: { businessId: organization.id } });
    await prisma.product.deleteMany({ where: { storeId: store.id } });
    await prisma.marketplaceCategory.delete({ where: { id: marketplaceCategory.id } });
    await prisma.store.delete({ where: { id: store.id } });
    await prisma.service.delete({ where: { id: service.id } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.organizationMember.deleteMany({ where: { organizationId: organization.id } });
    await prisma.role.deleteMany({ where: { organizationId: organization.id } });
    await prisma.businessProfile.deleteMany({ where: { organizationId: organization.id } });
    await prisma.organizationSettings.deleteMany({ where: { organizationId: organization.id } });
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [customer.userId, owner.userId, receptionist.userId] } } });
    await prisma.$disconnect();
  });

  await t.test("capability and authentication behavior is truthful and redacted", async () => {
    const capabilities = await request("/api/media/capabilities");
    assert.equal(capabilities.response.status, 200);
    const capabilityData = capabilities.body.data as { directUploadAvailable: boolean; providerConfigured: boolean; type: string };
    assert.deepEqual({
      directUploadAvailable: capabilityData.directUploadAvailable,
      providerConfigured: capabilityData.providerConfigured,
      type: capabilityData.type,
    }, {
      directUploadAvailable: false,
      providerConfigured: false,
      type: "STORAGE_MEDIA_CAPABILITIES",
    });
    assertError(await request("/api/media/capabilities?unexpected=1"), 400, "VALIDATION_ERROR");
    assert.doesNotMatch(JSON.stringify(capabilities.body), /bucket|credential|secret|objectKey|postgresql:\/\//i);
    assert.equal((await request("/api/media/customer/profile")).response.status, 403);
    assert.equal((await request("/api/media/business/profile")).response.status, 403);
    assert.equal((await request("/api/media/business/profile", { cookie: receptionistCookie })).response.status, 403);
    await prisma.organizationMember.update({
      where: { id: receptionistMembership.id },
      data: { roleId: staffRole.id },
    });
    assert.equal((await request("/api/media/business/profile", { cookie: receptionistCookie })).response.status, 403);
    await prisma.organizationMember.update({
      where: { id: receptionistMembership.id },
      data: { roleId: receptionistMembership.roleId },
    });
  });

  await t.test("strict JSON, raw URL, malformed UUID, duplicate query, and stale requests are stable errors", async () => {
    const asset = await createAsset(customer.person.id, null, "CUSTOMER_AVATAR");
    const rawUrl = await request("/api/media/customer/profile", {
      body: { assetId: asset.id, expectedVersion: 0, slot: "CUSTOMER_AVATAR", url: "https://attacker.invalid/a.png" },
      cookie: customer.cookie,
      key: randomUUID(),
      method: "POST",
    });
    assertError(rawUrl, 400, "VALIDATION_ERROR");
    assertError(await request("/api/media/customer/profile", {
      body: "not-json", cookie: customer.cookie, key: randomUUID(), method: "POST",
    }), 400, "VALIDATION_ERROR");
    assertError(await request("/api/media/customer/profile", {
      body: { assetId: asset.id, expectedVersion: 0, slot: "CUSTOMER_AVATAR" },
      contentType: "text/plain", cookie: customer.cookie, key: randomUUID(), method: "POST",
    }), 400, "VALIDATION_ERROR");
    assertError(await request("/api/media/customer/profile?slot=a&slot=b", { cookie: customer.cookie }), 400, "VALIDATION_ERROR");
    assertError(await request("/api/media/business/services/not-a-uuid", { cookie: businessCookie }), 400, "VALIDATION_ERROR");

    const attached = await request("/api/media/customer/profile", {
      body: { assetId: asset.id, expectedVersion: 0, slot: "CUSTOMER_AVATAR" },
      cookie: customer.cookie, key: randomUUID(), method: "POST",
    });
    assert.equal(attached.response.status, 200);
    const replacement = await createAsset(customer.person.id, null, "CUSTOMER_AVATAR");
    assertError(await request("/api/media/customer/profile", {
      body: { assetId: replacement.id, expectedVersion: 0, slot: "CUSTOMER_AVATAR" },
      cookie: customer.cookie, key: randomUUID(), method: "PUT",
    }), 409, "STALE_VERSION");
    const serialized = JSON.stringify(attached.body);
    assert.match(serialized, new RegExp(`/api/media/customer/assets/${asset.id}`));
    assert.doesNotMatch(serialized, /objectKey|checksumSha256|providerObjectVersion|signature=|postgresql:\/\//i);
  });

  await t.test("Customer private and public delivery routes enforce visibility and provider truth", async () => {
    const current = await request("/api/media/customer/profile", { cookie: customer.cookie });
    assert.equal(current.response.status, 200);
    const container = current.body.data as { bindings: Array<{ media: { assetId: string } }>; version: number };
    const assetId = container.bindings[0]!.media.assetId;
    assertError(await request(`/media/${assetId}`), 404, "NOT_FOUND");
    assertError(await request(`/media/${assetId}?redirect=https://attacker.invalid`), 400, "VALIDATION_ERROR");
    assertError(await request(`/api/media/customer/assets/${assetId}`, { cookie: customer.cookie }), 503, "STORAGE_PROVIDER_NOT_CONFIGURED");
    assertError(await request(`/api/media/customer/assets/${assetId}?download=1`, { cookie: customer.cookie }), 400, "VALIDATION_ERROR");
  });

  await t.test("Business profile, Service, Store, Product, and Menu handlers use exact typed targets", async () => {
    const operations = [
      { path: "/api/media/business/profile", purpose: "BUSINESS_LOGO", slot: "BUSINESS_LOGO", version: 0 },
      { path: `/api/media/business/services/${service.id}`, purpose: "SERVICE_IMAGE", slot: "SERVICE_PRIMARY", version: 0 },
      { path: `/api/media/business/stores/${store.id}`, purpose: "STORE_LOGO", slot: "STORE_LOGO", version: 0 },
      { path: `/api/media/business/stores/${store.id}`, purpose: "STORE_COVER", slot: "STORE_COVER", version: 1 },
      { path: `/api/media/business/products/${product.id}`, purpose: "PRODUCT_IMAGE", slot: "PRODUCT_IMAGE", version: 0 },
      { path: `/api/media/business/menu-items/${menuItem.id}`, purpose: "RESTAURANT_MENU_IMAGE", slot: "MENU_ITEM_PRIMARY", version: 0 },
    ] as const;
    let logoAssetId = "";
    let draftStoreAssetId = "";
    for (const operation of operations) {
      const asset = await createAsset(owner.person.id, organization.id, operation.purpose, ownerMembership.id, ownerMembership.roleId);
      const result = await request(operation.path, {
        body: { assetId: asset.id, expectedVersion: operation.version, slot: operation.slot },
        cookie: businessCookie, key: randomUUID(), method: "POST",
      });
      assert.equal(result.response.status, 200, `${operation.path}:${operation.slot}:${JSON.stringify(result.body)}`);
      assert.match(JSON.stringify(result.body), new RegExp(`/media/${asset.id}`));
      assert.doesNotMatch(JSON.stringify(result.body), /objectKey|checksumSha256|signature=|FOREIGN_SENTINEL/i);
      if (operation.slot === "BUSINESS_LOGO") logoAssetId = asset.id;
      if (operation.slot === "STORE_LOGO") draftStoreAssetId = asset.id;
    }
    assertError(await request(`/media/${logoAssetId}`), 503, "STORAGE_PROVIDER_NOT_CONFIGURED");
    assertError(await request(`/api/media/business/assets/${logoAssetId}`, { cookie: businessCookie }), 503, "STORAGE_PROVIDER_NOT_CONFIGURED");
    assert.equal((await request(`/api/media/business/assets/${logoAssetId}`, { cookie: receptionistCookie })).response.status, 403);
    assertError(await request(`/api/media/business/assets/${logoAssetId}`, {
      cookie: `${owner.cookie}; rezno-active-business-id=${randomUUID()}`,
    }), 503, "STORAGE_PROVIDER_NOT_CONFIGURED");
    assertError(await request(`/api/media/business/assets/${logoAssetId}?download=1`, { cookie: businessCookie }), 400, "VALIDATION_ERROR");
    assertError(await request(`/media/${draftStoreAssetId}`), 404, "NOT_FOUND");
    assertError(await request(`/api/media/business/assets/${draftStoreAssetId}`, { cookie: businessCookie }), 503, "STORAGE_PROVIDER_NOT_CONFIGURED");
    assertError(await request(`/api/media/business/services/${randomUUID()}`, { cookie: businessCookie }), 404, "NOT_FOUND");
    const profile = await request("/api/media/business/profile", { cookie: businessCookie });
    assert.equal(profile.response.status, 200);
    assert.doesNotMatch(JSON.stringify(profile.body), /objectKey|checksumSha256|provider|signature=/i);
  });

  await t.test("public Business RSC renders canonical stable paths without signed data", async () => {
    const page = await request(`/${organization.slug}`);
    assert.equal(page.response.status, 200);
    const html = String(page.body.html ?? "");
    assert.match(html, /\/media\/[0-9a-f-]{36}/u);
    assert.doesNotMatch(html, /signature=|objectKey|checksumSha256|postgresql:\/\//i);
  });

  assert.ok(receptionistMembership.id);
  assert.ok(staffRole.id);
});

async function membership(personId: string, organizationId: string, systemRole: "OWNER" | "RECEPTIONIST" | "STAFF") {
  const role = await prisma.role.create({
    data: { isSystem: true, name: `${marker}-${systemRole}`, organizationId, systemRole },
  });
  const membership = await prisma.organizationMember.create({ data: { organizationId, personId, roleId: role.id } });
  return { ...membership, roleId: role.id };
}

async function createAsset(
  personId: string,
  organizationId: string | null,
  purpose: StoragePurpose,
  membershipId: string | null = null,
  roleId: string | null = null,
) {
  const objectKey = generateStorageObjectKey(purpose, { environment: "test" });
  const visibility = organizationId ? "PUBLIC" : "PRIVATE";
  const session = await prisma.uploadSession.create({
    data: {
      actorMembershipId: membershipId,
      actorPersonId: personId,
      actorRoleId: roleId,
      expectedMimeType: "image/webp",
      expectedSizeBytes: 256,
      expiresAt: new Date(Date.now() + 60_000),
      finalizedAt: new Date(),
      objectKey,
      organizationId,
      ownerPersonId: organizationId ? null : personId,
      provider: "NOT_CONFIGURED",
      purpose,
      state: "FINALIZED",
      visibility,
    },
  });
  return prisma.storedAsset.create({
    data: {
      checksumSha256: "a".repeat(64),
      createdByPersonId: personId,
      inspectionMetadata: { height: 480, width: 640 },
      inspectionOutcome: "VALID",
      mimeType: "image/webp",
      objectKey,
      organizationId,
      ownerPersonId: organizationId ? null : personId,
      provider: "NOT_CONFIGURED",
      purpose,
      readyAt: new Date(),
      scannerOutcome: "SCANNER_NOT_CONFIGURED",
      sizeBytes: 256,
      state: "READY",
      uploadSessionId: session.id,
      visibility,
    },
  });
}

function assertError(result: { body: Record<string, unknown>; response: Response }, status: number, code: string) {
  assert.equal(result.response.status, status, JSON.stringify(result.body));
  assert.equal((result.body.error as { code: string }).code, code);
}
