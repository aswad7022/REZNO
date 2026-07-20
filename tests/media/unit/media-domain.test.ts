import assert from "node:assert/strict";
import test from "node:test";
import type { MediaBinding, StoredAsset } from "@prisma/client";

import {
  legacyMediaReference,
  managedMediaReference,
} from "../../../features/media/domain/contracts";
import { MediaDomainError } from "../../../features/media/domain/errors";
import {
  legacyMediaOrNull,
  safeLegacyMediaReference,
} from "../../../features/media/domain/legacy";
import {
  assertSlotKind,
  mediaRequestHash,
  normalizeAltText,
  targetKey,
} from "../../../features/media/domain/policy";
import {
  MEDIA_GATE_EXCLUSIONS,
  MEDIA_SLOT_REGISTRY,
  isMediaSlot,
  mediaSlotPolicy,
} from "../../../features/media/domain/slot-registry";
import { resolvePublicMediaBatchWithClient } from "../../../features/media/services/media-query";

test("Gate 5B slot registry is exhaustive and binds every slot to its exact purpose", () => {
  assert.deepEqual(Object.keys(MEDIA_SLOT_REGISTRY).sort(), [
    "BUSINESS_COVER",
    "BUSINESS_GALLERY",
    "BUSINESS_LOGO",
    "CUSTOMER_AVATAR",
    "MENU_ITEM_PRIMARY",
    "PRODUCT_IMAGE",
    "SERVICE_PRIMARY",
    "STORE_COVER",
    "STORE_LOGO",
  ]);
  assert.equal(mediaSlotPolicy("CUSTOMER_AVATAR").purpose, "CUSTOMER_AVATAR");
  assert.equal(mediaSlotPolicy("CUSTOMER_AVATAR").publicDeliveryAllowed, false);
  assert.equal(mediaSlotPolicy("BUSINESS_GALLERY").maximumActiveItems, 24);
  assert.equal(mediaSlotPolicy("PRODUCT_IMAGE").purpose, "PRODUCT_IMAGE");
  assert.equal(mediaSlotPolicy("PRODUCT_IMAGE").maximumActiveItems, 12);
  assert.equal(mediaSlotPolicy("PRODUCT_IMAGE").productVariantAllowed, true);
  assert.equal(mediaSlotPolicy("MENU_ITEM_PRIMARY").containerKind, "MENU_ITEM");
  assert.equal(isMediaSlot("STORE_LOGO"), true);
  assert.equal(isMediaSlot("MESSAGE_ATTACHMENT"), false);
});

test("Gate 5B exclusions explicitly keep later media work outside the gate", () => {
  assert.deepEqual(MEDIA_GATE_EXCLUSIONS, [
    "PAYMENTS",
    "MESSAGE_ATTACHMENTS",
    "REVIEW_ATTACHMENTS",
    "VIDEO",
    "AUDIO",
    "DOCUMENTS",
    "REMOTE_IMPORT",
    "AUTOMATIC_CLEANUP",
  ]);
});

test("alt text is normalized, stripped of controls, bounded, and nullable", () => {
  assert.equal(normalizeAltText("  \u0000 ＲＥＺＮＯ \n"), "REZNO");
  assert.equal(normalizeAltText(""), null);
  assert.equal(normalizeAltText(null), null);
  assert.throws(() => normalizeAltText(12), mediaCode("VALIDATION_ERROR"));
  assert.throws(() => normalizeAltText("<strong>Logo</strong>"), mediaCode("VALIDATION_ERROR"));
  assert.throws(() => normalizeAltText("x".repeat(301)), mediaCode("VALIDATION_ERROR"));
});

test("request hashes are deterministic across object-key order and sensitive to values", () => {
  assert.equal(mediaRequestHash({ b: 2, a: [1, { d: 4, c: 3 }] }), mediaRequestHash({ a: [1, { c: 3, d: 4 }], b: 2 }));
  assert.notEqual(mediaRequestHash({ a: 1 }), mediaRequestHash({ a: 2 }));
  assert.match(mediaRequestHash({ a: 1 }), /^[a-f0-9]{64}$/u);
});

test("target keys are stable and target-specific", () => {
  assert.equal(targetKey({ kind: "CUSTOMER_PROFILE" }), "customer-profile");
  assert.equal(targetKey({ kind: "BUSINESS_PROFILE" }), "business-profile");
  assert.equal(targetKey({ kind: "SERVICE", serviceId: "service-id" }), "service:service-id");
  assert.equal(targetKey({ kind: "STORE", storeId: "store-id" }), "store:store-id");
  assert.equal(targetKey({ kind: "PRODUCT", productId: "product-id" }), "product:product-id");
  assert.equal(targetKey({ kind: "MENU_ITEM", menuItemId: "menu-id" }), "menu-item:menu-id");
});

test("slot/container mismatches fail with the stable validation code", () => {
  assert.doesNotThrow(() => assertSlotKind("STORE_LOGO", "STORE", "STORE"));
  assert.throws(() => assertSlotKind("STORE_LOGO", "SERVICE", "STORE"), mediaCode("VALIDATION_ERROR"));
});

