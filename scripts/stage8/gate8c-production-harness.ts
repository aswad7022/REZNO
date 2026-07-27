import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

export interface Gate8cProductionAttestation {
  schemaVersion: 1;
  gitSha: string;
  buildId: string;
  buildCommand: readonly string[];
  startCommand: readonly string[];
  nodeEnv: "production";
  pid: number;
  port: number;
  hostname: "127.0.0.1";
  startedAt: string;
  ownedByHarness: true;
  ownershipCheck: "spawned-child-alive-and-exclusive-port";
  buildFiles: Record<string, string>;
  captureScriptSha256: string;
  harnessScriptSha256: string;
  integritySha256: string;
}

export interface Gate8cProductionHarness {
  attestation: Gate8cProductionAttestation;
  baseUrl: string;
  assertOwnedResponder(): Promise<void>;
  stop(): Promise<void>;
}

interface AttestationExpectations {
  gitSha: string;
  buildId: string;
  ownerPid?: number;
  captureScriptSha256?: string;
  harnessScriptSha256?: string;
}

const repoRoot = path.resolve(import.meta.dirname, "../..");
const nextCliPath = path.join(repoRoot, "node_modules/next/dist/bin/next");
const buildAttestationPath = path.join(
  repoRoot,
  ".next/gate8c-build-attestation.json",
);
const deterministicAuthMaterial = createHash("sha256")
  .update("rezno-gate8c-disposable-production-harness-v1")
  .digest("base64url");

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

export function gate8cCanonicalJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

export function gate8cSha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function attestationPayload(
  attestation: Omit<Gate8cProductionAttestation, "integritySha256">,
) {
  return gate8cCanonicalJson(attestation);
}

export function sealGate8cProductionAttestation(
  attestation: Omit<Gate8cProductionAttestation, "integritySha256">,
): Gate8cProductionAttestation {
  return {
    ...attestation,
    integritySha256: gate8cSha256(attestationPayload(attestation)),
  };
}

export function validateGate8cProductionAttestation(
  attestation: Gate8cProductionAttestation,
  expected: AttestationExpectations,
) {
  if (attestation.schemaVersion !== 1) {
    throw new Error("Production attestation schema is unsupported.");
  }
  if (attestation.gitSha !== expected.gitSha) {
    throw new Error("Production build commit does not match the reviewed commit.");
  }
  if (attestation.buildId !== expected.buildId) {
    throw new Error("Production BUILD_ID does not match the captured build.");
  }
  if (
    attestation.nodeEnv !== "production" ||
    attestation.startCommand.includes("dev") ||
    !attestation.startCommand.includes("start")
  ) {
    throw new Error("Visual evidence was not served by next start in production.");
  }
  if (
    attestation.hostname !== "127.0.0.1" ||
    !Number.isInteger(attestation.port) ||
    attestation.port < 1024 ||
    !Number.isInteger(attestation.pid) ||
    attestation.pid < 1 ||
    attestation.ownedByHarness !== true ||
    attestation.ownershipCheck !== "spawned-child-alive-and-exclusive-port"
  ) {
    throw new Error("Production server ownership attestation is invalid.");
  }
  if (expected.ownerPid !== undefined && attestation.pid !== expected.ownerPid) {
    throw new Error("Production server PID is not owned by this capture harness.");
  }
  if (
    expected.captureScriptSha256 &&
    attestation.captureScriptSha256 !== expected.captureScriptSha256
  ) {
    throw new Error("Capture script hash does not match the attested source.");
  }
  if (
    expected.harnessScriptSha256 &&
    attestation.harnessScriptSha256 !== expected.harnessScriptSha256
  ) {
    throw new Error("Production harness hash does not match the attested source.");
  }
  for (const required of [
    ".next/BUILD_ID",
    ".next/app-path-routes-manifest.json",
    ".next/build-manifest.json",
  ]) {
    if (!/^[a-f0-9]{64}$/.test(attestation.buildFiles[required] ?? "")) {
      throw new Error(`Production attestation is missing build hash: ${required}`);
    }
  }
  const { integritySha256, ...unsigned } = attestation;
  if (gate8cSha256(attestationPayload(unsigned)) !== integritySha256) {
    throw new Error("Production attestation integrity hash is invalid.");
  }
}

async function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `${command} ${args.join(" ")} failed (${signal ?? code ?? "unknown"}).`,
          ),
        );
      }
    });
  });
}

async function reservePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function gitSha() {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "inherit"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0 && /^[a-f0-9]{40}$/.test(output.trim())) {
        resolve(output.trim());
      } else {
        reject(new Error("Unable to resolve the source Git SHA."));
      }
    });
  });
}

