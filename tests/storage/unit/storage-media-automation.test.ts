import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { PlatformJobType } from "@prisma/client";
import sharp from "sharp";

import {
  MEDIA_RENDITION_PROFILES,
  generateMediaRenditionObjectKey,
  mediaRenditionProfileForSlot,
  mediaRenditionSourceFingerprint,
} from "../../../features/media/domain/rendition-registry";
import { renderMediaRendition } from "../../../features/media/services/rendition-processor";
import {
  PLATFORM_JOB_DISCOVERY_TYPES,
  PLATFORM_JOB_LIMITS,
} from "../../../features/platform-jobs/domain/contracts";
import { PlatformJobDomainError } from "../../../features/platform-jobs/domain/errors";
import {
  isRetryablePlatformJobError,
  parsePlatformJobPayload,
  parsePlatformJobResult,
} from "../../../features/platform-jobs/domain/registry";
import { createPlatformJobSchedule } from "../../../features/platform-jobs/services/schedules";
import {
  STORAGE_INSPECTION_POLICY_VERSION,
  STORAGE_ORPHAN_RETENTION_MS,
  isServerGeneratedStorageKey,
} from "../../../features/storage/domain/policy";
import { DeterministicStorageProvider } from "../../../features/storage/providers/deterministic";
import {
  configuredStorageProvider,
  setStorageProviderForTests,
} from "../../../features/storage/providers/registry";
import {
  isMediaRenditionSourceEligible,
  isOrphanCleanupEligible,
  isStoredAssetRescanEligible,
} from "../../../features/storage-automation/domain/policy";
import { setStorageAutomationErrorTestHook } from "../../../features/storage-automation/services/handlers";

const assetId = "10000000-0000-4000-8000-000000000001";
const sessionId = "10000000-0000-4000-8000-000000000002";

test.afterEach(() => setStorageProviderForTests(undefined));

test("Gate 6B payload and result schemas are closed, reference-only, and bounded", () => {
  const payloads: Array<[PlatformJobType, Record<string, unknown>]> = [
    ["STORAGE_MAINTENANCE_DISCOVERY", { batchSize: 50 }],
    ["STORAGE_ORPHAN_CLEANUP", { expectedVersion: 1, uploadSessionId: sessionId }],
    ["STORAGE_ASSET_DELETE_RETRY", { assetId, expectedVersion: 1 }],
    ["STORAGE_RESCAN_DISCOVERY", { batchSize: 50 }],
    ["STORAGE_ASSET_RESCAN", { assetId, expectedVersion: 1 }],
    ["MEDIA_RENDITION_DISCOVERY", { batchSize: 50 }],
    ["MEDIA_RENDITION_GENERATE", { assetId, expectedVersion: 1, profile: "CARD_640_WEBP" }],
    ["MEDIA_RENDITION_CLEANUP_DISCOVERY", { batchSize: 50 }],
    ["MEDIA_RENDITION_DELETE", { expectedVersion: 1, renditionId: sessionId }],
  ];
  for (const [jobType, payload] of payloads) {
    assert.deepEqual(parsePlatformJobPayload(jobType, 1, payload), payload);
    assert.throws(
      () => parsePlatformJobPayload(jobType, 1, { ...payload, signedUrl: "https://private.invalid/secret" }),
      domainCode("VALIDATION_ERROR"),
    );
    assert.throws(() => parsePlatformJobPayload(jobType, 2, payload), domainCode("VALIDATION_ERROR"));
  }
  assert.throws(
    () => parsePlatformJobPayload("STORAGE_MAINTENANCE_DISCOVERY", 1, { batchSize: PLATFORM_JOB_LIMITS.maxDomainDiscoveryBatch + 1 }),
    domainCode("VALIDATION_ERROR"),
  );
  assert.throws(
    () => parsePlatformJobPayload("MEDIA_RENDITION_GENERATE", 1, { assetId, expectedVersion: 1, profile: "CLIENT_9999_PNG" }),
    domainCode("VALIDATION_ERROR"),
  );

  assert.deepEqual(parsePlatformJobResult("STORAGE_MAINTENANCE_DISCOVERY", {
    enqueued: 100,
    kind: "STORAGE_MAINTENANCE_DISCOVERED",
    scanned: 150,
    skipped: 100,
  }), { enqueued: 100, kind: "STORAGE_MAINTENANCE_DISCOVERED", scanned: 150, skipped: 100 });
  assert.deepEqual(parsePlatformJobResult("STORAGE_ASSET_RESCAN", {
    kind: "STORAGE_ASSET_RESCANNED", outcome: "COMPLETED", state: "READY",
  }), { kind: "STORAGE_ASSET_RESCANNED", outcome: "COMPLETED", state: "READY" });
  assert.deepEqual(parsePlatformJobResult("MEDIA_RENDITION_GENERATE", {
    height: 320,
    kind: "MEDIA_RENDITION_GENERATED",
    profile: "CARD_640_WEBP",
    sizeBytes: 1_024,
    state: "READY",
    width: 640,
  }), {
    height: 320,
    kind: "MEDIA_RENDITION_GENERATED",
    profile: "CARD_640_WEBP",
    sizeBytes: 1_024,
    state: "READY",
    width: 640,
  });
  assert.throws(
    () => parsePlatformJobResult("STORAGE_ASSET_RESCAN", {
      kind: "STORAGE_ASSET_RESCANNED", outcome: "COMPLETED", providerError: "secret", state: "READY",
    }),
    domainCode("PLATFORM_JOB_FAILURE"),
  );
});

