import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { generateStorageObjectKey } from "../../../features/storage/domain/policy";
import { prisma } from "../../../lib/db/prisma";

const baseUrl = process.env.STORAGE_AUTOMATION_HTTP_BASE_URL ?? process.env.PLATFORM_JOBS_HTTP_BASE_URL;
const marker = `gate6b-http-${randomUUID().slice(0, 8)}`;

type Actor = { cookie: string; personId: string; userId: string };

async function signUp(label: string): Promise<Actor> {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    body: JSON.stringify({
      email: `${marker}-${label}@rezno.invalid`, name: label, password: "password123",
    }),
    headers: { "content-type": "application/json", origin: baseUrl! },
    method: "POST",
  });
  if (response.status !== 200) {
    throw new Error(`Sign-up failed with ${response.status}: ${await response.text()}`);
  }
  const payload = await response.json() as { user: { id: string } };
  const cookie = response.headers.getSetCookie().find((value) => value.includes("session_token="));
  assert.ok(cookie);
  const person = await prisma.person.update({
    where: { authUserId: payload.user.id }, data: { isOnboarded: true, status: "ACTIVE" },
  });
  return { cookie: cookie.split(";", 1)[0]!, personId: person.id, userId: payload.user.id };
}

async function request(path: string, options: {
  body?: string | Record<string, unknown>;
  contentType?: string;
  cookie?: string;
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
    },
    method: options.method ?? "GET",
    redirect: "manual",
  });
  const payload = await response.json() as Record<string, unknown>;
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.doesNotMatch(
    JSON.stringify(payload),
    /postgresql:\/\/|DATABASE_URL|BETTER_AUTH_SECRET|PrismaClient|node_modules|objectKey|leaseToken|payloadHash|checksumSha256|providerObjectVersion|signedUrl/iu,
  );
  return { payload, response };
}

