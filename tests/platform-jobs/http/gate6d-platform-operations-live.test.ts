import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { Prisma } from "@prisma/client";

import { prisma } from "../../../lib/db/prisma";

const baseUrl = process.env.PLATFORM_OPERATIONS_HTTP_BASE_URL;
const marker = `gate6d-http-${randomUUID().slice(0, 8)}`;

type Actor = { cookie: string; personId: string; userId: string };

test("Gate 6D Admin, runtime, alert, and incident route matrix is closed", async () => {
  const sources = await Promise.all([
    readFile(
      new URL("../../../app/admin/platform-operations/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../app/api/internal/platform-runtime/github/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../app/api/admin/platform-operations/overview/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../app/api/admin/platform-operations/alerts/[alertId]/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../app/api/admin/platform-operations/incidents/[incidentId]/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(sources[0], /Platform operations/u);
  assert.match(sources[0], /Bootstrap 13 disabled schedules/u);
  assert.doesNotMatch(sources[0], /fetch\(\s*["'`]\/api/u);
  assert.match(
    sources[1],
    /try \{\s+const identity = await verifyGitHubRuntimeIdentity\([\s\S]*?const body = await readBoundedPlatformJobJson/u,
  );
  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /eval\(|new Function|child_process|rawProvider|DATABASE_URL/iu,
    );
  }
});

test("Gate 6D built Admin and internal APIs are authenticated, bounded, permissioned, and redacted", {
  concurrency: false,
  skip: baseUrl ? false : "PLATFORM_OPERATIONS_HTTP_BASE_URL is required",
}, async (t) => {
  await cleanupOperations();
  const [manager, viewer, basic] = await Promise.all([
    signUp("manager"),
    signUp("viewer"),
    signUp("basic"),
  ]);
  const [managerAccess, viewerAccess] = await Promise.all([
    prisma.adminAccess.create({
      data: {
        permissions: [
          "PLATFORM_JOBS_VIEW",
          "PLATFORM_JOBS_MANAGE",
          "PLATFORM_OPERATIONS_VIEW",
          "PLATFORM_OPERATIONS_MANAGE",
          "COMMERCE_ORDERS_MANAGE",
        ],
        userId: manager.userId,
      },
    }),
    prisma.adminAccess.create({
      data: {
        permissions: ["PLATFORM_OPERATIONS_VIEW"],
        userId: viewer.userId,
      },
    }),
  ]);

  t.after(async () => {
    await cleanupOperations();
    const userIds = [manager.userId, viewer.userId, basic.userId];
    const personIds = [manager.personId, viewer.personId, basic.personId];
    await prisma.adminAccess.deleteMany({
      where: { id: { in: [managerAccess.id, viewerAccess.id] } },
    });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  await t.test("authentication and permissions precede request-body consumption", async () => {
    assertError(
      await request("/api/admin/platform-operations/overview"),
      403,
      "FORBIDDEN",
    );
    assertError(
      await request("/api/admin/platform-operations/overview", {
        cookie: basic.cookie,
      }),
      403,
      "FORBIDDEN",
    );
    assert.equal(
      (await request("/api/admin/platform-operations/overview", {
        cookie: viewer.cookie,
      })).response.status,
      200,
    );
    assertError(
      await request("/api/admin/platform-operations/runtime/initialize", {
        body: `"${"x".repeat(12_000)}"`,
        cookie: viewer.cookie,
        method: "POST",
      }),
      403,
      "FORBIDDEN",
    );
  });

  let runtimeVersion = 0;
  await t.test("runtime initialization and schedule bootstrap are strict and exactly replayable", async () => {
    const initializeBody = { idempotencyKey: randomUUID() };
    const initialized = await request(
      "/api/admin/platform-operations/runtime/initialize",
      { body: initializeBody, cookie: manager.cookie, method: "POST" },
    );
    assert.equal(initialized.response.status, 201, JSON.stringify(initialized.payload));
    const initializedData = initialized.payload.data as {
      replay: boolean;
      state: string;
      version: number;
    };
    assert.equal(initializedData.replay, false);
    assert.equal(initializedData.state, "DISABLED");
    runtimeVersion = initializedData.version;
    const replay = await request(
      "/api/admin/platform-operations/runtime/initialize",
      { body: initializeBody, cookie: manager.cookie, method: "POST" },
    );
    assert.equal((replay.payload.data as { replay: boolean }).replay, true);
    assertError(
      await request("/api/admin/platform-operations/runtime/initialize", {
        body: { ...initializeBody, unknown: true },
        cookie: manager.cookie,
        method: "POST",
      }),
      400,
      "VALIDATION_ERROR",
    );
    assertError(
      await request("/api/admin/platform-operations/runtime/initialize", {
        body: `"${"x".repeat(12_000)}"`,
        cookie: manager.cookie,
        method: "POST",
      }),
      413,
      "PAYLOAD_TOO_LARGE",
    );

    const bootstrapBody = { idempotencyKey: randomUUID() };
    const bootstrap = await request(
      "/api/admin/platform-operations/schedules/bootstrap",
      { body: bootstrapBody, cookie: manager.cookie, method: "POST" },
    );
    assert.equal(bootstrap.response.status, 201, JSON.stringify(bootstrap.payload));
    assert.deepEqual(
      bootstrap.payload.data,
      {
        configured: 13,
        created: 13,
        enabled: 0,
        registryVersion: 1,
        replay: false,
      },
    );
    const bootstrapReplay = await request(
      "/api/admin/platform-operations/schedules/bootstrap",
      { body: bootstrapBody, cookie: manager.cookie, method: "POST" },
    );
    assert.equal(
      (bootstrapReplay.payload.data as { replay: boolean }).replay,
      true,
    );
  });

  await t.test("overview and runtime state expose truthful safe configuration only", async () => {
    const overview = await request("/api/admin/platform-operations/overview", {
      cookie: manager.cookie,
    });
    assert.equal(overview.response.status, 200, JSON.stringify(overview.payload));
    const data = overview.payload.data as {
      metrics: Record<string, unknown>;
      providers: Record<string, string>;
      rateLimit: { availability: string; backend: string };
      runtime: { connection: string; state: string; version: number };
    };
    assert.equal(data.runtime.state, "DISABLED");
    assert.equal(data.runtime.connection, "NOT_CONNECTED");
    assert.equal(data.rateLimit.backend, "POSTGRESQL");
    assert.equal(data.rateLimit.availability, "AVAILABLE");
    assert.deepEqual(data.providers, {
      communications: "NOT_CONFIGURED",
      payment: "NOT_CONFIGURED",
      storage: "NOT_CONFIGURED",
    });
    assert.ok("expiredLeases" in data.metrics);
    assert.ok("communicationFailures" in data.metrics);
    assert.ok("settlementGenerationStale" in data.metrics);

    const enabled = await request(
      "/api/admin/platform-operations/runtime/state",
      {
        body: {
          enabled: true,
          expectedVersion: runtimeVersion,
          idempotencyKey: randomUUID(),
        },
        cookie: manager.cookie,
        method: "POST",
      },
    );
    assert.equal(enabled.response.status, 200, JSON.stringify(enabled.payload));
    const enabledData = enabled.payload.data as {
      state: string;
      version: number;
    };
    assert.equal(enabledData.state, "ENABLED");
    runtimeVersion = enabledData.version;
  });

  let alertId = "";
  let alertVersion = 0;
  await t.test("alert list/detail/cursor and lifecycle are bounded and idempotent", async () => {
    const alerts = await Promise.all([
      createAlert(manager, "first"),
      createAlert(manager, "second"),
    ]);
    alertId = alerts[0]!.id;
    alertVersion = alerts[0]!.version;
    const list = await request(
      "/api/admin/platform-operations/alerts?limit=1&state=OPEN",
      { cookie: manager.cookie },
    );
    assert.equal(list.response.status, 200, JSON.stringify(list.payload));
    const listData = list.payload.data as {
      items: Array<Record<string, unknown>>;
      nextCursor: string | null;
    };
    assert.equal(listData.items.length, 1);
    assert.ok(listData.nextCursor);
    assert.equal("deduplicationKey" in listData.items[0]!, false);
    const next = await request(
      `/api/admin/platform-operations/alerts?limit=1&state=OPEN&cursor=${encodeURIComponent(listData.nextCursor!)}`,
      { cookie: manager.cookie },
    );
    assert.equal(next.response.status, 200);
    assertError(
      await request(
        "/api/admin/platform-operations/alerts?limit=1&limit=2",
        { cookie: manager.cookie },
      ),
      400,
      "VALIDATION_ERROR",
    );
    assertError(
      await request(
        "/api/admin/platform-operations/alerts?limit=1&state=OPEN&cursor=forged",
        { cookie: manager.cookie },
      ),
      400,
      "INVALID_CURSOR",
    );
    const detail = await request(
      `/api/admin/platform-operations/alerts/${alertId}`,
      { cookie: viewer.cookie },
    );
    assert.equal(detail.response.status, 200);
    const acknowledgeBody = {
      expectedVersion: alertVersion,
      idempotencyKey: randomUUID(),
    };
    const acknowledged = await request(
      `/api/admin/platform-operations/alerts/${alertId}/acknowledge`,
      { body: acknowledgeBody, cookie: manager.cookie, method: "POST" },
    );
    assert.equal(acknowledged.response.status, 200);
    const acknowledgedData = acknowledged.payload.data as {
      replay: boolean;
      version: number;
    };
    assert.equal(acknowledgedData.replay, false);
    alertVersion = acknowledgedData.version;
    const replay = await request(
      `/api/admin/platform-operations/alerts/${alertId}/acknowledge`,
      { body: acknowledgeBody, cookie: manager.cookie, method: "POST" },
    );
    assert.equal((replay.payload.data as { replay: boolean }).replay, true);
  });

  let incidentId = "";
  let incidentVersion = 0;
  await t.test("incident create/detail/acknowledge/resolve uses optimistic versions", async () => {
    const created = await request(
      `/api/admin/platform-operations/alerts/${alertId}/incident`,
      {
        body: {
          expectedVersion: alertVersion,
          idempotencyKey: randomUUID(),
        },
        cookie: manager.cookie,
        method: "POST",
      },
    );
    assert.equal(created.response.status, 201, JSON.stringify(created.payload));
    const createdData = created.payload.data as {
      id: string;
      version: number;
    };
    incidentId = createdData.id;
    incidentVersion = createdData.version;
    const detail = await request(
      `/api/admin/platform-operations/incidents/${incidentId}`,
      { cookie: viewer.cookie },
    );
    assert.equal(detail.response.status, 200, JSON.stringify(detail.payload));
    assert.equal(
      ((detail.payload.data as { sourceAlert: { id: string } }).sourceAlert.id),
      alertId,
    );
    const acknowledged = await request(
      `/api/admin/platform-operations/incidents/${incidentId}/acknowledge`,
      {
        body: {
          expectedVersion: incidentVersion,
          idempotencyKey: randomUUID(),
        },
        cookie: manager.cookie,
        method: "POST",
      },
    );
    assert.equal(acknowledged.response.status, 200);
    incidentVersion = (
      acknowledged.payload.data as { version: number }
    ).version;
    const resolved = await request(
      `/api/admin/platform-operations/incidents/${incidentId}/resolve`,
      {
        body: {
          expectedVersion: incidentVersion,
          idempotencyKey: randomUUID(),
        },
        cookie: manager.cookie,
        method: "POST",
      },
    );
    assert.equal(resolved.response.status, 200);
    assert.equal(
      (resolved.payload.data as { state: string }).state,
      "RESOLVED",
    );
    assertError(
      await request(
        `/api/admin/platform-operations/incidents/${randomUUID()}`,
        { cookie: manager.cookie },
      ),
      404,
      "NOT_FOUND",
    );
  });

  await t.test("permission revocation fails closed without alert mutation", async () => {
    const alert = await createAlert(manager, "revoked");
    await prisma.adminAccess.update({
      where: { id: managerAccess.id },
      data: { permissions: ["PLATFORM_OPERATIONS_VIEW"] },
    });
    assertError(
      await request(
        `/api/admin/platform-operations/alerts/${alert.id}/resolve`,
        {
          body: {
            expectedVersion: alert.version,
            idempotencyKey: randomUUID(),
          },
          cookie: manager.cookie,
          method: "POST",
        },
      ),
      403,
      "FORBIDDEN",
    );
    assert.equal(
      (await prisma.platformAlert.findUniqueOrThrow({
        where: { id: alert.id },
      })).state,
      "OPEN",
    );
  });

  await t.test("internal runtime rejects unauthenticated and malformed identity before body parsing", async () => {
    const before = await prisma.platformRuntimeInvocation.count();
    assertError(
      await request("/api/internal/platform-runtime/github", {
        body: `"${"x".repeat(12_000)}"`,
        method: "POST",
      }),
      401,
      "INVALID_IDENTITY",
    );
    assertError(
      await request("/api/internal/platform-runtime/github", {
        authorization: "Bearer malformed",
        body: { version: 1 },
        method: "POST",
      }),
      401,
      "INVALID_IDENTITY",
    );
    assert.equal(await prisma.platformRuntimeInvocation.count(), before);
  });

  await t.test("Admin HTML renders directly without an internal API round trip", async () => {
    const response = await fetch(`${baseUrl}/admin/platform-operations`, {
      headers: { cookie: viewer.cookie },
      redirect: "manual",
    });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Platform operations/u);
    assert.match(html, /Distributed rate limit/u);
    assert.match(html, /Communications provider/u);
    assert.match(html, /NOT_CONNECTED/u);
    assert.doesNotMatch(
      html,
      /DATABASE_URL|BETTER_AUTH_SECRET|postgresql:\/\/|leaseToken|tokenJtiHash/iu,
    );
  });
});

async function signUp(label: string): Promise<Actor> {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    body: JSON.stringify({
      email: `${marker}-${label}@rezno.invalid`,
      name: label,
      password: "password123",
    }),
    headers: { "content-type": "application/json", origin: baseUrl! },
    method: "POST",
  });
  if (response.status !== 200) {
    throw new Error(`Sign-up failed with ${response.status}: ${await response.text()}`);
  }
  const payload = await response.json() as { user: { id: string } };
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.includes("session_token="));
  assert.ok(cookie);
  const person = await prisma.person.update({
    where: { authUserId: payload.user.id },
    data: { isOnboarded: true, status: "ACTIVE" },
  });
  return {
    cookie: cookie.split(";", 1)[0]!,
    personId: person.id,
    userId: payload.user.id,
  };
}

async function request(path: string, options: {
  authorization?: string;
  body?: string | Record<string, unknown>;
  contentType?: string;
  cookie?: string;
  method?: string;
} = {}) {
  const body = typeof options.body === "string"
    ? options.body
    : options.body === undefined
      ? undefined
      : JSON.stringify(options.body);
  const response = await fetch(`${baseUrl}${path}`, {
    body,
    headers: {
      ...(body === undefined
        ? {}
        : { "content-type": options.contentType ?? "application/json" }),
      ...(options.authorization
        ? { authorization: options.authorization }
        : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    method: options.method ?? "GET",
    redirect: "manual",
  });
  const payload = (response.headers.get("content-type") ?? "")
    .startsWith("application/json")
    ? await response.json() as Record<string, unknown>
    : { text: await response.text() };
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.doesNotMatch(
    JSON.stringify(payload),
    /postgresql:\/\/|DATABASE_URL|BETTER_AUTH_SECRET|PrismaClient|node_modules|leaseToken|tokenJtiHash|workflowRefHash|raw-provider-secret/iu,
  );
  return { payload, response };
}

async function createAlert(actor: Actor, label: string) {
  const now = new Date();
  const alert = await prisma.platformAlert.create({
    data: {
      deduplicationKey:
        `platform:http_${label}_${randomUUID().replaceAll("-", "")}`,
      domain: "PLATFORM",
      firstObservedAt: now,
      lastObservedAt: now,
      observation: { count: 1, saturated: false },
      rule: "OVERDUE_JOBS",
      severity: "WARNING",
      summaryCode: "platform_jobs_overdue",
    },
  });
  await prisma.platformAlertHistory.create({
    data: {
      actorAdminUserId: actor.userId,
      actorPersonId: actor.personId,
      alertId: alert.id,
      event: "OPENED",
      fromState: null,
      metadata: { source: "http_fixture" },
      source: "ADMIN",
      toState: "OPEN",
    },
  });
  return alert;
}

async function cleanupOperations() {
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`
      ALTER TABLE "PlatformOperationMutation"
      DISABLE TRIGGER "PlatformOperationMutation_append_only"
    `);
    await transaction.$executeRaw(Prisma.sql`
      ALTER TABLE "PlatformIncidentHistory"
      DISABLE TRIGGER "PlatformIncidentHistory_append_only"
    `);
    await transaction.$executeRaw(Prisma.sql`
      ALTER TABLE "PlatformAlertHistory"
      DISABLE TRIGGER "PlatformAlertHistory_append_only"
    `);
    await transaction.platformOperationMutation.deleteMany();
    await transaction.platformIncidentHistory.deleteMany();
    await transaction.platformAlertHistory.deleteMany();
    await transaction.$executeRaw(Prisma.sql`
      ALTER TABLE "PlatformOperationMutation"
      ENABLE TRIGGER "PlatformOperationMutation_append_only"
    `);
    await transaction.$executeRaw(Prisma.sql`
      ALTER TABLE "PlatformIncidentHistory"
      ENABLE TRIGGER "PlatformIncidentHistory_append_only"
    `);
    await transaction.$executeRaw(Prisma.sql`
      ALTER TABLE "PlatformAlertHistory"
      ENABLE TRIGGER "PlatformAlertHistory_append_only"
    `);
  });
  await prisma.platformIncident.deleteMany();
  await prisma.platformAlert.deleteMany();
  await prisma.platformRuntimeInvocation.deleteMany();
  await prisma.platformRuntimeControl.deleteMany();
  await prisma.distributedRateLimitBucket.deleteMany();
  await prisma.platformJobMutation.deleteMany();
  await prisma.platformJobAttempt.deleteMany();
  await prisma.platformJob.deleteMany({ where: { parentJobId: { not: null } } });
  await prisma.platformJob.deleteMany();
  await prisma.platformJobSchedule.deleteMany();
}

function assertError(
  result: Awaited<ReturnType<typeof request>>,
  status: number,
  code: string,
) {
  assert.equal(result.response.status, status, JSON.stringify(result.payload));
  assert.equal(
    (result.payload.error as { code?: string } | undefined)?.code,
    code,
  );
}