test("the schedule registry preserves Gate 6A and admits only the four Gate 6B discovery mappings disabled by default", async () => {
  assert.deepEqual(PLATFORM_JOB_DISCOVERY_TYPES, [
    "STORAGE_MAINTENANCE_DISCOVERY",
    "STORAGE_RESCAN_DISCOVERY",
    "MEDIA_RENDITION_DISCOVERY",
    "MEDIA_RENDITION_CLEANUP_DISCOVERY",
  ]);
  const created: Array<Record<string, unknown>> = [];
  const transaction = {
    platformJobSchedule: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return data;
      },
      findUnique: async () => null,
    },
  } as never;
  const common = {
    cadenceSeconds: 300,
    catchupLimit: 1,
    createdByAdminUserId: "admin-user",
    createdByPersonId: assetId,
    nextRunAt: new Date("2026-07-22T15:00:00.000Z"),
    payloadVersion: 1,
  } as const;
  await createPlatformJobSchedule(transaction, {
    ...common,
    jobType: "PLATFORM_HEALTH_PROBE",
    payload: { probe: "DURABLE_FOUNDATION", version: 1 },
    scheduleKey: "PLATFORM_HEALTH_PROBE",
  });
  for (const jobType of PLATFORM_JOB_DISCOVERY_TYPES) {
    await createPlatformJobSchedule(transaction, {
      ...common,
      jobType,
      payload: { batchSize: 10 },
      scheduleKey: jobType,
    });
  }
  assert.equal(created.length, 5);
  assert.equal(created.every((row) => row.enabled === false), true);
  await assert.rejects(
    createPlatformJobSchedule(transaction, {
      ...common,
      jobType: "STORAGE_RESCAN_DISCOVERY",
      payload: { batchSize: 10 },
      scheduleKey: "STORAGE_MAINTENANCE_DISCOVERY",
    }),
    domainCode("VALIDATION_ERROR"),
  );
});

test("cleanup, rescan, and rendition eligibility policies fail closed", () => {
  const now = new Date("2026-07-22T15:00:00.000Z");
  const orphan = {
    expiresAt: new Date(now.getTime() - STORAGE_ORPHAN_RETENTION_MS),
    failureCode: null,
    hasStoredAsset: false,
    now,
    provider: "DETERMINISTIC_TEST" as const,
    state: "EXPIRED" as const,
  };
  assert.equal(isOrphanCleanupEligible(orphan), true);
  assert.equal(isOrphanCleanupEligible({ ...orphan, expiresAt: new Date(orphan.expiresAt.getTime() + 1) }), false);
  assert.equal(isOrphanCleanupEligible({ ...orphan, hasStoredAsset: true }), false);
  assert.equal(isOrphanCleanupEligible({ ...orphan, provider: "NOT_CONFIGURED" }), false);
  assert.equal(isOrphanCleanupEligible({ ...orphan, failureCode: "ORPHAN_OBJECT_DELETED" }), false);

  assert.equal(isStoredAssetRescanEligible({
    inspectionPolicyVersion: STORAGE_INSPECTION_POLICY_VERSION,
    source: "ADMIN_MANUAL",
    state: "READY",
  }), true);
  assert.equal(isStoredAssetRescanEligible({
    inspectionPolicyVersion: null,
    source: "DOMAIN_DISCOVERY",
    state: "QUARANTINED",
  }), true);
  assert.equal(isStoredAssetRescanEligible({
    inspectionPolicyVersion: STORAGE_INSPECTION_POLICY_VERSION,
    source: "DOMAIN_DISCOVERY",
    state: "QUARANTINED",
  }), false);
  assert.equal(isStoredAssetRescanEligible({
    inspectionPolicyVersion: null,
    source: "SCHEDULE",
    state: "QUARANTINED",
  }), false);
  assert.equal(isStoredAssetRescanEligible({
    inspectionPolicyVersion: null,
    source: "ADMIN_MANUAL",
    state: "DELETE_PENDING",
  }), false);

  assert.equal(isMediaRenditionSourceEligible({
    activeSlots: ["BUSINESS_LOGO", "BUSINESS_COVER"],
    profile: "HERO_1600_WEBP",
    sourceAssetVersion: 7,
    sourceState: "READY",
    sourceVersion: 7,
  }), true);
  assert.equal(isMediaRenditionSourceEligible({
    activeSlots: ["BUSINESS_LOGO"],
    profile: "HERO_1600_WEBP",
    sourceAssetVersion: 7,
    sourceState: "READY",
    sourceVersion: 7,
  }), false);
  assert.equal(isMediaRenditionSourceEligible({
    activeSlots: ["BUSINESS_COVER"],
    profile: "HERO_1600_WEBP",
    sourceAssetVersion: 8,
    sourceState: "READY",
    sourceVersion: 7,
  }), false);
});

