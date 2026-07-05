#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DECISIONS = {
  APPROVE: "APPROVE",
  APPROVE_AFTER_SMALL_FIX: "APPROVE AFTER SMALL FIX",
  NEEDS_QA_GATE: "NEEDS QA GATE",
  DO_NOT_MERGE: "DO NOT MERGE",
};

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

const RISKY_SCRIPT_TERMS = [
  /prisma/i,
  /migrate/i,
  /db\s*push/i,
  /deploy/i,
  /vercel/i,
  /\beas\b/i,
  /expo\s+publish/i,
  /seed/i,
  /reset/i,
  /drop/i,
  /rm\s+-rf/i,
];

function runGit(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function runCommand(command, args) {
  const spawnCommand = process.platform === "win32" && command.endsWith(".cmd") ? "cmd.exe" : command;
  const spawnArgs =
    process.platform === "win32" && command.endsWith(".cmd") ? ["/d", "/s", "/c", command, ...args] : args;
  const result = spawnSync(spawnCommand, spawnArgs, {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return {
    command: [command, ...args].join(" "),
    status: result.status ?? 1,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? result.error?.message ?? "").trim(),
  };
}

function repoRoot() {
  return runGit(["rev-parse", "--show-toplevel"]);
}

function normalizePath(path) {
  return path.replaceAll("\\", "/").replace(/^"\s*/, "").replace(/\s*"$/, "");
}

function parsePorcelainLine(line) {
  const rawPath = line.slice(2).trim();
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

function uniqueSorted(paths) {
  return [...new Set(paths)].sort((a, b) => a.localeCompare(b));
}

function workingTreeFiles() {
  return uniqueSorted(workingTreeEntries().map((entry) => entry.path));
}

function hasRef(ref) {
  try {
    runGit(["rev-parse", "--verify", "--quiet", ref]);
    return true;
  } catch {
    return false;
  }
}

function comparisonBase() {
  if (hasRef("origin/main")) {
    return "origin/main";
  }

  if (hasRef("main")) {
    return "main";
  }

  return "HEAD";
}

function committedDiffFiles(base = comparisonBase()) {
  if (base === "HEAD") {
    return [];
  }

  const output = runGit(["diff", "--name-only", `${base}...HEAD`]);
  if (!output) {
    return [];
  }

  return uniqueSorted(output.split(/\r?\n/).filter(Boolean).map(normalizePath));
}

function allReviewFiles(base = comparisonBase()) {
  return uniqueSorted([...workingTreeFiles(), ...committedDiffFiles(base)]);
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
      label: DECISIONS.DO_NOT_MERGE,
      reason: "Forbidden or high-risk categories were detected in changed files.",
    };
  }

  if (paths.length === 0) {
    return {
      label: DECISIONS.APPROVE,
      reason: "No changed files were detected.",
    };
  }

  if (isOnlyApprovedFiles(paths)) {
    return {
      label: DECISIONS.APPROVE,
      reason: "Only approved Agentic Delivery System docs/tools files are changed.",
    };
  }

  return {
    label: DECISIONS.NEEDS_QA_GATE,
    reason: "Changed files are outside the approved docs/tools-only scope.",
  };
}

function printList(title, values, emptyText = "none") {
  console.log(`${title}:`);
  if (values.length === 0) {
    console.log(`- ${emptyText}`);
    return;
  }

  for (const value of values) {
    console.log(`- ${value}`);
  }
}

function printRisks(risks) {
  console.log("Risk categories detected:");
  if (risks.size === 0) {
    console.log("- none");
    return;
  }

  for (const [risk, riskPaths] of risks.entries()) {
    console.log(`- ${risk}: ${uniqueSorted(riskPaths).join(", ")}`);
  }
}

function context() {
  const base = comparisonBase();
  const workingEntries = workingTreeEntries();
  const workFiles = workingTreeFiles();
  const branchFiles = committedDiffFiles(base);
  const reviewFiles = allReviewFiles(base);
  const risks = detectRisks(reviewFiles);
  const decision = decisionFor(reviewFiles, risks);

  return {
    root: repoRoot(),
    branch: runGit(["branch", "--show-current"]) || "(detached HEAD)",
    latestCommit: runGit(["log", "-1", "--oneline"]),
    base,
    workingEntries,
    workFiles,
    branchFiles,
    reviewFiles,
    risks,
    decision,
  };
}

function printDecision(decision) {
  console.log("CTO-style decision report:");
  console.log(`Decision: ${decision.label}`);
  console.log(`Reason: ${decision.reason}`);
  console.log("Merge policy: no merge without explicit CTO approval.");
}

function printHelp() {
  console.log(`REZNO Agentic Delivery System Orchestrator

Usage:
  node tools/agents/rezno-orchestrator.mjs help
  node tools/agents/rezno-orchestrator.mjs status
  node tools/agents/rezno-orchestrator.mjs plan "<task>"
  node tools/agents/rezno-orchestrator.mjs handoff "<task>"
  node tools/agents/rezno-orchestrator.mjs review-local
  node tools/agents/rezno-orchestrator.mjs validate
  node tools/agents/rezno-orchestrator.mjs close-sprint

This tool is read-only except for running safe validation commands. It never runs Codex, installs packages, deploys, merges, or edits files.

Decision labels:
  APPROVE
  APPROVE AFTER SMALL FIX
  NEEDS QA GATE
  DO NOT MERGE`);
}

function printStatus() {
  const state = context();
  const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)));
  const relativeScriptPath = relative(state.root, scriptPath).replaceAll("\\", "/");

  console.log("REZNO Agentic Delivery System Status");
  console.log("");
  console.log(`Repository root: ${state.root}`);
  console.log(`Tool path: ${relativeScriptPath}`);
  console.log(`Current branch: ${state.branch}`);
  console.log(`Latest commit: ${state.latestCommit}`);
  console.log(`Comparison base: ${state.base}`);
  console.log("");
  console.log("Working tree status:");
  if (state.workingEntries.length === 0) {
    console.log("- clean");
  } else {
    for (const entry of state.workingEntries) {
      console.log(`- ${entry.status} ${entry.path}`);
    }
  }
  console.log("");
  printList(`Committed diff files (${state.base}...HEAD)`, state.branchFiles);
  console.log("");
  printRisks(state.risks);
  console.log("");
  printDecision(state.decision);
}

