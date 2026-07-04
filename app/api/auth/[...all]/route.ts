import { auth } from "@/lib/auth/auth";
import {
  consumeRateLimit,
  getRequestRateLimitIdentifierFromHeaders,
} from "@/lib/security/rate-limit";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

export async function POST(request: Request) {
  const identifier = getRequestRateLimitIdentifierFromHeaders(request.headers);
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