async function assertCleanSourceTree() {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all"],
      {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "inherit"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error("Unable to verify the Gate 8C source tree."));
      } else if (output.trim()) {
        reject(
          new Error(
            "Gate 8C production evidence requires a clean committed source tree.",
          ),
        );
      } else {
        resolve();
      }
    });
  });
}

async function fileHash(relativePath: string) {
  return gate8cSha256(await readFile(path.join(repoRoot, relativePath)));
}

async function waitForProductionServer(
  child: ChildProcess,
  baseUrl: string,
  timeoutMs = 60_000,
) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Owned Next.js production server exited before capture.");
    }
    try {
      const response = await fetch(baseUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status > 0) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(
    `Owned Next.js production server did not become ready: ${
      lastError instanceof Error ? lastError.message : "timeout"
    }`,
  );
}

async function stopChild(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) =>
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
        resolve();
      }, 10_000),
    ),
  ]);
}

export async function startGate8cProductionHarness(): Promise<Gate8cProductionHarness> {
  assert.equal(
    process.env.GATE8C_VISUAL_BASE_URL,
    undefined,
    "External Gate 8C localhost servers are forbidden; the harness owns next start.",
  );
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL for a disposable test database is required.",
  );
  await assertCleanSourceTree();

  const port = await reservePort();
  const hostname = "127.0.0.1" as const;
  const baseUrl = `http://${hostname}:${port}`;
  const sourceGitSha = await gitSha();
  const buildCommand = ["npm", "run", "build"] as const;
  const startCommand = [
    process.execPath,
    nextCliPath,
    "start",
    "--hostname",
    hostname,
    "--port",
    String(port),
  ] as const;
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    BETTER_AUTH_SECRET: deterministicAuthMaterial,
    BETTER_AUTH_URL: baseUrl,
    NEXT_PUBLIC_APP_URL: baseUrl,
    NODE_ENV: "production",
    REZNO_ADMIN_EMAILS: "visual-fixture-admin@fixtures.example",
  };

  await runCommand(buildCommand[0], [...buildCommand.slice(1)], environment);
  const buildId = (await readFile(path.join(repoRoot, ".next/BUILD_ID"), "utf8"))
    .trim();
  assert.ok(buildId, "Next.js production build did not produce BUILD_ID.");

  const buildFiles = Object.fromEntries(
    await Promise.all(
      [
        ".next/BUILD_ID",
        ".next/app-path-routes-manifest.json",
        ".next/build-manifest.json",
      ].map(async (relativePath) => [relativePath, await fileHash(relativePath)]),
    ),
  );
  const captureScriptSha256 = await fileHash(
    "scripts/stage8/capture-gate8c-baselines.ts",
  );
  const harnessScriptSha256 = await fileHash(
    "scripts/stage8/gate8c-production-harness.ts",
  );
  await writeFile(
    buildAttestationPath,
    `${JSON.stringify(
      {
        buildId,
        buildFiles,
        captureScriptSha256,
        gitSha: sourceGitSha,
        harnessScriptSha256,
        nodeEnv: "production",
      },
      null,
      2,
    )}\n`,
  );

  const startedAt = new Date().toISOString();
  const child: ChildProcess = spawn(
    startCommand[0],
    [...startCommand.slice(1)],
    {
      cwd: repoRoot,
      env: environment,
      stdio: "inherit",
    },
  );
  assert.ok(child.pid, "Next.js production child PID was not created.");
  try {
    await waitForProductionServer(child, baseUrl);
    const assertOwnedResponder = async () => {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error("Owned Next.js production server is no longer running.");
      }
      process.kill(child.pid!, 0);
      const response = await fetch(
        `${baseUrl}/gate8c-owned-production-probe`,
        {
          redirect: "manual",
          signal: AbortSignal.timeout(5_000),
        },
      );
      if (response.status < 1) {
        throw new Error("Owned Next.js production server did not answer its port.");
      }
    };
    await assertOwnedResponder();
    const attestation = sealGate8cProductionAttestation({
      schemaVersion: 1,
      gitSha: sourceGitSha,
      buildId,
      buildCommand,
      startCommand,
      nodeEnv: "production",
      pid: child.pid,
      port,
      hostname,
      startedAt,
      ownedByHarness: true,
      ownershipCheck: "spawned-child-alive-and-exclusive-port",
      buildFiles,
      captureScriptSha256,
      harnessScriptSha256,
    });
    validateGate8cProductionAttestation(attestation, {
      buildId,
      captureScriptSha256,
      gitSha: sourceGitSha,
      harnessScriptSha256,
      ownerPid: child.pid,
    });
    return {
      attestation,
      baseUrl,
      assertOwnedResponder,
      stop: async () => stopChild(child),
    };
  } catch (error) {
    await stopChild(child);
    throw error;
  }
}

export function gate8cVisualAuthMaterial() {
  return deterministicAuthMaterial;
}
