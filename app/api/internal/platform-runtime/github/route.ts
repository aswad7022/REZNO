import { PlatformJobDomainError } from "@/features/platform-jobs/domain/errors";
import { readBoundedPlatformJobJson } from "@/features/platform-jobs/api/validation";
import {
  RuntimeIdentityError,
  verifyGitHubRuntimeIdentity,
} from "@/features/platform-operations/services/github-oidc";
import {
  PlatformRuntimeError,
  runPlatformRuntimeCycle,
} from "@/features/platform-operations/services/runtime";
import { logServerError } from "@/lib/logging/server";
import { NextResponse } from "next/server";

export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

export async function POST(request: Request) {
  try {
    const identity = await verifyGitHubRuntimeIdentity(
      request.headers.get("authorization"),
    );
    const body = await readBoundedPlatformJobJson(request);
    if (
      !body
      || typeof body !== "object"
      || Array.isArray(body)
      || Object.keys(body).length !== 1
      || !("version" in body)
      || body.version !== 1
    ) {
      return failure("INVALID_REQUEST", 400);
    }
    const result = await runPlatformRuntimeCycle(identity);
    return NextResponse.json(
      {
        data: {
          invocationId: result.invocationId,
          state: result.state,
        },
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof RuntimeIdentityError) {
      return failure(
        error.code,
        error.code === "INVALID_IDENTITY" ? 401 : 503,
      );
    }
    if (error instanceof PlatformRuntimeError) {
      return failure(error.code, error.status);
    }
    if (error instanceof PlatformJobDomainError) {
      return failure(
        error.code === "STALE_LEASE" ? "RUNTIME_BUSY" : "RUNTIME_FAILED",
        error.code === "STALE_LEASE" ? 409 : 503,
      );
    }
    logServerError("platformRuntime.github", error);
    return failure("RUNTIME_FAILED", 503);
  }
}

function failure(code: string, status: number) {
  return NextResponse.json(
    {
      error: {
        code,
        message: "The automatic platform runtime request was not accepted.",
      },
    },
    {
      headers: {
        ...NO_STORE,
        ...(status === 503 ? { "Retry-After": "60" } : {}),
      },
      status,
    },
  );
}
