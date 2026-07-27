import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  sha256,
  type Gate8dProductionAttestation,
} from "./gate8d-visual-evidence";
import { gate8cVisualAuthMaterial } from "./gate8c-production-harness";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const nextCli = path.join(repoRoot, "node_modules/next/dist/bin/next");

async function run(
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: environment,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed (${code ?? signal})`));
    });
  });
}

async function git(...args: string[]) {
  return await new Promise<string>((resolve, reject) => {
    let output = "";
    const child = spawn("git", args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    let error = "";
    child.stderr.on("data", (chunk) => {
      error += String(chunk);
    });
    child.once("exit", (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(error || `git ${args.join(" ")} failed`));
    });
  });
}

async function reservePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function fileSha(relativePath: string) {
  return sha256(await readFile(path.join(repoRoot, relativePath)));
}

async function waitForServer(child: ChildProcess, baseUrl: string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Owned production server exited before readiness.");
    }
    try {
      const response = await fetch(baseUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status > 0) return;
    } catch {
      // The exclusive port is not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Owned production server did not become ready.");
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) =>
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
        resolve();
      }, 5_000),
    ),
  ]);
}

export interface Gate8dProductionHarness {
  baseUrl: string;
  attestation: Gate8dProductionAttestation;
  assertOwnedResponder(): Promise<void>;
  stop(): Promise<void>;
}

export async function startGate8dProductionHarness(): Promise<Gate8dProductionHarness> {
  const status = await git("status", "--porcelain", "--untracked-files=all");
  assert.equal(
    status,
    "",
    "Gate 8D capture refuses a dirty source tree. Commit source before capture.",
  );
  const sourceSha = await git("rev-parse", "HEAD");
  const port = await reservePort();
  const hostname = "127.0.0.1" as const;
  const baseUrl = `http://${hostname}:${port}`;
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    BETTER_AUTH_SECRET: gate8cVisualAuthMaterial(),
    BETTER_AUTH_URL: baseUrl,
    NEXT_PUBLIC_APP_URL: baseUrl,
    REZNO_ADMIN_EMAILS: "visual-fixture-admin@fixtures.example",
  };
  const buildCommand = ["npm", "run", "build"] as const;
  await run(buildCommand[0], [...buildCommand.slice(1)], environment);
  const buildId = (
    await readFile(path.join(repoRoot, ".next/BUILD_ID"), "utf8")
  ).trim();
  assert.ok(buildId);
  const startCommand = [
    process.execPath,
    nextCli,
    "start",
    "--hostname",
    hostname,
    "--port",
    String(port),
  ] as const;
  const child = spawn(startCommand[0], [...startCommand.slice(1)], {
    cwd: repoRoot,
    env: environment,
    stdio: "inherit",
  });
  assert.ok(child.pid);
  try {
    await waitForServer(child, baseUrl);
    const assertOwnedResponder = async () => {
      assert.equal(child.exitCode, null);
      process.kill(child.pid!, 0);
      const response = await fetch(baseUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(3_000),
      });
      assert.ok(response.status > 0);
    };
    await assertOwnedResponder();
    const attestation: Gate8dProductionAttestation = {
      schemaVersion: 1,
      gitSha: sourceSha,
      buildId,
      nodeEnv: "production",
      hostname,
      port,
      pid: child.pid,
      ownedByHarness: true,
      buildCommand,
      startCommand,
      captureScriptSha256: await fileSha(
        "scripts/stage8/capture-gate8d-baselines.ts",
      ),
      harnessScriptSha256: await fileSha(
        "scripts/stage8/gate8d-production-harness.ts",
      ),
      buildManifestSha256: await fileSha(".next/build-manifest.json"),
    };
    return {
      baseUrl,
      attestation,
      assertOwnedResponder,
      stop: async () => stop(child),
    };
  } catch (error) {
    await stop(child);
    throw error;
  }
}

export function validateGate8dAttestation(
  attestation: Gate8dProductionAttestation,
  expected: {
    gitSha: string;
    captureScriptSha256: string;
    harnessScriptSha256: string;
  },
) {
  assert.equal(attestation.nodeEnv, "production");
  assert.equal(attestation.hostname, "127.0.0.1");
  assert.equal(attestation.ownedByHarness, true);
  assert.deepEqual(attestation.buildCommand, ["npm", "run", "build"]);
  assert.match(attestation.buildId, /^[A-Za-z0-9_-]+$/);
  assert.equal(attestation.gitSha, expected.gitSha);
  assert.equal(attestation.captureScriptSha256, expected.captureScriptSha256);
  assert.equal(attestation.harnessScriptSha256, expected.harnessScriptSha256);
  assert.match(attestation.buildManifestSha256, /^[a-f0-9]{64}$/);
  assert.ok(attestation.pid > 0 && attestation.port > 0);
}