test("the rendition profile registry, source fingerprint, and object key are deterministic and server-owned", () => {
  assert.deepEqual(Object.keys(MEDIA_RENDITION_PROFILES), [
    "AVATAR_256_WEBP", "CARD_640_WEBP", "HERO_1600_WEBP",
  ]);
  assert.deepEqual(MEDIA_RENDITION_PROFILES.AVATAR_256_WEBP, {
    effort: 4, format: "image/webp", maxBytes: 524_288, maxHeight: 256, maxWidth: 256, quality: 82,
  });
  assert.equal(mediaRenditionProfileForSlot("CUSTOMER_AVATAR"), "AVATAR_256_WEBP");
  assert.equal(mediaRenditionProfileForSlot("MENU_ITEM_PRIMARY"), "CARD_640_WEBP");
  assert.equal(mediaRenditionProfileForSlot("BUSINESS_COVER"), "HERO_1600_WEBP");
  const input = {
    profile: "CARD_640_WEBP" as const,
    sourceAssetId: assetId,
    sourceAssetVersion: 2,
    sourceChecksumSha256: "a".repeat(64),
    sourceProviderObjectVersion: "provider-v1",
  };
  const fingerprint = mediaRenditionSourceFingerprint(input);
  assert.equal(fingerprint, mediaRenditionSourceFingerprint({ ...input }));
  assert.notEqual(fingerprint, mediaRenditionSourceFingerprint({ ...input, sourceAssetVersion: 3 }));
  const objectKey = generateMediaRenditionObjectKey(assetId, fingerprint);
  assert.match(objectKey, /^(?:development|test)\/media-rendition\/10000000-0000-4000-8000-000000000001\//u);
  assert.equal(isServerGeneratedStorageKey(objectKey), true);
  assert.equal(objectKey, generateMediaRenditionObjectKey(assetId, fingerprint));
});

test("rendition processing is deterministic, bounded, static WebP, and strips source metadata", async () => {
  const source = await sharp({
    create: { background: { alpha: 1, b: 200, g: 100, r: 20 }, channels: 4, height: 500, width: 1_000 },
  }).withMetadata({ exif: { IFD0: { Artist: "private-metadata" } } }).png().toBuffer();
  const first = await renderMediaRendition(source, "CARD_640_WEBP");
  const second = await renderMediaRendition(source, "CARD_640_WEBP");
  assert.equal(first.mimeType, "image/webp");
  assert.equal(first.width, 640);
  assert.equal(first.height, 320);
  assert.ok(first.sizeBytes <= MEDIA_RENDITION_PROFILES.CARD_640_WEBP.maxBytes);
  assert.equal(first.checksumSha256, second.checksumSha256);
  assert.deepEqual(first.bytes, second.bytes);
  const metadata = await sharp(first.bytes, { animated: true }).metadata();
  assert.equal(metadata.pages ?? 1, 1);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.iptc, undefined);
  assert.equal(metadata.xmp, undefined);
});