test("legacy media admits safe local and public HTTPS URLs only", () => {
  assert.equal(safeLegacyMediaReference(" /images/logo.png "), "/images/logo.png");
  assert.equal(safeLegacyMediaReference("https://cdn.example.com/logo.png"), "https://cdn.example.com/logo.png");
  for (const unsafe of [
    "http://cdn.example.com/a.png",
    "https://localhost/a.png",
    "https://127.0.0.1/a.png",
    "https://[::1]/a.png",
    "https://intranet/a.png",
    "https://10.2.3.4/a.png",
    "https://user:pass@example.com/a.png",
    "//example.com/a.png",
    "/\\evil.png",
    "javascript:alert(1)",
    "https://service.internal/a.png",
  ]) assert.equal(safeLegacyMediaReference(unsafe), null, unsafe);
});

test("canonical history suppresses legacy fallback even after detach", () => {
  assert.equal(legacyMediaOrNull("https://cdn.example.com/a.png", false), "https://cdn.example.com/a.png");
  assert.equal(legacyMediaOrNull("https://cdn.example.com/a.png", true), null);
});

test("media references expose stable delivery paths and redact storage internals", () => {
  const asset = {
    id: "11111111-1111-4111-8111-111111111111",
    mimeType: "image/webp",
    inspectionMetadata: { width: 640, height: 480, objectKey: "must-not-leak" },
  } as unknown as StoredAsset;
  const publicBinding = {
    altText: "Logo",
    assetId: asset.id,
    productVariantId: null,
    slot: "BUSINESS_LOGO",
    sortOrder: null,
  } as MediaBinding;
  const privateBinding = { ...publicBinding, slot: "CUSTOMER_AVATAR" } as MediaBinding;
  const publicReference = managedMediaReference(publicBinding, asset);
  const privateReference = managedMediaReference(privateBinding, asset);
  assert.equal(publicReference.stableDeliveryPath, `/media/${asset.id}`);
  assert.equal(privateReference.stableDeliveryPath, `/api/media/customer/assets/${asset.id}`);
  assert.equal(publicReference.width, 640);
  assert.equal(publicReference.height, 480);
  assert.equal("objectKey" in publicReference, false);
  assert.equal("provider" in publicReference, false);
  assert.equal("checksumSha256" in publicReference, false);
  assert.equal(JSON.stringify(publicReference).includes("must-not-leak"), false);
});

test("legacy references use the same typed contract without claiming an asset", () => {
  const reference = legacyMediaReference("PRODUCT_IMAGE", "/legacy/product.png", {
    altText: "Product",
    sortOrder: 2,
    variantId: "variant",
  });
  assert.deepEqual(reference, {
    type: "MEDIA_REFERENCE",
    altText: "Product",
    assetId: null,
    height: null,
    mimeType: null,
    sortOrder: 2,
    source: "LEGACY_URL",
    stableDeliveryPath: "/legacy/product.png",
    slot: "PRODUCT_IMAGE",
    variantId: "variant",
    width: null,
  });
});

test("public media batches load only ACTIVE rows plus bounded history markers", async () => {
  const asset = {
    id: "11111111-1111-4111-8111-111111111111",
    inspectionMetadata: { height: 480, width: 640 },
    mimeType: "image/webp",
    purpose: "BUSINESS_LOGO",
    state: "READY",
  } as unknown as StoredAsset;
  const binding = {
    altText: "Logo",
    asset,
    containerId: "container-1",
    id: "binding-1",
    productVariantId: null,
    slot: "BUSINESS_LOGO",
    sortOrder: null,
    state: "ACTIVE",
  } as unknown as MediaBinding & { asset: StoredAsset };
  const queries: Array<Record<string, unknown>> = [];
  const client = {
    mediaContainer: {
      findMany: async () => [{
        id: "container-1",
        kind: "BUSINESS_PROFILE",
        organizationId: "organization-1",
        personId: null,
        serviceId: null,
        storeId: null,
        productId: null,
        menuItemId: null,
      }],
    },
    mediaBinding: {
      findMany: async (query: Record<string, unknown>) => {
        queries.push(query);
        const where = query.where as { state?: string };
        return where.state === "ACTIVE"
          ? [binding]
          : [{ containerId: "container-1", slot: "BUSINESS_LOGO" }];
      },
    },
  };
  const media = await resolvePublicMediaBatchWithClient(client as never, [{
    id: "organization-1",
    kind: "BUSINESS_PROFILE",
    legacyValues: ["https://legacy.example.com/logo.png"],
    slot: "BUSINESS_LOGO",
  }]);
  assert.equal(media.get("BUSINESS_PROFILE:organization-1:BUSINESS_LOGO")?.[0]?.stableDeliveryPath, `/media/${asset.id}`);
  assert.equal((queries[0]!.where as { state: string }).state, "ACTIVE");
  assert.deepEqual(queries[1]!.distinct, ["containerId", "slot"]);

  const detachedOnlyClient = {
    ...client,
    mediaBinding: {
      findMany: async (query: Record<string, unknown>) => {
        const where = query.where as { state?: string };
        return where.state === "ACTIVE" ? [] : [{ containerId: "container-1", slot: "BUSINESS_LOGO" }];
      },
    },
  };
  const detached = await resolvePublicMediaBatchWithClient(detachedOnlyClient as never, [{
    id: "organization-1",
    kind: "BUSINESS_PROFILE",
    legacyValues: ["https://legacy.example.com/logo.png"],
    slot: "BUSINESS_LOGO",
  }]);
  assert.deepEqual(detached.get("BUSINESS_PROFILE:organization-1:BUSINESS_LOGO"), []);
});

function mediaCode(code: string) {
  return (error: unknown) => error instanceof MediaDomainError && error.code === code;
}
