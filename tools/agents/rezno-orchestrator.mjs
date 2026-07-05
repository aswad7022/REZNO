#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APPROVED_FILES = new Set([
  "docs/ops/agentic-delivery-system.md",
  "docs/ops/cto-delegation-policy.md",
  "docs/ops/agent-roles.md",
  "tools/agents/rezno-orchestrator.mjs",
  "tools/agents/README.md",
]);

const RISK_RULES = [
  {
    name: "database",
    patterns: [/^prisma\//, /^db\//, /^database\//, /(^|\/)(db|database)\./],
  },
  {
    name: "schema",
    patterns: [/^prisma\/schema\.prisma$/, /(^|\/)schema\.(ts|js|json|prisma)$/],
  },
  {
    name: "migrations",
    patterns: [/^prisma\/migrations\//, /(^|\/)migrations\//, /\.sql$/],
  },
  {
    name: "auth",
    patterns: [/auth/i, /^app\/\(auth\)\//, /^lib\/auth\//, /^features\/identity\//],
  },
  {
    name: "permissions",
    patterns: [/permission/i, /rbac/i, /access/i, /^features\/admin\//, /^app\/admin\//],
  },
  {
    name: "secrets",
    patterns: [/(^|\/)\.env/, /secret/i, /token/i, /password/i, /\.(pem|key|p12|pfx)$/],
  },
  {
    name: "production deployment",
    patterns: [/^vercel\.json$/, /^\.github\/workflows\//, /^Dockerfile$/, /^docker-compose/, /deploy/i],
  },
  {
    name: "payments",
    patterns: [/payment/i, /stripe/i, /zaincash/i, /checkout/i],
  },
  {
    name: "package changes",
    patterns: [/(^|\/)package\.json$/, /(^|\/)package-lock\.json$/, /(^|\/)pnpm-lock\.yaml$/, /(^|\/)yarn\.lock$/],
  },
];

function runGit(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function repoRoot() {
  return runGit(["rev-parse", "--show-toplevel"]);
}

function normalizePath(path) {
  return path.replaceAll("\\", "/").replace(/^"\s*/, "").replace(/\s*"$/, "");
}

function parsePorcelainLine(line) {
  const rawPath = line.slice(3).trim();
  const renameArrow = " -> ";
  const path = rawPath.includes(renameArrow) ? rawPath.split(renameArrow).at(-1) : rawPath;
  return normalizePath(path);
}

function expandUntrackedDirectory(root, status, path) {
  if (status !== "??" || !path.endsWith("/")) {
    return [{ status, path }];
  }

  const absolutePath = resolve(root, path);
  let stats;

  try {
    stats = statSync(absolutePath);
  } catch {
    return [{ status, path }];
  }

  if (!stats.isDirectory()) {
    return [{ status, path }];
  }

  const files = [];

  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (entry.isFile()) {
        files.push({
          status,
          path: normalizePath(relative(root, entryPath)),
        });
      }
    }
  }

  walk(absolutePath);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function workingTreeEntries() {
  const output = runGit(["status", "--porcelain=v1"]);
  if (!output) {
    return [];
  }

  const root = repoRoot();

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      const status = line.slice(0, 2);
      const path = parsePorcelainLine(line);
      return expandUntrackedDirectory(root, status, path);
    });
}

function changedFiles() {
  return [...new Set(workingTreeEntries().map((entry) => entry.path))].sort();
}

function detectRisks(paths) {
  const risks = new Map();

  for (const path of paths) {
    for (const rule of RISK_RULES) {
      if (rule.patterns.some((pattern) => pattern.test(path))) {
        if (!risks.has(rule.name)) {
          risks.set(rule.name, []);
        }
        risks.get(rule.name).push(path);
      }
    }
  }

  return risks;
}

function isOnlyApprovedFiles(paths) {
  return paths.length > 0 && paths.every((path) => APPROVED_FILES.has(path));
}

function decisionFor(paths, risks) {
  if (risks.size > 0) {
    return {
      label: "DO NOT MERGE",
      reason: "Forbidden or high-risk categories were detected in changed files.",
    };
  }

  if (paths.length === 0) {
    return {
      label: "APPROVE",
      reason: "Working tree is clean. No delivery risk detected.",
    };
  }

  if (isOnlyApprovedFiles(paths)) {
    return {
      label: "APPROVE",
      reason: "Only approved Agentic Delivery System docs/tools files are changed.",
    };
  }

  return {
    label: "NEEDS QA GATE",
    reason: "Changed files are outside the approved docs/tools-only scope.",
  };
}

function printStatus() {
  const root = repoRoot();
  const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)));
  const relativeScriptPath = relative(root, scriptPath).replaceAll("\\", "/");
  const branch = runGit(["branch", "--show-current"]) || "(detached HEAD)";
  const latestCommit = runGit(["log", "-1", "--oneline"]);
  const entries = workingTreeEntries();
  const paths = changedFiles();
  const risks = detectRisks(paths);
  const decision = decisionFor(paths, risks);

  console.log("REZNO Agentic Delivery System Status");
  console.log("");
  console.log(`Repository root: ${root}`);
  console.log(`Tool path: ${relativeScriptPath}`);
  console.log(`Current branch: ${branch}`);
  console.log(`Latest commit: ${latestCommit}`);
  console.log("");
  console.log("Working tree status:");
  if (entries.length === 0) {
    console.log("- clean");
  } else {
    for (const entry of entries) {
      console.log(`- ${entry.status} ${entry.path}`);
    }
  }
  console.log("");
  console.log("Risk categories detected:");
  if (risks.size === 0) {
    console.log("- none");
  } else {
    for (const [risk, riskPaths] of risks.entries()) {
      console.log(`- ${risk}: ${[...new Set(riskPaths)].join(", ")}`);
    }
  }
  console.log("");
  console.log("CTO-style decision report:");
  console.log(`Decision: ${decision.label}`);
  console.log(`Reason: ${decision.reason}`);
  console.log("Merge policy: no merge without explicit CTO approval.");
}

function printHandoff() {
  console.log(`Codex handoff prompt:

You are continuing REZNO work under the Agentic Delivery System MVP.

Start by reading:
- docs/ops/agentic-delivery-system.md
- docs/ops/cto-delegation-policy.md
- docs/ops/agent-roles.md

Then run:
- node tools/agents/rezno-orchestrator.mjs status

Follow the safe workflow:
1. Plan the requested task.
2. Execute only the approved scope.
3. Run QA and validation.
4. Review security risks.
5. Prepare release review.
6. Update memory only after the sprint is closed.

Use only these CTO decision labels:
- APPROVE
- APPROVE AFTER SMALL FIX
- NEEDS QA GATE
- DO NOT MERGE

Escalate immediately for database, schema, migrations, auth, permissions, secrets, production deployment, payments, package changes, failed checks, merge conflicts, or scope expansion.

Do not merge without explicit CTO approval.`);
}

function main() {
  const command = process.argv[2];

  if (command === "status") {
    printStatus();
    return;
  }

  if (command === "handoff") {
    printHandoff();
    return;
  }

  console.error("Usage: node tools/agents/rezno-orchestrator.mjs <status|handoff>");
  process.exitCode = 1;
}

main();