test("provider absence is explicit and the deterministic adapter cannot be activated in production", async () => {
  assert.equal(configuredStorageProvider().kind, "NOT_CONFIGURED");
  assert.deepEqual(await configuredStorageProvider().writeObject!({
    bytes: new Uint8Array([1]),
    checksumSha256: "0".repeat(64),
    contentType: "image/webp",
    objectKey: `test/media-rendition/${assetId}/${sessionId}`,
    provider: "NOT_CONFIGURED",
  }), { outcome: "NOT_CONFIGURED" });

  const original = process.env.NODE_ENV;
  Object.defineProperty(process.env, "NODE_ENV", { configurable: true, enumerable: true, value: "production", writable: true });
  try {
    assert.throws(() => setStorageProviderForTests(new DeterministicStorageProvider()), /unavailable in production/u);
    assert.throws(() => setStorageAutomationErrorTestHook(() => undefined), /unavailable in production/u);
  } finally {
    Object.defineProperty(process.env, "NODE_ENV", { configurable: true, enumerable: true, value: original, writable: true });
  }
});

test("Gate 6B error retry classification is finite and Migrations 45-47 are schema-only", async () => {
  for (const jobType of [
    "STORAGE_MAINTENANCE_DISCOVERY",
    "STORAGE_ORPHAN_CLEANUP",
    "STORAGE_ASSET_DELETE_RETRY",
    "STORAGE_RESCAN_DISCOVERY",
    "STORAGE_ASSET_RESCAN",
    "MEDIA_RENDITION_DISCOVERY",
    "MEDIA_RENDITION_GENERATE",
    "MEDIA_RENDITION_CLEANUP_DISCOVERY",
    "MEDIA_RENDITION_DELETE",
  ] as PlatformJobType[]) {
    assert.equal(isRetryablePlatformJobError(jobType, "TRANSIENT_FAILURE"), true);
    assert.equal(isRetryablePlatformJobError(jobType, "HANDLER_TIMEOUT"), true);
    assert.equal(isRetryablePlatformJobError(jobType, "PERMANENT_FAILURE"), false);
    assert.equal(isRetryablePlatformJobError(jobType, "PROVIDER_RAW_SECRET"), false);
  }
  const [migration45, migration46, migration47] = await Promise.all([
    readFile(new URL(
      "../../../prisma/migrations/20260722150000_storage_media_automation/migration.sql",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "../../../prisma/migrations/20260723120000_media_rendition_claim_integrity/migration.sql",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "../../../prisma/migrations/20260723150000_gate6a_gate6b_constraint_truth_tables/migration.sql",
      import.meta.url,
    ), "utf8"),
  ]);
  assert.doesNotMatch(migration45, /\bINSERT\s+INTO\b|\bUPDATE\s+"?[A-Z][A-Za-z]+"?\s+SET\b|\bDELETE\s+FROM\b/iu);
  assert.doesNotMatch(migration46, /\bINSERT\s+INTO\b|\bUPDATE\s+"?[A-Z][A-Za-z]+"?\s+SET\b|\bDELETE\s+FROM\b/iu);
  assert.doesNotMatch(migration47, /\bINSERT\s+INTO\b|\bUPDATE\s+"?[A-Z][A-Za-z]+"?\s+SET\b|\bDELETE\s+FROM\b/iu);
  assert.match(migration45, /MediaRendition_sourceAssetId_sourceAssetVersion_profile_key/u);
  assert.match(migration45, /MediaRendition_failure_check/u);
  assert.match(migration45, /StoredAsset_rescan_claim_check/u);
  assert.match(migration45, /PlatformJob_source_check/u);
  assert.match(migration46, /claimless_processing_count/u);
  assert.match(migration46, /partial_or_invalid_claim_count/u);
  assert.match(migration46, /illegal_state_claim_count/u);
  assert.match(migration46, /"state" = 'PROCESSING'[\s\S]*"claimJobId" IS NOT NULL/u);
  assert.match(migration46, /"state" = 'DELETE_PENDING'[\s\S]*"claimJobId" IS NULL/u);
  assert.match(migration47, /"operationFencingToken" IS NOT NULL/u);
  assert.match(migration47, /"rescanClaimFencingToken" IS NOT NULL/u);
  assert.match(migration47, /"claimFencingToken" IS NOT NULL/u);
  assert.match(migration47, /"mimeType" IS NOT NULL/u);
  assert.match(migration47, /"width" IS NULL AND "height" IS NULL/u);
  assert.match(migration47, /"deleteRequestedAt" IS NULL[\s\S]*"deletedAt" IS NULL/u);
});

function domainCode(expected: string) {
  return (error: unknown) => error instanceof PlatformJobDomainError && error.code === expected;
}