function printReviewLocal() {
  const state = context();

  console.log("REZNO Local Branch Review");
  console.log("");
  console.log(`Current branch: ${state.branch}`);
  console.log(`Comparison base: ${state.base}`);
  console.log(`Latest commit: ${state.latestCommit}`);
  console.log("");
  printList("Changed files reviewed", state.reviewFiles);
  console.log("");
  printRisks(state.risks);
  console.log("");
  printDecision(state.decision);
}

function taskText() {
  return process.argv.slice(3).join(" ").trim() || "Unspecified REZNO task";
}

function printPlan() {
  const task = taskText();

  console.log(`REZNO Sprint Plan: ${task}`);
  console.log("");
  console.log("Scope:");
  console.log("- Confirm branch, baseline, and working tree state.");
  console.log("- Inspect only areas directly related to the task.");
  console.log("- Implement the smallest safe change if implementation is explicitly approved.");
  console.log("- Run scoped validation and report exact outcomes.");
  console.log("");
  console.log("Out of scope:");
  console.log("- Package installs or lockfile changes unless explicitly approved.");
  console.log("- Prisma schema, migrations, database commands, auth, API, permissions, payments, production deployment, EAS, Flutter, or business logic changes unless explicitly approved.");
  console.log("- Broad refactors or unrelated UI changes.");
  console.log("- Merge without CTO approval.");
  console.log("");
  console.log("Likely files:");
  console.log("- To be determined by inspection; prefer docs/tools files for agentic workflow tasks.");
  console.log("");
  console.log("Risk gates:");
  console.log("- Stop for CTO review on database, schema, migrations, auth, permissions, secrets, production deployment, payments, package changes, failed checks, or scope expansion.");
  console.log("");
  console.log("Checks:");
  console.log("- node tools/agents/rezno-orchestrator.mjs status");
  console.log("- node tools/agents/rezno-orchestrator.mjs review-local");
  console.log("- node tools/agents/rezno-orchestrator.mjs validate");
  console.log("- Additional approved project checks only when safe and in scope.");
  console.log("");
  console.log("Decision criteria:");
  console.log("- APPROVE: scope is clean, checks pass, no high-risk categories.");
  console.log("- APPROVE AFTER SMALL FIX: narrow fix required and safe.");
  console.log("- NEEDS QA GATE: unknown non-high-risk scope or runtime uncertainty.");
  console.log("- DO NOT MERGE: high-risk category, failed required checks, or unapproved expansion.");
}

