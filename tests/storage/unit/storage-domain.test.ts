import assert from "node:assert/strict";
import test from "node:test";

import { adminPermissionDependencies } from "../../../features/admin/config/permissions";
import { StorageDomainError } from "../../../features/storage/domain/errors";
import {
  canTransitionStoredAsset,
  canTransitionUploadSession,
  isDeliverableAssetState,
} from "../../../features/storage/domain/lifecycle";
import {
  generateStorageObjectKey,
  isServerGeneratedStorageKey,
  normalizeChecksum,
  sanitizeStorageDisplayName,
  storageRequestHash,
} from "../../../features/storage/domain/policy";
import {
  ACTIVE_SESSION_RESERVATION_STATES,
  PROVIDER_RESIDENT_ASSET_STATES,
  isActiveSessionReservationState,
  isProviderResidentAssetState,
  purposeQuotaPermits,
  purposeQuotaUsage,
  sessionReservesPurposeSlot,
} from "../../../features/storage/domain/quota";
import {
  STORAGE_MIME_TYPES,
  STORAGE_PURPOSE_REGISTRY,
  canManageOrganizationStorage,
  isStorageMimeType,
} from "../../../features/storage/domain/purpose-registry";

const uuidA = "10000000-0000-4000-8000-000000000001";
const uuidB = "10000000-0000-4000-8000-000000000002";

test("Gate 5A purpose registry is closed and hands product integration to Gate 5B", () => {
  assert.equal(Object.keys(STORAGE_PURPOSE_REGISTRY).length, 10);
  for (const [purpose, policy] of Object.entries(STORAGE_PURPOSE_REGISTRY)) {
    assert.deepEqual(policy.allowedMimeTypes, STORAGE_MIME_TYPES);
    assert.equal(policy.inspectionRequired, true);
    assert.ok(policy.maxBytes >= 1024 * 1024);
    assert.ok(policy.maxActiveAssets >= 1);
    assert.equal(policy.laterOwner, purpose === "INTERNAL_STORAGE_TEST" ? "GATE_5A" : "GATE_5B");
  }
  assert.equal(STORAGE_PURPOSE_REGISTRY.CUSTOMER_AVATAR.ownerFamily, "PERSON");
  assert.equal(STORAGE_PURPOSE_REGISTRY.CUSTOMER_AVATAR.visibility, "PRIVATE");
  assert.equal(STORAGE_PURPOSE_REGISTRY.PRODUCT_IMAGE.ownerFamily, "ORGANIZATION");
  assert.equal(STORAGE_PURPOSE_REGISTRY.PRODUCT_IMAGE.visibility, "PUBLIC");
  assert.equal(STORAGE_PURPOSE_REGISTRY.INTERNAL_STORAGE_TEST.visibility, "INTERNAL");
});

test("only Owner and Manager can manage Organization storage", () => {
  assert.equal(canManageOrganizationStorage("OWNER"), true);
  assert.equal(canManageOrganizationStorage("MANAGER"), true);
  assert.equal(canManageOrganizationStorage("RECEPTIONIST"), false);
  assert.equal(canManageOrganizationStorage("STAFF"), false);
  assert.equal(canManageOrganizationStorage(null), false);
});

test("initial MIME policy accepts only static raster declarations", () => {
  for (const mime of ["image/jpeg", "image/png", "image/webp"]) assert.equal(isStorageMimeType(mime), true);
  for (const mime of ["image/svg+xml", "image/gif", "application/pdf", "video/mp4", "text/html"]) {
    assert.equal(isStorageMimeType(mime), false);
  }
});

test("display names are bounded labels and never paths", () => {
  assert.equal(sanitizeStorageDisplayName(" ../private\\avatar.png "), "..-private-avatar.png");
  assert.equal(sanitizeStorageDisplayName("safe\u0000  name.jpg"), "safe name.jpg");
  assert.throws(() => sanitizeStorageDisplayName(".."), StorageDomainError);
  assert.throws(() => sanitizeStorageDisplayName("a".repeat(181)), StorageDomainError);
});

test("object keys are opaque, server-generated, and path-traversal resistant", () => {
  const values = [uuidA, uuidB];
  const key = generateStorageObjectKey("PRODUCT_IMAGE", {
    environment: "staging",
    random: () => values.shift()!,
  });
  assert.equal(key, `staging/product-image/${uuidA}/${uuidB}`);
  assert.equal(isServerGeneratedStorageKey(key), true);
  assert.equal(key.includes("@"), false);
  assert.equal(isServerGeneratedStorageKey("staging/product-image/../../secret"), false);
  assert.equal(isServerGeneratedStorageKey("staging\\product-image\\secret"), false);
});

test("checksum policy accepts lowercase SHA-256 only", () => {
  const digest = "a".repeat(64);
  assert.equal(normalizeChecksum(digest), digest);
  assert.equal(normalizeChecksum(null), null);
  assert.throws(() => normalizeChecksum("A".repeat(64)), StorageDomainError);
  assert.throws(() => normalizeChecksum("a".repeat(63)), StorageDomainError);
});