test("Gate 6B production Admin routes are jointly authorized, bounded, idempotent, and redacted", {
  concurrency: false,
  skip: baseUrl ? false : "STORAGE_AUTOMATION_HTTP_BASE_URL or PLATFORM_JOBS_HTTP_BASE_URL is required",
}, async (t) => {
  const [manager, platformOnly, storageOnly] = await Promise.all([
    signUp("manager"), signUp("platform-only"), signUp("storage-only"),
  ]);
  const accesses = await Promise.all([
    prisma.adminAccess.create({
      data: {
        permissions: [
          "PLATFORM_JOBS_VIEW", "PLATFORM_JOBS_MANAGE", "STORAGE_RECORDS_VIEW", "STORAGE_RECORDS_MANAGE",
        ],
        userId: manager.userId,
      },
    }),
    prisma.adminAccess.create({
      data: { permissions: ["PLATFORM_JOBS_VIEW", "PLATFORM_JOBS_MANAGE"], userId: platformOnly.userId },
    }),
    prisma.adminAccess.create({
      data: { permissions: ["STORAGE_RECORDS_VIEW", "STORAGE_RECORDS_MANAGE"], userId: storageOnly.userId },
    }),
  ]);
  const objectKey = generateStorageObjectKey("INTERNAL_STORAGE_TEST", { environment: "test" });
  const upload = await prisma.uploadSession.create({
    data: {
      actorPersonId: manager.personId,
      expectedMimeType: "image/png",
      expectedSizeBytes: 64,
      expiresAt: new Date(Date.now() + 60_000),
      finalizedAt: new Date(),
      objectKey,
      ownerPersonId: null,
      provider: "NOT_CONFIGURED",
      purpose: "INTERNAL_STORAGE_TEST",
      state: "FINALIZED",
      visibility: "INTERNAL",
    },
  });
  const asset = await prisma.storedAsset.create({
    data: {
      checksumSha256: "a".repeat(64),
      createdByPersonId: manager.personId,
      inspectionOutcome: "VALID",
      mimeType: "image/png",
      objectKey,
      ownerPersonId: null,
      provider: "NOT_CONFIGURED",
      purpose: "INTERNAL_STORAGE_TEST",
      quarantinedAt: new Date(),
      scannerOutcome: "SCAN_FAILED",
      sizeBytes: 64,
      state: "QUARANTINED",
      uploadSessionId: upload.id,
      visibility: "INTERNAL",
    },
  });

  t.after(async () => {
    const userIds = [manager.userId, platformOnly.userId, storageOnly.userId];
    const personIds = [manager.personId, platformOnly.personId, storageOnly.personId];
    await prisma.storedAsset.updateMany({
      where: { id: asset.id },
      data: {
        rescanClaimExpiresAt: null,
        rescanClaimFencingToken: null,
        rescanClaimJobId: null,
        rescanClaimLeaseToken: null,
      },
    });
    await prisma.platformJobMutation.deleteMany({ where: { actorAdminUserId: { in: userIds } } });
    await prisma.platformJobAttempt.deleteMany({ where: { job: { createdByAdminUserId: { in: userIds } } } });
    await prisma.platformJob.deleteMany({ where: { parentJobId: { not: null }, createdByAdminUserId: { in: userIds } } });
    await prisma.platformJob.deleteMany({ where: { createdByAdminUserId: { in: userIds } } });
    await prisma.storedAsset.deleteMany({ where: { id: asset.id } });
    await prisma.uploadSession.deleteMany({ where: { id: upload.id } });
    await prisma.adminAccess.deleteMany({ where: { id: { in: accesses.map((access) => access.id) } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  await t.test("both permissions are required before body consumption", async () => {
    for (const cookie of [undefined, platformOnly.cookie, storageOnly.cookie]) {
      assertError(await request("/api/admin/storage/automation", { cookie }), 403, "FORBIDDEN");
    }
    for (const cookie of [undefined, platformOnly.cookie, storageOnly.cookie]) {
      assertError(await request("/api/admin/storage/automation/discovery", {
        body: `"${"x".repeat(9_000)}"`, cookie, method: "POST",
      }), 403, "FORBIDDEN");
    }
  });

  await t.test("status tells the exact inert runtime and provider truth", async () => {
    const result = await request("/api/admin/storage/automation", { cookie: manager.cookie });
    assert.equal(result.response.status, 200, JSON.stringify(result.payload));
    const data = result.payload.data as {
      gate: string;
      jobTypes: string[];
      provider: string;
      renditionProfiles: string[];
      runtime: { automaticScheduler: string; alwaysOnWorker: string };
      scanner: string;
      scheduleKeys: string[];
      state: string;
    };
    assert.equal(data.gate, "6B");
    assert.equal(data.state, "ACTIVE");
    assert.equal(data.provider, "NOT_CONFIGURED");
    assert.equal(data.scanner, "SCANNER_NOT_CONFIGURED");
    assert.equal(data.runtime.automaticScheduler, "NOT_CONNECTED");
    assert.equal(data.runtime.alwaysOnWorker, "NOT_CONNECTED");
    assert.equal(data.jobTypes.length, 9);
    assert.equal(data.scheduleKeys.length, 4);
    assert.deepEqual(data.renditionProfiles, ["AVATAR_256_WEBP", "CARD_640_WEBP", "HERO_1600_WEBP"]);
    assertError(await request("/api/admin/storage/automation?extra=1", { cookie: manager.cookie }), 400, "VALIDATION_ERROR");
  });

  await t.test("discovery accepts only the closed server-owned types and exact finite bounds", async () => {
    const idempotencyKey = randomUUID();
    const body = { batchSize: 10, idempotencyKey, jobType: "MEDIA_RENDITION_DISCOVERY" };
    const first = await request("/api/admin/storage/automation/discovery", {
      body, cookie: manager.cookie, method: "POST",
    });
    assert.equal(first.response.status, 201, JSON.stringify(first.payload));
    assert.equal((first.payload.data as { replay: boolean }).replay, false);
    const replay = await request("/api/admin/storage/automation/discovery", {
      body, cookie: manager.cookie, method: "POST",
    });
    assert.equal((replay.payload.data as { replay: boolean }).replay, true);
    for (const changed of [
      { ...body, batchSize: 51, idempotencyKey: randomUUID() },
      { ...body, jobType: "MEDIA_RENDITION_GENERATE", idempotencyKey: randomUUID() },
      { ...body, profile: "HERO_1600_WEBP", idempotencyKey: randomUUID() },
      { ...body, objectKey: "production/private/key", idempotencyKey: randomUUID() },
      { ...body, signedUrl: "https://attacker.invalid/object", idempotencyKey: randomUUID() },
    ]) {
      assertError(await request("/api/admin/storage/automation/discovery", {
        body: changed, cookie: manager.cookie, method: "POST",
      }), 400, "VALIDATION_ERROR");
    }
    assertError(await request("/api/admin/storage/automation/discovery", {
      body: "{}", contentType: "text/plain", cookie: manager.cookie, method: "POST",
    }), 400, "VALIDATION_ERROR");
    assertError(await request("/api/admin/storage/automation/discovery", {
      body: `"${"x".repeat(9_000)}"`, cookie: manager.cookie, method: "POST",
    }), 413, "PAYLOAD_TOO_LARGE");
  });

  await t.test("exact rescan is versioned, idempotent, and rejects invented provider input", async () => {
    const idempotencyKey = randomUUID();
    const body = { assetId: asset.id, expectedVersion: asset.version, idempotencyKey };
    const first = await request("/api/admin/storage/automation/rescan", {
      body, cookie: manager.cookie, method: "POST",
    });
    assert.equal(first.response.status, 201, JSON.stringify(first.payload));
    assert.equal((first.payload.data as { jobType: string; replay: boolean }).jobType, "STORAGE_ASSET_RESCAN");
    assert.equal((first.payload.data as { replay: boolean }).replay, false);
    const replay = await request("/api/admin/storage/automation/rescan", {
      body, cookie: manager.cookie, method: "POST",
    });
    assert.equal((replay.payload.data as { replay: boolean }).replay, true);
    assertError(await request("/api/admin/storage/automation/rescan", {
      body: { ...body, provider: "DETERMINISTIC_TEST", idempotencyKey: randomUUID() },
      cookie: manager.cookie,
      method: "POST",
    }), 400, "VALIDATION_ERROR");
    assertError(await request("/api/admin/storage/automation/rescan", {
      body: { ...body, expectedVersion: asset.version + 1, idempotencyKey: randomUUID() },
      cookie: manager.cookie,
      method: "POST",
    }), 409, "CONFLICT");
    assertError(await request("/api/admin/storage/automation/rescan", {
      body: { ...body, assetId: randomUUID(), idempotencyKey: randomUUID() },
      cookie: manager.cookie,
      method: "POST",
    }), 404, "NOT_FOUND");
    assertError(await request("/api/admin/storage/automation/rescan", {
      body: { ...body, assetId: "../../foreign", idempotencyKey: randomUUID() },
      cookie: manager.cookie,
      method: "POST",
    }), 400, "VALIDATION_ERROR");
  });

  await t.test("permission revocation is effective on the next request", async () => {
    await prisma.adminAccess.update({
      where: { id: accesses[0]!.id },
      data: { permissions: ["PLATFORM_JOBS_VIEW", "PLATFORM_JOBS_MANAGE", "STORAGE_RECORDS_VIEW"] },
    });
    assertError(await request("/api/admin/storage/automation", { cookie: manager.cookie }), 403, "FORBIDDEN");
  });
});

function assertError(result: Awaited<ReturnType<typeof request>>, status: number, code: string) {
  assert.equal(result.response.status, status, JSON.stringify(result.payload));
  const error = result.payload.error as { code: string; message: string };
  assert.equal(error.code, code);
  assert.equal(typeof error.message, "string");
}
