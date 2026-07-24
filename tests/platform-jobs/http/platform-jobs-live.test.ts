import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { prisma } from "../../../lib/db/prisma";

const baseUrl = process.env.PLATFORM_JOBS_HTTP_BASE_URL;
const marker = `gate6a-http-${randomUUID().slice(0, 8)}`;

type Actor = { cookie: string; personId: string; userId: string };

async function signUp(label: string): Promise<Actor> {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    body: JSON.stringify({ email: `${marker}-${label}@rezno.invalid`, name: label, password: "password123" }),
    headers: { "content-type": "application/json", origin: baseUrl! },
    method: "POST",
  });
  if (response.status !== 200) throw new Error(`Sign-up failed with ${response.status}: ${await response.text()}`);
  const payload = await response.json() as { user: { id: string } };
  const cookie = response.headers.getSetCookie().find((value) => value.includes("session_token="));
  assert.ok(cookie);
  const person = await prisma.person.update({ where: { authUserId: payload.user.id }, data: { isOnboarded: true, status: "ACTIVE" } });
  return { cookie: cookie.split(";", 1)[0]!, personId: person.id, userId: payload.user.id };
}

async function request(path: string, options: {
  body?: string | Record<string, unknown>;
  contentType?: string;
  cookie?: string;
  method?: string;
} = {}) {
  const body = typeof options.body === "string" ? options.body : options.body === undefined ? undefined : JSON.stringify(options.body);
  const response = await fetch(`${baseUrl}${path}`, {
    body,
    headers: {
      ...(body === undefined ? {} : { "content-type": options.contentType ?? "application/json" }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    method: options.method ?? "GET",
    redirect: "manual",
  });
  const payload = (response.headers.get("content-type") ?? "").startsWith("application/json")
    ? await response.json() as Record<string, unknown>
    : { text: await response.text() };
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.doesNotMatch(JSON.stringify(payload), /postgresql:\/\/|DATABASE_URL|BETTER_AUTH_SECRET|PrismaClient|node_modules|leaseToken|payloadHash|raw-provider-secret/iu);
  return { payload, response };
}

test("Gate 6A Admin pages and route matrix are present without client-supplied arbitrary execution", async () => {
  const [page, detail, trigger, worker, scheduler] = await Promise.all([
    readFile(new URL("../../../app/admin/platform-jobs/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../app/admin/platform-jobs/[jobId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../app/api/admin/platform-jobs/jobs/trigger/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../app/api/admin/platform-jobs/worker/run/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../app/api/admin/platform-jobs/scheduler/tick/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Automatic scheduling and always-on workers are not connected/);
  assert.match(page, /Safe detail/);
  assert.match(detail, /payload values and lease tokens are never exposed/);
  assert.match(trigger, /parsePlatformJobTrigger/);
  assert.match(worker, /parsePlatformJobWorkerBatch/);
  assert.match(scheduler, /parsePlatformJobSchedulerBatch/);
  for (const source of [trigger, worker, scheduler]) {
    assert.doesNotMatch(source, /eval\(|new Function|fetch\(.*payload|child_process/iu);
  }
});

test("Gate 6A live Admin API is authenticated, permissioned, bounded, idempotent, and redacted", {
  concurrency: false,
  skip: baseUrl ? false : "PLATFORM_JOBS_HTTP_BASE_URL is required",
}, async (t) => {
  const [manager, viewer, basic] = await Promise.all([signUp("manager"), signUp("viewer"), signUp("basic")]);
  const [managerAccess, viewerAccess] = await Promise.all([
    prisma.adminAccess.create({
      data: {
        permissions: [
          "PLATFORM_JOBS_VIEW",
          "PLATFORM_JOBS_MANAGE",
          "NOTIFICATIONS_VIEW",
          "NOTIFICATIONS_SEND",
          "COMMUNICATIONS_DISPATCH",
          "PAYMENTS_VIEW",
          "PAYMENTS_REFUND",
          "PAYMENTS_RECONCILE",
          "SETTLEMENTS_VIEW",
          "SETTLEMENTS_MANAGE",
        ],
        userId: manager.userId,
      },
    }),
    prisma.adminAccess.create({ data: { permissions: ["PLATFORM_JOBS_VIEW"], userId: viewer.userId } }),
  ]);

  t.after(async () => {
    const userIds = [manager.userId, viewer.userId, basic.userId];
    const personIds = [manager.personId, viewer.personId, basic.personId];
    await prisma.platformJobMutation.deleteMany({ where: { actorAdminUserId: { in: userIds } } });
    await prisma.platformJobAttempt.deleteMany({ where: { job: { createdByAdminUserId: { in: userIds } } } });
    await prisma.platformJob.deleteMany({ where: { requeueRootJobId: { not: null }, createdByAdminUserId: { in: userIds } } });
    await prisma.platformJob.deleteMany({ where: { createdByAdminUserId: { in: userIds } } });
    await prisma.platformJobSchedule.deleteMany({ where: { createdByAdminUserId: { in: userIds } } });
    await prisma.adminAccess.deleteMany({ where: { id: { in: [managerAccess.id, viewerAccess.id] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  await t.test("authentication and permissions are checked before request-body consumption", async () => {
    assertError(await request("/api/admin/platform-jobs/jobs?limit=1"), 403, "FORBIDDEN");
    assertError(await request("/api/admin/platform-jobs/jobs?limit=1", { cookie: basic.cookie }), 403, "FORBIDDEN");
    assertError(await request("/api/admin/platform-jobs/jobs/trigger", { body: `"${"x".repeat(9_000)}"`, method: "POST" }), 403, "FORBIDDEN");
    assertError(await request("/api/admin/platform-jobs/jobs/trigger", { body: { idempotencyKey: randomUUID(), jobType: "PLATFORM_HEALTH_PROBE" }, cookie: viewer.cookie, method: "POST" }), 403, "FORBIDDEN");
    assert.equal((await request("/api/admin/platform-jobs/jobs?limit=1", { cookie: viewer.cookie })).response.status, 200);
  });

  let jobId = "";
  let jobVersion = 0;
  await t.test("manual health trigger is strict and exactly idempotent", async () => {
    const idempotencyKey = randomUUID();
    const body = { idempotencyKey, jobType: "PLATFORM_HEALTH_PROBE" };
    const first = await request("/api/admin/platform-jobs/jobs/trigger", { body, cookie: manager.cookie, method: "POST" });
    assert.equal(first.response.status, 201, JSON.stringify(first.payload));
    const firstData = first.payload.data as { jobId: string; replay: boolean; status: string; version: number };
    assert.equal(firstData.replay, false);
    assert.equal(firstData.status, "AVAILABLE");
    jobId = firstData.jobId;
    jobVersion = firstData.version;
    const replay = await request("/api/admin/platform-jobs/jobs/trigger", { body, cookie: manager.cookie, method: "POST" });
    assert.equal(replay.response.status, 201);
    assert.equal((replay.payload.data as { jobId: string; replay: boolean }).jobId, jobId);
    assert.equal((replay.payload.data as { replay: boolean }).replay, true);
    assertError(await request("/api/admin/platform-jobs/jobs/trigger", { body: { ...body, arbitraryUrl: "https://example.test/execute" }, cookie: manager.cookie, method: "POST" }), 400, "VALIDATION_ERROR");
    assertError(await request("/api/admin/platform-jobs/jobs/trigger", { body: { idempotencyKey: randomUUID(), jobType: "ARBITRARY_URL" }, cookie: manager.cookie, method: "POST" }), 400, "VALIDATION_ERROR");
  });

  await t.test("list, cursor, and safe detail contracts expose no payload or lease authority", async () => {
    const list = await request("/api/admin/platform-jobs/jobs?limit=1&status=AVAILABLE", { cookie: manager.cookie });
    assert.equal(list.response.status, 200);
    const data = list.payload.data as { items: Array<Record<string, unknown>>; nextCursor: string | null };
    assert.equal(data.items.length, 1);
    assert.equal(data.items[0].id, jobId);
    assert.deepEqual(data.items[0].payload, { containsReferencesOnly: true, jobType: "PLATFORM_HEALTH_PROBE", payloadVersion: 1 });
    assert.equal("leaseToken" in data.items[0], false);
    const detail = await request(`/api/admin/platform-jobs/jobs/${jobId}`, { cookie: manager.cookie });
    assert.equal(detail.response.status, 200);
    const detailData = detail.payload.data as Record<string, unknown>;
    assert.equal("payloadHash" in detailData, false);
    assert.equal("leaseToken" in detailData, false);
    assertError(await request("/api/admin/platform-jobs/jobs?limit=1&limit=2", { cookie: manager.cookie }), 400, "VALIDATION_ERROR");
    assertError(await request("/api/admin/platform-jobs/jobs?limit=1&cursor=forged", { cookie: manager.cookie }), 400, "INVALID_CURSOR");
    assertError(await request(`/api/admin/platform-jobs/jobs/${randomUUID()}`, { cookie: manager.cookie }), 404, "NOT_FOUND");
  });

  await t.test("JSON framing and actual body bytes are bounded", async () => {
    assertError(await request("/api/admin/platform-jobs/jobs/trigger", { body: "{}", contentType: "text/plain", cookie: manager.cookie, method: "POST" }), 400, "VALIDATION_ERROR");
    assertError(await request("/api/admin/platform-jobs/jobs/trigger", { body: `"${"x".repeat(9_000)}"`, cookie: manager.cookie, method: "POST" }), 413, "PAYLOAD_TOO_LARGE");
    assertError(await request("/api/admin/platform-jobs/jobs/trigger", { body: "{", cookie: manager.cookie, method: "POST" }), 400, "VALIDATION_ERROR");
  });

  await t.test("Gate 6C status and manual discovery trigger are closed, truthful, and strict", async () => {
    assertError(await request("/api/admin/platform-jobs/gate6c"), 403, "FORBIDDEN");
    assertError(
      await request("/api/admin/platform-jobs/gate6c", { cookie: viewer.cookie }),
      403,
      "FORBIDDEN",
    );
    const status = await request("/api/admin/platform-jobs/gate6c", {
      cookie: manager.cookie,
    });
    assert.equal(status.response.status, 200, JSON.stringify(status.payload));
    const statusData = status.payload.data as Record<string, unknown>;
    assert.equal(statusData.gate, "6C");
    assert.equal(statusData.state, "ACTIVE");
    assert.equal(statusData.paymentProvider, "NOT_CONFIGURED");
    assert.equal(statusData.payoutConnected, false);
    assert.equal(statusData.humanDeliveryClaim, false);
    assert.match(JSON.stringify(statusData.runtime), /NOT_CONNECTED/u);
    assert.doesNotMatch(
      JSON.stringify(statusData),
      /password|signature|authorization|endpoint|amount|currency/iu,
    );
    assertError(
      await request("/api/admin/platform-jobs/gate6c?unexpected=1", {
        cookie: manager.cookie,
      }),
      400,
      "VALIDATION_ERROR",
    );

    const idempotencyKey = randomUUID();
    const body = {
      batchSize: 5,
      idempotencyKey,
      jobType: "PAYMENT_RETRY_DISCOVERY",
    };
    const first = await request("/api/admin/platform-jobs/gate6c/trigger", {
      body,
      cookie: manager.cookie,
      method: "POST",
    });
    assert.equal(first.response.status, 201, JSON.stringify(first.payload));
    assert.equal((first.payload.data as { replay: boolean }).replay, false);
    const replay = await request("/api/admin/platform-jobs/gate6c/trigger", {
      body,
      cookie: manager.cookie,
      method: "POST",
    });
    assert.equal(replay.response.status, 201);
    assert.equal((replay.payload.data as { replay: boolean }).replay, true);
    assertError(
      await request("/api/admin/platform-jobs/gate6c/trigger", {
        body: { ...body, jobType: "PAYMENT_PROVIDER_EVENT_PROCESS" },
        cookie: manager.cookie,
        method: "POST",
      }),
      400,
      "VALIDATION_ERROR",
    );
    assertError(
      await request("/api/admin/platform-jobs/gate6c/trigger", {
        body: { ...body, amount: "1.000" },
        cookie: manager.cookie,
        method: "POST",
      }),
      400,
      "VALIDATION_ERROR",
    );
    assertError(
      await request("/api/admin/platform-jobs/gate6c/trigger", {
        body: `"${"x".repeat(9_000)}"`,
        cookie: manager.cookie,
        method: "POST",
      }),
      413,
      "PAYLOAD_TOO_LARGE",
    );
  });

  await t.test("cancellation uses version and idempotency and cannot be repeated with a new key", async () => {
    const idempotencyKey = randomUUID();
    const cancelled = await request(`/api/admin/platform-jobs/jobs/${jobId}/cancel`, { body: { expectedVersion: jobVersion, idempotencyKey }, cookie: manager.cookie, method: "POST" });
    assert.equal(cancelled.response.status, 200, JSON.stringify(cancelled.payload));
    assert.equal((cancelled.payload.data as { status: string }).status, "CANCELLED");
    const replay = await request(`/api/admin/platform-jobs/jobs/${jobId}/cancel`, { body: { expectedVersion: jobVersion, idempotencyKey }, cookie: manager.cookie, method: "POST" });
    assert.equal((replay.payload.data as { replay: boolean }).replay, true);
    assertError(await request(`/api/admin/platform-jobs/jobs/${jobId}/cancel`, { body: { expectedVersion: jobVersion, idempotencyKey: randomUUID() }, cookie: manager.cookie, method: "POST" }), 409, "CONFLICT");
  });

  await t.test("manual worker and scheduler operations are bounded and truthfully remain on-demand", async () => {
    const triggered = await request("/api/admin/platform-jobs/jobs/trigger", { body: { idempotencyKey: randomUUID(), jobType: "PLATFORM_HEALTH_PROBE" }, cookie: manager.cookie, method: "POST" });
    assert.equal(triggered.response.status, 201);
    const workerKey = randomUUID();
    const worker = await request("/api/admin/platform-jobs/worker/run", { body: { batchSize: 1, idempotencyKey: workerKey }, cookie: manager.cookie, method: "POST" });
    assert.equal(worker.response.status, 200, JSON.stringify(worker.payload));
    assert.equal((worker.payload.data as { state: string; succeeded: number }).state, "COMPLETE");
    assert.equal((worker.payload.data as { succeeded: number }).succeeded, 1);
    const workerReplay = await request("/api/admin/platform-jobs/worker/run", { body: { batchSize: 1, idempotencyKey: workerKey }, cookie: manager.cookie, method: "POST" });
    assert.equal((workerReplay.payload.data as { replay: boolean }).replay, true);
    assertError(await request("/api/admin/platform-jobs/worker/run", { body: { batchSize: 11, idempotencyKey: randomUUID() }, cookie: manager.cookie, method: "POST" }), 400, "VALIDATION_ERROR");
    const scheduler = await request("/api/admin/platform-jobs/scheduler/tick", { body: { batchSize: 1, idempotencyKey: randomUUID() }, cookie: manager.cookie, method: "POST" });
    assert.equal(scheduler.response.status, 200);
    assert.equal((scheduler.payload.data as { schedulesProcessed: number }).schedulesProcessed, 0);
    const schedules = await request("/api/admin/platform-jobs/schedules?limit=10", { cookie: manager.cookie });
    assert.equal((schedules.payload.data as { items: unknown[] }).items.length, 0);
  });

  await t.test("revoked Admin access is rejected on the next operation", async () => {
    await prisma.adminAccess.update({ where: { id: managerAccess.id }, data: { status: "REVOKED" } });
    assertError(await request("/api/admin/platform-jobs/jobs?limit=1", { cookie: manager.cookie }), 403, "FORBIDDEN");
  });
});

function assertError(result: Awaited<ReturnType<typeof request>>, status: number, code: string) {
  assert.equal(result.response.status, status, JSON.stringify(result.payload));
  const error = result.payload.error as { code: string; message: string };
  assert.equal(error.code, code);
  assert.equal(typeof error.message, "string");
}