function printHandoff() {
  const task = taskText();

  console.log(`Codex handoff prompt:

You are continuing REZNO work.

Task:
${task}

Hard rules:
- Do not use git add .
- Do not merge without explicit CTO approval.
- Do not install packages unless explicitly approved.
- Do not change Prisma schema, migrations, database commands, auth, API, permissions, payments, production deployment, EAS, Flutter, mobile app logic, or business logic unless explicitly approved.
- Do not print or store secrets.
- Do not run destructive commands.
- Do not run Codex automatically from repository tooling.

Start by running:
- git status --short
- git branch --show-current
- git log -1 --oneline
- node tools/agents/rezno-orchestrator.mjs status

Workflow:
1. Plan the narrow scope.
2. Execute only approved changes.
3. Run safe validation.
4. Review risks with node tools/agents/rezno-orchestrator.mjs review-local.
5. Report with one CTO decision label.

Decision labels only:
- APPROVE
- APPROVE AFTER SMALL FIX
- NEEDS QA GATE
- DO NOT MERGE`);
}

function packageScripts() {
  const packagePath = resolve(repoRoot(), "package.json");
  if (!existsSync(packagePath)) {
    return {};
  }

  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  return packageJson.scripts ?? {};
}

function riskyScriptTerm(scriptText) {
  return RISKY_SCRIPT_TERMS.find((pattern) => pattern.test(scriptText)) ?? null;
}

function lifecycleScriptNames(scriptName) {
  return [`pre${scriptName}`, scriptName, `post${scriptName}`];
}

function scriptSafetyReview(scripts, scriptName) {
  const relatedScripts = lifecycleScriptNames(scriptName)
    .filter((name) => Object.hasOwn(scripts, name))
    .map((name) => ({
      name,
      text: scripts[name],
      riskyTerm: riskyScriptTerm(scripts[name]),
    }));

  const riskyScript = relatedScripts.find((script) => script.riskyTerm);

  return {
    relatedScripts,
    riskyScript,
    safe: !riskyScript,
  };
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function printCheckResult(result) {
  const outcome = result.status === 0 ? "passed" : "failed";
  console.log(`- ${result.command}: ${outcome}`);
  if (result.stdout) {
    console.log(result.stdout);
  }
  if (result.stderr) {
    console.error(result.stderr);
  }
}

function runValidation() {
  const checks = [];
  const scripts = packageScripts();

  checks.push(runCommand("node", ["--check", "tools/agents/rezno-orchestrator.mjs"]));
  checks.push(runCommand("git", ["diff", "--check"]));

  for (const scriptName of ["lint", "typecheck"]) {
    const scriptText = scripts[scriptName];
    if (!scriptText) {
      console.log(`- npm run ${scriptName}: skipped (script not found)`);
      continue;
    }

    const safetyReview = scriptSafetyReview(scripts, scriptName);

    if (!safetyReview.safe) {
      console.log(
        `- npm run ${scriptName}: skipped (${safetyReview.riskyScript.name} contains risky term ${safetyReview.riskyScript.riskyTerm})`,
      );
      continue;
    }

    checks.push(runCommand(npmCommand(), ["run", scriptName]));
  }

  let failed = false;
  for (const result of checks) {
    printCheckResult(result);
    if (result.status !== 0) {
      failed = true;
    }
  }

  if (failed) {
    process.exitCode = 1;
  }
}

function printCloseSprint() {
  console.log(`REZNO Post-Merge Sync Checklist

Run after CTO-approved merge:
1. git fetch origin
2. git checkout main
3. git pull --ff-only origin main
4. git log -1 --oneline
5. node tools/agents/rezno-orchestrator.mjs status

Confirm:
- Latest main SHA matches the approved merge commit.
- Working tree is clean.
- Risk categories are none.
- No generated artifacts are dirty.

Memory update block:
- Sprint name: <SPRINT_NAME>
- Expected main SHA: <EXPECTED_MAIN_SHA>
- PR number: <PR_NUMBER>
- Decision: <APPROVE|APPROVE AFTER SMALL FIX|NEEDS QA GATE|DO NOT MERGE>
- Blocked items: <NONE_OR_LIST>

Do not edit memory files automatically. Record memory only when explicitly instructed.`);
}

function main() {
  const command = process.argv[2] ?? "help";

  if (command === "help") {
    printHelp();
    return;
  }

  if (command === "status") {
    printStatus();
    return;
  }

  if (command === "plan") {
    printPlan();
    return;
  }

  if (command === "handoff") {
    printHandoff();
    return;
  }

  if (command === "review-local") {
    printReviewLocal();
    return;
  }

  if (command === "validate") {
    runValidation();
    return;
  }

  if (command === "close-sprint") {
    printCloseSprint();
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exitCode = 1;
}

main();