test("canonical request hashes are order-independent and input-sensitive", () => {
  const one = storageRequestHash({ expectedSize: 10, purpose: "PRODUCT_IMAGE" });
  const reordered = storageRequestHash({ purpose: "PRODUCT_IMAGE", expectedSize: 10 });
  const changed = storageRequestHash({ purpose: "PRODUCT_IMAGE", expectedSize: 11 });
  assert.equal(one, reordered);
  assert.notEqual(one, changed);
  assert.match(one, /^[a-f0-9]{64}$/);
});

test("upload-session lifecycle has terminal non-reusable states", () => {
  assert.equal(canTransitionUploadSession("CREATED", "TARGET_ISSUED"), true);
  assert.equal(canTransitionUploadSession("TARGET_ISSUED", "FINALIZED"), true);
  for (const terminal of ["FINALIZED", "ABORTED", "EXPIRED", "FAILED"] as const) {
    assert.equal(canTransitionUploadSession(terminal, "TARGET_ISSUED"), false);
  }
});

test("asset lifecycle delivers READY only and makes deletion immediate", () => {
  assert.equal(canTransitionStoredAsset("PENDING_INSPECTION", "READY"), true);
  assert.equal(canTransitionStoredAsset("READY", "DELETE_PENDING"), true);
  assert.equal(canTransitionStoredAsset("DELETE_PENDING", "DELETED"), true);
  assert.equal(canTransitionStoredAsset("DELETED", "READY"), false);
  for (const state of ["PENDING_UPLOAD", "UPLOADED", "PENDING_INSPECTION", "QUARANTINED", "REJECTED", "DELETE_PENDING", "DELETED"] as const) {
    assert.equal(isDeliverableAssetState(state), false);
  }
  assert.equal(isDeliverableAssetState("READY"), true);
});

test("storage Admin manage permission depends on view permission", () => {
  assert.deepEqual(adminPermissionDependencies.STORAGE_RECORDS_MANAGE, ["STORAGE_RECORDS_VIEW"]);
});

test("provider-resident asset states retain quota until confirmed deletion", () => {
  assert.deepEqual(PROVIDER_RESIDENT_ASSET_STATES, [
    "PENDING_UPLOAD",
    "UPLOADED",
    "PENDING_INSPECTION",
    "READY",
    "QUARANTINED",
    "REJECTED",
    "DELETE_PENDING",
  ]);
  for (const state of PROVIDER_RESIDENT_ASSET_STATES) {
    assert.equal(isProviderResidentAssetState(state), true);
  }
  assert.equal(isProviderResidentAssetState("REJECTED"), true);
  assert.equal(isProviderResidentAssetState("QUARANTINED"), true);
  assert.equal(isProviderResidentAssetState("DELETE_PENDING"), true);
  assert.equal(isProviderResidentAssetState("DELETED"), false);
});

test("only live pre-finalization session states reserve a purpose slot", () => {
  assert.deepEqual(ACTIVE_SESSION_RESERVATION_STATES, ["CREATED", "TARGET_ISSUED", "UPLOADED"]);
  for (const state of ACTIVE_SESSION_RESERVATION_STATES) {
    assert.equal(isActiveSessionReservationState(state), true);
  }
  for (const state of ["FINALIZED", "ABORTED", "EXPIRED", "FAILED"] as const) {
    assert.equal(isActiveSessionReservationState(state), false);
  }
  const now = new Date("2026-07-19T12:00:00.000Z");
  assert.equal(sessionReservesPurposeSlot("CREATED", new Date("2026-07-19T12:00:00.001Z"), now), true);
  assert.equal(sessionReservesPurposeSlot("CREATED", now, now), false);
  assert.equal(sessionReservesPurposeSlot("ABORTED", new Date("2026-07-19T12:00:00.001Z"), now), false);
  assert.equal(sessionReservesPurposeSlot("FINALIZED", new Date("2026-07-19T12:00:00.001Z"), now), false);
});

test("persistent purpose quota formula permits N-1, rejects the limit, and fails closed above it", () => {
  assert.equal(purposeQuotaUsage(3, 1), 4);
  assert.equal(purposeQuotaPermits({ additionalReservations: 1, limit: 5, reserved: 1, stored: 3 }), true);
  assert.equal(purposeQuotaPermits({ additionalReservations: 1, limit: 5, reserved: 1, stored: 4 }), false);
  assert.equal(purposeQuotaPermits({ limit: 5, reserved: 1, stored: 4 }), true);
  assert.equal(purposeQuotaPermits({ limit: 5, reserved: 2, stored: 4 }), false);
  assert.throws(() => purposeQuotaUsage(-1, 0), /non-negative safe integers/);
});
