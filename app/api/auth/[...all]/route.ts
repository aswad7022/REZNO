import { auth } from "@/lib/auth/auth";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { toNextJsHandler } from "better-auth/next-js";
import { createHash, randomUUID } from "node:crypto";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

export async function POST(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const fingerprint = [
    request.headers.get("user-agent"),
    request.headers.get("accept-language"),
    request.headers.get("accept-encoding"),
  ]
    .filter(Boolean)
    .join("|");
  const identifier =
    forwardedFor ||
    realIp ||
    (fingerprint
      ? `fingerprint:${createHash("sha256").update(fingerprint).digest("hex")}`
      : `request:${randomUUID()}`);
  const rateLimit = consumeRateLimit("auth:post", identifier, {
    limit: 30,
    windowMs: 60_000,
  });

  if (!rateLimit.success) {
    return Response.json(
      { message: "Too many requests. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  return handlers.POST(request);
}
