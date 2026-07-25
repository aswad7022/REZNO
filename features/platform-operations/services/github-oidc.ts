import "server-only";

import { createHash } from "node:crypto";

import {
  createRemoteJWKSet,
  errors as joseErrors,
  jwtVerify,
  type JWTPayload,
} from "jose";

const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_JWKS = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks"),
);
const EXPECTED_AUDIENCE = "rezno-platform-runtime";
const EXPECTED_REPOSITORY = "aswad7022/REZNO";
const EXPECTED_REPOSITORY_ID = "1287643453";
const EXPECTED_REF = "refs/heads/main";
const EXPECTED_WORKFLOW_REF =
  "aswad7022/REZNO/.github/workflows/platform-runtime.yml@refs/heads/main";
const EXPECTED_SUBJECT = "repo:aswad7022/REZNO:ref:refs/heads/main";

export interface VerifiedGitHubRuntimeIdentity {
  eventName: "schedule";
  gitRefHash: string;
  repositorySha: string;
  requestedAt: Date;
  tokenJtiHash: string;
  workflowRefHash: string;
}

export class RuntimeIdentityError extends Error {
  constructor(readonly code: "INVALID_IDENTITY" | "IDENTITY_UNAVAILABLE") {
    super(
      code === "INVALID_IDENTITY"
        ? "The automatic runtime identity is invalid."
        : "The automatic runtime identity could not be verified.",
    );
    this.name = "RuntimeIdentityError";
  }
}

export async function verifyGitHubRuntimeIdentity(
  authorization: string | null,
): Promise<VerifiedGitHubRuntimeIdentity> {
  const token = bearerToken(authorization);
  try {
    const verified = await jwtVerify(token, GITHUB_JWKS, {
      algorithms: ["RS256"],
      audience: EXPECTED_AUDIENCE,
      clockTolerance: 5,
      issuer: GITHUB_ISSUER,
      maxTokenAge: "10 minutes",
    });
    return validateGitHubRuntimeClaims(verified.payload);
  } catch (error) {
    if (error instanceof RuntimeIdentityError) throw error;
    if (
      error instanceof joseErrors.JOSEError
      && !["ERR_JWKS_TIMEOUT", "ERR_JWKS_FETCH_FAILED"].includes(error.code)
    ) {
      throw new RuntimeIdentityError("INVALID_IDENTITY");
    }
    throw new RuntimeIdentityError("IDENTITY_UNAVAILABLE");
  }
}

export function validateGitHubRuntimeClaims(
  payload: JWTPayload,
  environment: NodeJS.ProcessEnv = process.env,
): VerifiedGitHubRuntimeIdentity {
  const workflowRef = stringClaim(payload, "workflow_ref");
  const gitRef = stringClaim(payload, "ref");
  const repositorySha = stringClaim(payload, "sha");
  const jti = typeof payload.jti === "string" ? payload.jti : "";
  const eventName = stringClaim(payload, "event_name");
  if (
    payload.sub !== EXPECTED_SUBJECT
    || stringClaim(payload, "repository") !== EXPECTED_REPOSITORY
    || stringClaim(payload, "repository_id") !== EXPECTED_REPOSITORY_ID
    || workflowRef !== EXPECTED_WORKFLOW_REF
    || gitRef !== EXPECTED_REF
    || eventName !== "schedule"
    || !/^[0-9a-f]{40}$/.test(repositorySha)
    || !/^[A-Za-z0-9._:-]{8,160}$/.test(jti)
    || typeof payload.iat !== "number"
  ) {
    throw new RuntimeIdentityError("INVALID_IDENTITY");
  }
  const deployedSha = environment.VERCEL_GIT_COMMIT_SHA?.trim() ?? "";
  if (
    environment.NODE_ENV === "production"
    && !/^[0-9a-f]{40}$/.test(deployedSha)
  ) {
    throw new RuntimeIdentityError("IDENTITY_UNAVAILABLE");
  }
  if (deployedSha && deployedSha !== repositorySha) {
    throw new RuntimeIdentityError("INVALID_IDENTITY");
  }
  return {
    eventName: "schedule",
    gitRefHash: sha256(gitRef),
    repositorySha,
    requestedAt: new Date(payload.iat * 1_000),
    tokenJtiHash: sha256(jti),
    workflowRefHash: sha256(workflowRef),
  };
}

function bearerToken(value: string | null) {
  if (!value || value.length > 8_200 || !value.startsWith("Bearer ")) {
    throw new RuntimeIdentityError("INVALID_IDENTITY");
  }
  const token = value.slice("Bearer ".length);
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new RuntimeIdentityError("INVALID_IDENTITY");
  }
  return token;
}

function stringClaim(payload: JWTPayload, claim: string) {
  const value = payload[claim];
  return typeof value === "string" ? value : "";
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
