import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { resolveMobileManagedMediaPaths } from "../../../apps/mobile/src/config/media-url";

import { operationalMenuItemSchema } from "../../../features/business-operations/domain/daily-operations";
import { operationalServiceSchema } from "../../../features/business-operations/domain/services-workforce";
import { createBusinessProfileSchema } from "../../../features/business/schemas/business-profile";
import { CommerceDomainError } from "../../../features/commerce/domain/errors";
import { createStoreSchema } from "../../../features/commerce/domain/store-input";
import {
  addMerchantProductMedia,
  removeMerchantProductMedia,
  reorderMerchantProductMedia,
  updateMerchantProductMedia,
} from "../../../features/commerce/services/merchant-product-service";
import {
  assertNoMediaQuery,
  mediaIdempotencyKey,
  parseAttachMedia,
} from "../../../features/media/api/validation";
import { MediaDomainError } from "../../../features/media/domain/errors";
import { storageMediaCapabilities } from "../../../features/media/services/capabilities";
import { createProfileSchema } from "../../../features/profile/schemas/profile";
import {
  MEDIA_GATE5B_CONFIRMATION,
  assertMediaGate5bStaging,
} from "../../../scripts/staging/media-gate5b-safety";
import { COMMUNICATIONS_PAYMENT_GATE6C_CONFIRMATION } from "../../../scripts/staging/communications-payment-gate6c-safety";
import { STORAGE_MEDIA_GATE6B_CONFIRMATION } from "../../../scripts/staging/storage-media-gate6b-safety";

const translate = (key: string) => key;

test("storage capability truth is safe and fails closed without a provider", () => {
  const capabilities = storageMediaCapabilities();
  assert.equal(capabilities.type, "STORAGE_MEDIA_CAPABILITIES");
  assert.equal(capabilities.providerConfigured, false);
  assert.equal(capabilities.directUploadAvailable, false);
  assert.deepEqual(capabilities.supportedMimeTypes.sort(), ["image/jpeg", "image/png", "image/webp"]);
  assert.equal(capabilities.supportedMediaSlots.includes("CUSTOMER_AVATAR"), true);
  assert.equal(capabilities.maximumSizeByPurpose.CUSTOMER_AVATAR > 0, true);
  assert.doesNotMatch(JSON.stringify(capabilities), /bucket|credential|token|secret|providerName|objectKey/i);
});

test("media API accepts only exact JSON, UUID idempotency, and no query parameters", async () => {
  const target = { kind: "CUSTOMER_PROFILE" } as const;
  const key = randomUUID();
  const valid = new Request("https://rezno.invalid/api/media/customer/profile", {
    body: JSON.stringify({ assetId: randomUUID(), expectedVersion: 0, slot: "CUSTOMER_AVATAR" }),
    headers: { "content-type": "application/json", "idempotency-key": key },
    method: "POST",
  });
  assert.equal((await parseAttachMedia(valid, target)).idempotencyKey, key);
  const rawUrl = new Request("https://rezno.invalid/api/media/customer/profile", {
    body: JSON.stringify({ assetId: randomUUID(), expectedVersion: 0, slot: "CUSTOMER_AVATAR", url: "https://attacker.invalid/a.png" }),
    headers: { "content-type": "application/json", "idempotency-key": randomUUID() },
    method: "POST",
  });
  await assert.rejects(parseAttachMedia(rawUrl, target), mediaCode("VALIDATION_ERROR"));
  assert.throws(() => mediaIdempotencyKey(new Request("https://rezno.invalid", { headers: { "idempotency-key": "not-a-uuid" } })), mediaCode("VALIDATION_ERROR"));
  assert.throws(() => assertNoMediaQuery(new Request("https://rezno.invalid/api/media?slot=a&slot=b")), mediaCode("VALIDATION_ERROR"));
});

