import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "../../../lib/db/prisma";

const baseUrl =
  process.env.PUSH_HTTP_BASE_URL
  ?? process.env.NOTIFICATION_HTTP_BASE_URL
  ?? process.env.COMMERCE_HTTP_BASE_URL;
const receiptSecret = process.env.REZNO_PUSH_RECEIPT_HMAC_SECRET ?? "";
const marker = `gate7d-http-${randomUUID().slice(0, 8)}`;

test("Gate 7D production mobile registration and signed receipt routes fail closed", {
  concurrency: false,
}, async (t) => {
  assert.ok(baseUrl, "PUSH_HTTP_BASE_URL is required; this test must not be skipped.");
  assert.ok(
    receiptSecret.length >= 32,
    "REZNO_PUSH_RECEIPT_HMAC_SECRET is required.",
  );
  const ownerA = await signUp("owner-a");
  const ownerB = await signUp("owner-b");
  const installationId = randomUUID();
  const installationSecret = "A".repeat(43);
  const registration = {
    appVersion: "1.0.0",
    installationId,
    installationSecret,
    operationGeneration: 1,
    permissionStatus: "GRANTED",
    platform: "ANDROID",
    provider: "FCM",
    token: "fcm-http-token-12345678901234567890",
  };
  t.after(async () => {
    await prisma.person.deleteMany({
      where: { authUserId: { in: [ownerA.userId, ownerB.userId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [ownerA.userId, ownerB.userId] } } });
    await prisma.$disconnect();
  });

  const unauthenticated = await jsonRequest(
    "/api/mobile/notifications/device",
    { body: registration, idempotencyKey: randomUUID(), method: "PUT" },
  );
  assert.equal(unauthenticated.response.status, 401);

  const idempotencyKey = randomUUID();
  const created = await jsonRequest(
    "/api/mobile/notifications/device",
    {
      body: registration,
      cookie: ownerA.cookie,
      idempotencyKey,
      method: "PUT",
    },
  );
  assert.equal(created.response.status, 200);
  assert.equal((created.body.data as Record<string, unknown>).status, "ACTIVE");
  assert.equal(JSON.stringify(created.body).includes(registration.token), false);
  const replay = await jsonRequest(
    "/api/mobile/notifications/device",
    {
      body: registration,
      cookie: ownerA.cookie,
      idempotencyKey,
      method: "PUT",
    },
  );
  assert.equal(replay.response.status, 200);
  assert.equal((replay.body.data as Record<string, unknown>).replayed, true);

  const switched = await jsonRequest(
    "/api/mobile/notifications/device",
    {
      body: { ...registration, operationGeneration: 2 },
      cookie: ownerB.cookie,
      idempotencyKey: randomUUID(),
      method: "PUT",
    },
  );
  assert.equal(switched.response.status, 200);
  const staleOwner = await jsonRequest(
    "/api/mobile/notifications/device",
    {
      body: { installationId, installationSecret, operationGeneration: 3 },
      cookie: ownerA.cookie,
      idempotencyKey: randomUUID(),
      method: "DELETE",
    },
  );
  assert.equal(staleOwner.response.status, 403);

  const invalidReceipt = await receiptRequest({
    events: [{
      eventId: "gate7d-invalid-signature",
      occurredAt: new Date().toISOString(),
      providerMessageId: "unknown-message",
      safeCode: "FCM_UNKNOWN",
      status: "PERMANENT_FAILURE",
    }],
    provider: "FCM",
  }, "v1=".padEnd(67, "0"));
  assert.equal(invalidReceipt.response.status, 401);

  const validReceiptBody = {
    events: [{
      eventId: `gate7d-${randomUUID()}`,
      occurredAt: new Date().toISOString(),
      providerMessageId: "unknown-message",
      safeCode: "FCM_UNKNOWN",
      status: "PERMANENT_FAILURE",
    }],
    provider: "FCM",
  };
  const acceptedReceipt = await receiptRequest(validReceiptBody);
  assert.equal(acceptedReceipt.response.status, 200);
  assert.equal(
    ((acceptedReceipt.body.data as Record<string, unknown>).unknown),
    1,
  );
  const replayedReceipt = await receiptRequest(validReceiptBody);
  assert.equal(replayedReceipt.response.status, 200);
  assert.equal(
    ((replayedReceipt.body.data as Record<string, unknown>).replayed),
    1,
  );

  const revoked = await jsonRequest(
    "/api/mobile/notifications/device",
    {
      body: { installationId, installationSecret, operationGeneration: 4 },
      cookie: ownerB.cookie,
      idempotencyKey: randomUUID(),
      method: "DELETE",
    },
  );
  assert.equal(revoked.response.status, 200);
  assert.equal((revoked.body.data as Record<string, unknown>).revoked, true);
});

async function signUp(label: string) {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    body: JSON.stringify({
      email: `${marker}-${label}@rezno.invalid`,
      name: label,
      password: "password123",
    }),
    headers: { "content-type": "application/json", origin: baseUrl! },
    method: "POST",
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { user: { id: string } };
  const cookie = response.headers.getSetCookie()
    .find((value) => value.includes("session_token="))
    ?.split(";")[0];
  assert.ok(cookie);
  await prisma.person.update({
    where: { authUserId: body.user.id },
    data: { isOnboarded: true, status: "ACTIVE" },
  });
  return { cookie, userId: body.user.id };
}

async function jsonRequest(path: string, options: {
  body: unknown;
  cookie?: string;
  idempotencyKey: string;
  method: string;
}) {
  const response = await fetch(`${baseUrl}${path}`, {
    body: JSON.stringify(options.body),
    headers: {
      "content-type": "application/json",
      "idempotency-key": options.idempotencyKey,
      origin: baseUrl!,
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    method: options.method,
  });
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  return {
    body: await response.json() as Record<string, unknown>,
    response,
  };
}

async function receiptRequest(body: unknown, suppliedSignature?: string) {
  const serialized = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = suppliedSignature ?? `v1=${createHmac("sha256", receiptSecret)
    .update(timestamp)
    .update(".")
    .update(serialized)
    .digest("hex")}`;
  const response = await fetch(`${baseUrl}/api/internal/push/receipts/fcm`, {
    body: serialized,
    headers: {
      "content-type": "application/json",
      "x-rezno-push-signature": signature,
      "x-rezno-push-timestamp": timestamp,
    },
    method: "POST",
  });
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  return {
    body: await response.json() as Record<string, unknown>,
    response,
  };
}