test("all production domain inputs reject raw media URL fields", async () => {
  const profile = createProfileSchema(translate as never).safeParse({
    avatarUrl: "https://attacker.invalid/avatar.png",
    displayName: "Customer",
    firstName: "Customer",
    lastName: "",
    phone: "",
  });
  assert.equal(profile.success, false);

  const business = createBusinessProfileSchema(translate as never).safeParse({
    bookingPolicy: null,
    businessCategory: null,
    businessEmail: null,
    businessPhone: null,
    businessType: "PHYSICAL",
    description: null,
    facebookUrl: null,
    faqItems: "",
    googleMapsUrl: null,
    instagramUrl: null,
    legalName: null,
    logoUrl: "https://attacker.invalid/logo.png",
    name: "Business",
    seoDescription: null,
    seoTitle: null,
    slug: "business-media",
    tiktokUrl: null,
    visibility: "PUBLISHED",
    website: null,
    whatsappPhone: null,
    youtubeUrl: null,
  });
  assert.equal(business.success, false);

  assert.equal(operationalServiceSchema.safeParse({
    categoryId: randomUUID(),
    description: null,
    imageUrl: "https://attacker.invalid/service.png",
    name: "Service",
    staffSelectionMode: "OPTIONAL",
  }).success, false);

  assert.equal(operationalMenuItemSchema.safeParse({
    currency: "IQD",
    description: null,
    imageUrl: "https://attacker.invalid/menu.png",
    menuCategoryId: randomUUID(),
    name: "Menu item",
    preparationMinutes: null,
    price: "1000",
    sortOrder: 0,
  }).success, false);

  const store = createStoreSchema.safeParse({
    contextOrganizationId: randomUUID(),
    coverImageUrl: "https://attacker.invalid/cover.png",
    deliveryEnabled: false,
    idempotencyKey: randomUUID(),
    logoUrl: "https://attacker.invalid/logo.png",
    name: "Store",
    pickupEnabled: true,
    slug: "managed-store",
  });
  assert.equal(store.success, false);

  await assert.rejects(addMerchantProductMedia({} as never, { url: "https://attacker.invalid/product.png" }),
    (error: unknown) => error instanceof CommerceDomainError && error.code === "VALIDATION_ERROR");
  for (const operation of [updateMerchantProductMedia, reorderMerchantProductMedia, removeMerchantProductMedia]) {
    await assert.rejects(operation({} as never, {}),
      (error: unknown) => error instanceof CommerceDomainError && error.code === "VALIDATION_ERROR");
  }
});

test("Customer Mobile resolves only trusted managed media paths against its API origin", () => {
  const value = resolveMobileManagedMediaPaths({
    canonical: "/media/5b000000-0000-4000-8000-000000000001",
    privateAvatar: "/api/media/customer/assets/5b000000-0000-4000-8000-000000000002",
    navigation: "/bookings/current",
    legacy: "https://cdn.example.com/legacy.png",
  }, "https://rezno.example/app");
  assert.deepEqual(value, {
    canonical: "https://rezno.example/media/5b000000-0000-4000-8000-000000000001",
    privateAvatar: "https://rezno.example/api/media/customer/assets/5b000000-0000-4000-8000-000000000002",
    navigation: "/bookings/current",
    legacy: "https://cdn.example.com/legacy.png",
  });
});

test("Gate 5B staging fixture fails closed outside exact staging and accepts only exact successor states", async () => {
  const exactEnvironment = {
    NODE_ENV: "test",
    REZNO_ENV: "staging",
    REZNO_MEDIA_GATE5B_CONFIRM: MEDIA_GATE5B_CONFIRMATION,
  } as NodeJS.ProcessEnv;
  const client = (database: string, applied = BigInt(42), total = BigInt(42)) => {
    const rows = [
      [{ database }],
      [{ applied, failed: BigInt(0), total }],
    ];
    return { $queryRaw: async () => rows.shift() } as never;
  };
  await assert.rejects(assertMediaGate5bStaging(client("rezno_staging"), {
    ...exactEnvironment,
    REZNO_MEDIA_GATE5B_CONFIRM: "wrong",
  }), /exact staging environment/u);
  await assert.rejects(assertMediaGate5bStaging(client("rezno_production"), exactEnvironment), /exact rezno_staging/u);
  await assert.rejects(assertMediaGate5bStaging(client("rezno_staging", BigInt(41), BigInt(41)), exactEnvironment), /42\/42/u);
  await assert.rejects(
    assertMediaGate5bStaging(client("rezno_staging", BigInt(47), BigInt(47)), exactEnvironment),
    /42\/42/u,
  );
  assert.deepEqual(await assertMediaGate5bStaging(client("rezno_staging"), exactEnvironment), {
    database: "rezno_staging",
    migrations: "42/42",
  });
  assert.deepEqual(
    await assertMediaGate5bStaging(
      client("rezno_staging", BigInt(47), BigInt(47)),
      {
        ...exactEnvironment,
        REZNO_STAGE6_GATE6B_CONFIRM: STORAGE_MEDIA_GATE6B_CONFIRMATION,
      },
    ),
    {
      database: "rezno_staging",
      migrations: "47/47",
    },
  );
  await assert.rejects(
    assertMediaGate5bStaging(
      client("rezno_staging", BigInt(48), BigInt(48)),
      {
        ...exactEnvironment,
        REZNO_STAGE6_GATE6C_CONFIRM: "wrong",
        REZNO_STAGE6_GATE6C_SUCCESSOR: "true",
      },
    ),
    /42\/42/u,
  );
  assert.deepEqual(
    await assertMediaGate5bStaging(
      client("rezno_staging", BigInt(48), BigInt(48)),
      {
        ...exactEnvironment,
        REZNO_STAGE6_GATE6C_CONFIRM:
          COMMUNICATIONS_PAYMENT_GATE6C_CONFIRMATION,
        REZNO_STAGE6_GATE6C_SUCCESSOR: "true",
      },
    ),
    {
      database: "rezno_staging",
      migrations: "48/48",
    },
  );
});

function mediaCode(code: string) {
  return (error: unknown) => error instanceof MediaDomainError && error.code === code;
}
