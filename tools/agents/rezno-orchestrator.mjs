#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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
  "tools/agents/rezno-agent-memory.json",
]);

const MEMORY_FILE = "tools/agents/rezno-agent-memory.json";

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

const GOAL_RISK_RULES = [
  {
    name: "database",
    keywords: ["database", "postgres", "postgresql", "neon", "sql", "data model", "db"],
  },
  {
    name: "schema",
    keywords: ["schema", "prisma schema", "model", "field", "relation"],
  },
  {
    name: "migrations",
    keywords: ["migration", "migrate", "prisma migrate", "migrations"],
  },
  {
    name: "auth",
    keywords: ["auth", "login", "sign in", "session", "better auth", "oauth"],
  },
  {
    name: "API",
    keywords: ["api", "endpoint", "route handler", "json endpoint", "server action", "webhook"],
  },
  {
    name: "permissions",
    keywords: ["permission", "role", "rbac", "admin", "owner", "access control", "authorization"],
  },
  {
    name: "business logic",
    keywords: ["business logic", "business rule", "workflow", "lifecycle", "status transition"],
  },
  {
    name: "booking",
    keywords: ["booking", "bookings", "appointment", "appointments", "cancel booking", "reschedule"],
  },
  {
    name: "reservation",
    keywords: ["reservation", "reservations", "reserve", "table reservation"],
  },
  {
    name: "marketplace",
    keywords: ["marketplace", "discovery", "near me", "search results", "public business page"],
  },
  {
    name: "tenant",
    keywords: ["tenant", "multi-tenant", "organization isolation", "active business", "business context"],
  },
  {
    name: "customer data",
    keywords: ["customer data", "customer profile", "customer record", "person data", "private data"],
  },
  {
    name: "staff",
    keywords: ["staff", "employee", "team member", "professional profile", "member assignment"],
  },
  {
    name: "pricing",
    keywords: ["price", "pricing", "fee", "cost", "amount"],
  },
  {
    name: "service catalog",
    keywords: ["service catalog", "service", "offering", "branch service"],
  },
  {
    name: "notification",
    keywords: ["notification", "notifications", "notify"],
  },
  {
    name: "message",
    keywords: ["message", "messages", "messaging", "conversation"],
  },
  {
    name: "review",
    keywords: ["review", "reviews", "rating", "ratings"],
  },
  {
    name: "admin",
    keywords: ["admin", "super admin", "administrator", "admin dashboard"],
  },
  {
    name: "secrets",
    keywords: ["secret", "token", "password", "api key", "env", "credential"],
  },
  {
    name: "production deployment",
    keywords: ["production", "deploy", "deployment", "vercel", "hosting", "release"],
  },
  {
    name: "payments",
    keywords: ["payment", "stripe", "zaincash", "checkout", "invoice"],
  },
  {
    name: "package changes",
    keywords: ["package", "dependency", "install", "npm install", "lockfile", "package.json"],
  },
  {
    name: "mobile",
    keywords: ["mobile", "expo", "react native", "android", "ios", "phone"],
  },
  {
    name: "EAS",
    keywords: ["eas", "eas build", "testflight", "internal testing"],
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

function memoryPath() {
  return resolve(repoRoot(), MEMORY_FILE);
}

function readMemory() {
  const path = memoryPath();
  if (!existsSync(path)) {
    throw new Error(`${MEMORY_FILE} does not exist`);
  }

  return JSON.parse(readFileSync(path, "utf8"));
}

function writeMemory(memory) {
  writeFileSync(memoryPath(), `${JSON.stringify(memory, null, 2)}\n`, "utf8");
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

function detectGoalRisks(goal) {
  const normalizedGoal = goal.toLowerCase();
  const risks = new Map();

  for (const rule of GOAL_RISK_RULES) {
    const matches = rule.keywords.filter((keyword) => normalizedGoal.includes(keyword.toLowerCase()));
    if (matches.length > 0) {
      risks.set(rule.name, matches);
    }
  }

  return risks;
}

function decisionForGoalRisks(risks) {
  if (risks.size === 0) {
    return {
      label: DECISIONS.APPROVE,
      reason: "Task text does not mention high-risk categories. Normal scoped review still required.",
    };
  }

  if (risks.has("secrets") || risks.has("production deployment") || risks.has("payments") || risks.has("EAS")) {
    return {
      label: DECISIONS.DO_NOT_MERGE,
      reason: "Task text mentions categories that require explicit CTO approval before implementation or merge.",
    };
  }

  return {
    label: DECISIONS.NEEDS_QA_GATE,
    reason: "Task text mentions risk categories that require a QA/security gate before approval.",
  };
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

function riskLines(risks) {
  if (risks.size === 0) {
    return ["- none"];
  }

  return [...risks.entries()].map(([risk, details]) => `- ${risk}: ${uniqueSorted(details).join(", ")}`);
}

function changedFilesForReport(state) {
  return state.reviewFiles.length === 0 ? ["- none"] : state.reviewFiles.map((file) => `- ${file}`);
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
  node tools/agents/rezno-orchestrator.mjs risk "<goal>"
  node tools/agents/rezno-orchestrator.mjs sprint "<goal>"
  node tools/agents/rezno-orchestrator.mjs plan "<task>"
  node tools/agents/rezno-orchestrator.mjs handoff "<task>"
  node tools/agents/rezno-orchestrator.mjs review-local
  node tools/agents/rezno-orchestrator.mjs pr-body "<sprint name>"
  node tools/agents/rezno-orchestrator.mjs decision
  node tools/agents/rezno-orchestrator.mjs memory "<sprint name>"
  node tools/agents/rezno-orchestrator.mjs memory-status
  node tools/agents/rezno-orchestrator.mjs record-sprint "<sprint name>" "<pr number>" "<main sha>" "<decision>"
  node tools/agents/rezno-orchestrator.mjs next
  node tools/agents/rezno-orchestrator.mjs audit
  node tools/agents/rezno-orchestrator.mjs delegate "<goal>"
  node tools/agents/rezno-orchestrator.mjs gate "<goal>"
  node tools/agents/rezno-orchestrator.mjs operator-pack "<goal>"
  node tools/agents/rezno-orchestrator.mjs validate
  node tools/agents/rezno-orchestrator.mjs close-sprint

This tool is read-only except for running safe validation commands and record-sprint, which may write only to tools/agents/rezno-agent-memory.json. It never runs Codex, installs packages, deploys, merges, or edits app source files.

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

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function printRiskAnalysis() {
  const goal = taskText();
  const risks = detectGoalRisks(goal);
  const decision = decisionForGoalRisks(risks);

  console.log(`REZNO Task Risk Analysis: ${goal}`);
  console.log("");
  console.log("Risk categories detected from task text:");
  console.log(riskLines(risks).join("\n"));
  console.log("");
  console.log("Escalation recommendation:");
  if (risks.size === 0) {
    console.log("- Continue with normal scoped planning and repository review.");
  } else {
    console.log("- Stop for CTO review before implementation if any detected category is outside the approved scope.");
    console.log("- Add QA/security gates for all detected categories.");
  }
  console.log("");
  printDecision(decision);
}

function goalDecision(risks) {
  return decisionForGoalRisks(risks);
}

function localMainSha() {
  return hasRef("main") ? runGit(["rev-parse", "main"]) : "missing";
}

function isAncestor(ancestor, descendant) {
  try {
    runGit(["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
}

function filesChangedBetween(base, head) {
  const output = runGit(["diff", "--name-only", `${base}..${head}`]);
  if (!output) {
    return [];
  }

  return uniqueSorted(output.split(/\r?\n/).filter(Boolean).map(normalizePath));
}

function memoryFreshness(memory) {
  const latestMain = localMainSha();
  const approvedMain = memory?.currentApprovedMain ?? "missing";

  if (!isGitSha(approvedMain)) {
    return {
      status: "invalid",
      latestMain,
      approvedMain,
      changedFiles: [],
      risks: new Map(),
      safeForDelegation: false,
      reason: "memory.currentApprovedMain is missing or invalid",
      note: null,
    };
  }

  if (latestMain === "missing") {
    return {
      status: "missing-main",
      latestMain,
      approvedMain,
      changedFiles: [],
      risks: new Map(),
      safeForDelegation: false,
      reason: "local main ref is missing",
      note: null,
    };
  }

  if (approvedMain === latestMain) {
    return {
      status: "exact",
      latestMain,
      approvedMain,
      changedFiles: [],
      risks: new Map(),
      safeForDelegation: true,
      reason: "memory.currentApprovedMain matches local main",
      note: null,
    };
  }

  if (!isAncestor(approvedMain, latestMain)) {
    return {
      status: "not-ancestor",
      latestMain,
      approvedMain,
      changedFiles: [],
      risks: new Map(),
      safeForDelegation: false,
      reason: "memory.currentApprovedMain is not an ancestor of local main",
      note: null,
    };
  }

  const changedFiles = filesChangedBetween(approvedMain, latestMain);
  const risks = detectRisks(changedFiles);
  const approvedOnly = changedFiles.length > 0 && changedFiles.every((file) => APPROVED_FILES.has(file));
  const safeDrift = approvedOnly && risks.size === 0;

  return {
    status: safeDrift ? "safe-drift" : "unsafe-drift",
    latestMain,
    approvedMain,
    changedFiles,
    risks,
    safeForDelegation: safeDrift,
    reason: safeDrift
      ? "memory.currentApprovedMain is behind local main only by approved agentic docs/tools changes"
      : "memory.currentApprovedMain is behind local main by unknown or risky changes",
    note: safeDrift
      ? "Memory is behind local main only by approved agentic docs/tools changes."
      : null,
  };
}

function delegatedImplementationGate(memory, state, risks) {
  const reasons = [];
  const freshness = memoryFreshness(memory);
  const goalRiskDecision = goalDecision(risks);

  if (risks.size > 0) {
    reasons.push("goal risk categories were detected");
  }

  if (state.branch !== "main") {
    reasons.push("current branch is not main");
  }

  if (state.workingEntries.length > 0) {
    reasons.push("working tree is not clean");
  }

  if (!freshness.safeForDelegation) {
    reasons.push(freshness.reason);
  }

  const allowImplementation = reasons.length === 0;

  if (allowImplementation) {
    return {
      allowImplementation,
      latestMain: freshness.latestMain,
      freshness,
      reasons,
      decision: goalRiskDecision,
    };
  }

  return {
    allowImplementation,
    latestMain: freshness.latestMain,
    freshness,
    reasons,
    decision:
      goalRiskDecision.label === DECISIONS.DO_NOT_MERGE
        ? goalRiskDecision
        : {
            label: DECISIONS.NEEDS_QA_GATE,
            reason: `Delegated implementation is blocked: ${reasons.join("; ")}.`,
          },
  };
}

function hardRulesText() {
  return `- Do not use git add .
- Do not merge without explicit CTO approval.
- Do not install packages unless explicitly approved.
- Do not change package.json or lockfiles unless explicitly approved.
- Do not change database, Prisma schema, migrations, auth, API, permissions, payments, production deployment, EAS, Flutter, mobile app logic, or business logic unless explicitly approved.
- Do not print or store secrets.
- Do not run destructive commands.
- Do not run Codex automatically from repository tooling.`;
}

function safeExecutionPrompt(goal, allowImplementation) {
  if (!allowImplementation) {
    return `You are Codex working in the REZNO repository.

Task:
${goal}

Mode:
Planning and review only.

Hard rules:
${hardRulesText()}
- Do not implement.
- Do not commit.
- Do not push.
- Do not open a PR.

Start with:
- git status --short
- git branch --show-current
- git log -1 --oneline
- node tools/agents/rezno-orchestrator.mjs status
- node tools/agents/rezno-orchestrator.mjs risk "${goal}"

Return a plan, risk review, QA/security gates, and CTO decision recommendation.`;
  }

  return `You are Codex working in the REZNO repository.

Task:
${goal}

CTO approval is granted only for this safe scoped task to:
- sync main
- create a branch
- implement scoped safe changes
- run checks
- commit
- push
- open a PR

Hard rules:
${hardRulesText()}
- No merge is allowed.

Start with:
- git fetch origin
- git checkout main
- git pull --ff-only origin main
- git status --short
- node tools/agents/rezno-orchestrator.mjs status

Then implement only the approved scope, run safe checks, review risk, commit with explicit paths only, push, open a PR, and stop for CTO review.`;
}

function printDelegate() {
  const goal = taskText();
  const memory = readMemory();
  const state = context();
  const risks = detectGoalRisks(goal);
  const gate = delegatedImplementationGate(memory, state, risks);
  const decision = gate.decision;
  const allowImplementation = gate.allowImplementation;

  console.log("REZNO Delegated Sprint Mode");
  console.log(`Goal: ${goal}`);
  console.log(`Current approved main: ${memory.currentApprovedMain}`);
  console.log(`Local main SHA: ${gate.latestMain}`);
  console.log(`Current branch: ${state.branch}`);
  console.log(`Working tree: ${state.workingEntries.length === 0 ? "clean" : "dirty"}`);
  console.log("Risk classification:");
  console.log(riskLines(risks).join("\n"));
  console.log(`Memory freshness: ${gate.freshness.reason}`);
  if (gate.freshness.note) {
    console.log(`Note: ${gate.freshness.note}`);
    console.log("Recommendation: record the sprint after CTO-approved merge when appropriate.");
  }
  console.log("Implementation gate:");
  if (allowImplementation) {
    console.log("- passed: clean main, accepted memory freshness, clean working tree, and no goal-risk categories");
  } else {
    for (const reason of gate.reasons) {
      console.log(`- blocked: ${reason}`);
    }
  }
  console.log(`Decision recommendation: ${decision.label}`);
  console.log(`Reason: ${decision.reason}`);
  console.log(
    `Next safe action: ${
      allowImplementation
        ? "Use the generated implementation prompt, then stop at PR for CTO review."
        : "Run planning/security QA only. Do not implement, commit, push, or open PR until CTO approves the risky scope."
    }`,
  );
  console.log("");
  console.log("Ready-to-copy Codex prompt:");
  console.log(safeExecutionPrompt(goal, allowImplementation));
}

function printGate() {
  const goal = taskText();
  const risks = detectGoalRisks(goal);
  const decision = goalDecision(risks);

  console.log(`REZNO QA/Security Gate: ${goal}`);
  console.log("");
  console.log("Detected risk categories:");
  console.log(riskLines(risks).join("\n"));
  console.log("");
  console.log("Approval required before implementation:");
  for (const category of GOAL_RISK_RULES.map((rule) => rule.name)) {
    console.log(`- ${category}: ${risks.has(category) ? "CTO review required" : "no keyword risk detected"}`);
  }
  console.log("");
  console.log("Gate checklist:");
  console.log("- Confirm scope and out-of-scope items.");
  console.log("- Confirm no secrets are printed or stored.");
  console.log("- Confirm safe validation commands.");
  console.log("- Confirm ownership, auth, permission, and data exposure risks when relevant.");
  console.log("- Confirm no merge without explicit CTO approval.");
  console.log("");
  printDecision(decision);
}

function printOperatorPack() {
  const goal = taskText();
  const memory = readMemory();
  const state = context();
  const risks = detectGoalRisks(goal);
  const gate = delegatedImplementationGate(memory, state, risks);
  const decision = gate.decision;
  const allowImplementation = gate.allowImplementation;

  console.log(`REZNO CTO/Operator Pack: ${goal}`);
  console.log("");
  console.log("Executive summary:");
  console.log("- Delegated sprint mode can generate safe prompts, classify risk, and prepare review packs.");
  console.log("- It does not run Codex, merge, deploy, install packages, change schema, or change auth.");
  console.log("");
  console.log("Risk summary:");
  console.log(riskLines(risks).join("\n"));
  console.log("");
  console.log(`Memory freshness: ${gate.freshness.reason}`);
  if (gate.freshness.note) {
    console.log(`Note: ${gate.freshness.note}`);
    console.log("Recommendation: record the sprint after CTO-approved merge when appropriate.");
  }
  console.log("");
  console.log("Implementation gate:");
  if (allowImplementation) {
    console.log("- passed: clean main, accepted memory freshness, clean working tree, and no goal-risk categories");
  } else {
    for (const reason of gate.reasons) {
      console.log(`- blocked: ${reason}`);
    }
  }
  console.log("");
  console.log("Allowed actions:");
  console.log("- Plan safe scoped work.");
  console.log("- Generate implementation prompts.");
  console.log("- Run safe repository checks when explicitly requested.");
  console.log("- Commit, push, and open PR only when the generated prompt explicitly authorizes it.");
  console.log("");
  console.log("Disallowed actions:");
  console.log("- No git add .");
  console.log("- No merge without CTO approval.");
  console.log("- No package/schema/migration/auth/API/business logic changes unless explicitly approved.");
  console.log("- No deploy, EAS, destructive database commands, or secret exposure.");
  console.log("");
  console.log("Codex execution prompt:");
  console.log(safeExecutionPrompt(goal, allowImplementation));
  console.log("");
  console.log("QA checklist:");
  console.log("- Run node tools/agents/rezno-orchestrator.mjs status.");
  console.log("- Run node tools/agents/rezno-orchestrator.mjs review-local.");
  console.log("- Run node tools/agents/rezno-orchestrator.mjs validate.");
  console.log("- Run extra QA only when approved and safe.");
  console.log("");
  console.log("PR review checklist:");
  console.log("- Confirm files changed match scope.");
  console.log("- Confirm risk categories and checks.");
  console.log("- Confirm no package, schema, migration, auth, API, business logic, deploy, EAS, or mobile app logic changes unless approved.");
  console.log("- Confirm no merge without CTO approval.");
  console.log("");
  console.log("Post-merge memory update command template:");
  console.log('node tools/agents/rezno-orchestrator.mjs record-sprint "<sprint name>" "<pr number>" "<40-character-main-sha>" "APPROVE"');
  console.log("");
  printDecision(decision);
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

function printSprintPack() {
  const goal = taskText();
  const risks = detectGoalRisks(goal);
  const decision = decisionForGoalRisks(risks);
  const sprintSlug = slugify(goal) || "safe-rezno-sprint";

  console.log(`REZNO Sprint Runner Pack: ${goal}`);
  console.log("");
  console.log(`Sprint name suggestion: ${goal}`);
  console.log(`Branch name suggestion: sprint-${sprintSlug}`);
  console.log("");
  console.log("Scope:");
  console.log("- Confirm baseline branch and working tree state.");
  console.log("- Inspect only files related to the approved task.");
  console.log("- Implement the smallest safe change if implementation is explicitly approved.");
  console.log("- Preserve existing REZNO behavior.");
  console.log("");
  console.log("Out of scope:");
  console.log("- Package installs or lockfile changes unless explicitly approved.");
  console.log("- Database, Prisma schema, migrations, auth, API, permissions, payments, production deployment, EAS, Flutter, mobile app logic, or business logic changes unless explicitly approved.");
  console.log("- Broad refactors, unrelated UI changes, automatic Codex execution, deployment, or merge.");
  console.log("");
  console.log("Risk analysis:");
  console.log(riskLines(risks).join("\n"));
  console.log("");
  console.log("Safe checks:");
  console.log("- node tools/agents/rezno-orchestrator.mjs status");
  console.log("- node tools/agents/rezno-orchestrator.mjs review-local");
  console.log("- node tools/agents/rezno-orchestrator.mjs validate");
  console.log("- git diff --check");
  console.log("");
  console.log("Ready-to-copy Codex implementation prompt:");
  console.log(`You are Codex working in the REZNO repository.

Task:
${goal}

Hard rules:
- Do not use git add .
- Do not merge without explicit CTO approval.
- Do not install packages unless explicitly approved.
- Do not change package.json or lockfiles unless explicitly approved.
- Do not change database, Prisma schema, migrations, auth, API, permissions, payments, production deployment, EAS, Flutter, mobile app logic, or business logic unless explicitly approved.
- Do not print or store secrets.
- Do not run destructive commands.
- Do not run Codex automatically from repository tooling.

Start with:
- git status --short
- git branch --show-current
- git log -1 --oneline
- node tools/agents/rezno-orchestrator.mjs status

Then plan, execute only approved scope, run safe checks, run review-local, and report with one CTO decision label.`);
  console.log("");
  console.log("PR body template:");
  console.log(`## Scope
- <Describe scoped change>

## Safety constraints
- No merge without CTO approval.
- No package/schema/migration/auth/API/business logic/deployment changes unless explicitly approved.

## Files changed
- <List files>

## Checks run
- node tools/agents/rezno-orchestrator.mjs validate
- git diff --check

## Risk classification
${riskLines(risks).join("\n")}

## CTO decision recommendation
${decision.label}

## Merge policy
No merge without explicit CTO approval.`);
  console.log("");
  console.log("CTO decision criteria:");
  console.log("- APPROVE: scope is clean, checks pass, no high-risk categories.");
  console.log("- APPROVE AFTER SMALL FIX: narrow fix required and safe.");
  console.log("- NEEDS QA GATE: risk or runtime uncertainty needs validation.");
  console.log("- DO NOT MERGE: high-risk category, failed checks, or unapproved scope expansion.");
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

function printPrBody() {
  const sprintName = taskText();
  const state = context();

  console.log(`## Scope
- ${sprintName}
- Generated from local branch state.

## Safety constraints
- No merge without explicit CTO approval.
- No automatic Codex execution.
- No package installs, deploys, EAS, Prisma, migrations, database commands, seed, reset, or destructive commands.
- No schema, auth, API, permissions, payments, production deployment, mobile app logic, or business logic changes unless explicitly approved.

## Files changed
${changedFilesForReport(state).join("\n")}

## Checks to run
- node tools/agents/rezno-orchestrator.mjs status
- node tools/agents/rezno-orchestrator.mjs review-local
- node tools/agents/rezno-orchestrator.mjs validate
- git diff --check

## Risk classification
${riskLines(state.risks).join("\n")}

## CTO decision recommendation
${state.decision.label}

Reason: ${state.decision.reason}

## Merge policy
No merge without explicit CTO approval.`);
}

function printCompactDecision() {
  const state = context();

  console.log("REZNO CTO Decision Report");
  console.log(`Branch: ${state.branch}`);
  console.log(`Latest commit: ${state.latestCommit}`);
  console.log(`Comparison base: ${state.base}`);
  console.log("Changed files:");
  console.log(changedFilesForReport(state).join("\n"));
  console.log("Risks:");
  console.log(riskLines(state.risks).join("\n"));
  console.log(`Decision: ${state.decision.label}`);
  console.log(`Reason: ${state.decision.reason}`);
}

function printMemoryBlock() {
  const sprintName = taskText();
  const state = context();

  console.log("REZNO Memory Update Block");
  console.log(`Sprint name: ${sprintName}`);
  console.log(`Branch: ${state.branch}`);
  console.log(`Latest commit: ${state.latestCommit}`);
  console.log(`Comparison base: ${state.base}`);
  console.log("Changed files:");
  console.log(changedFilesForReport(state).join("\n"));
  console.log("Risk classification:");
  console.log(riskLines(state.risks).join("\n"));
  console.log(`Decision: ${state.decision.label}`);
  console.log("PR number: <PR_NUMBER>");
  console.log("Final main SHA: <FINAL_MAIN_SHA>");
  console.log("Blocked items: <NONE_OR_LIST>");
  console.log("Note: memory files are not edited automatically by this command. Use record-sprint explicitly to update the ledger.");
}

function sprintLines(closedSprints) {
  if (!Array.isArray(closedSprints) || closedSprints.length === 0) {
    return ["- none"];
  }

  return closedSprints.map((sprint) => `- ${sprint.name}, PR ${sprint.pr}, main SHA ${sprint.mainSha}, decision ${sprint.decision}`);
}

function printMemoryStatus() {
  const memory = readMemory();

  console.log("REZNO Agent Memory Status");
  console.log(`Project: ${memory.project}`);
  console.log(`Product vision: ${memory.productVision}`);
  console.log(`Current approved main: ${memory.currentApprovedMain}`);
  console.log("Closed sprints:");
  console.log(sprintLines(memory.closedSprints).join("\n"));
  console.log(`Active sprint: ${memory.activeSprint ?? "none"}`);
  console.log("Blocked items:");
  console.log((memory.blockedItems ?? []).length === 0 ? "- none" : memory.blockedItems.map((item) => `- ${item}`).join("\n"));
  console.log(`Next recommended action: ${memory.nextRecommendedAction}`);
}

function validateDecision(decision) {
  return Object.values(DECISIONS).includes(decision);
}

function isGitSha(value) {
  return /^[a-f0-9]{40}$/i.test(value);
}

function validateMemoryLedger(memory) {
  const errors = [];

  if (!isGitSha(memory?.currentApprovedMain ?? "")) {
    errors.push("currentApprovedMain must be a 40-character git SHA");
  }

  if (!Array.isArray(memory?.closedSprints)) {
    errors.push("closedSprints must be an array");
    return errors;
  }

  for (const [index, sprint] of memory.closedSprints.entries()) {
    const label = `closedSprints[${index}]`;
    if (!sprint?.name || typeof sprint.name !== "string") {
      errors.push(`${label}.name is required`);
    }
    if (!Number.isInteger(sprint?.pr)) {
      errors.push(`${label}.pr must be numeric`);
    }
    if (!isGitSha(sprint?.mainSha ?? "")) {
      errors.push(`${label}.mainSha must be a 40-character git SHA`);
    }
    if (!validateDecision(sprint?.decision)) {
      errors.push(`${label}.decision must be a valid CTO decision label`);
    }
  }

  return errors;
}

function printRecordSprint() {
  const [sprintName, prNumberText, mainSha, ...decisionParts] = process.argv.slice(3);
  const decision = decisionParts.join(" ");

  if (!sprintName || !prNumberText || !mainSha || !decision) {
    console.error('Usage: node tools/agents/rezno-orchestrator.mjs record-sprint "<sprint name>" "<pr number>" "<main sha>" "<decision>"');
    process.exitCode = 1;
    return;
  }

  if (!/^\d+$/.test(prNumberText)) {
    console.error("PR number must be numeric.");
    process.exitCode = 1;
    return;
  }

  if (!isGitSha(mainSha)) {
    console.error("Main SHA must look like a 40-character git SHA.");
    process.exitCode = 1;
    return;
  }

  if (!validateDecision(decision)) {
    console.error(`Decision must be one of: ${Object.values(DECISIONS).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const memory = readMemory();
  const pr = Number(prNumberText);
  const record = {
    name: sprintName,
    pr,
    mainSha,
    decision,
  };

  const existingIndex = (memory.closedSprints ?? []).findIndex((sprint) => sprint.name === sprintName || sprint.pr === pr);
  if (existingIndex >= 0) {
    memory.closedSprints[existingIndex] = record;
  } else {
    memory.closedSprints = [...(memory.closedSprints ?? []), record];
  }

  if (decision === DECISIONS.APPROVE) {
    memory.currentApprovedMain = mainSha;
  }

  writeMemory(memory);
  console.log(`Recorded sprint in ${MEMORY_FILE}: ${sprintName}, PR ${pr}, decision ${decision}`);
}

function printNext() {
  const memory = readMemory();
  const state = context();
  const nextAction = memory.nextRecommendedAction ?? "Prepare next safe REZNO sprint";

  console.log("REZNO Next Recommended Action");
  console.log(`Next: ${nextAction}`);
  console.log(`Current approved main: ${memory.currentApprovedMain}`);
  console.log(`Current branch: ${state.branch}`);
  console.log(`Working tree: ${state.workingEntries.length === 0 ? "clean" : "dirty"}`);
  console.log(`Recommended command: node tools/agents/rezno-orchestrator.mjs delegate "${nextAction}"`);
  console.log("");
  console.log("Ready-to-copy Codex prompt:");
  console.log(`You are Codex working in the REZNO repository.

Sprint:
${nextAction}

Hard rules:
- Do not use git add .
- Do not merge without explicit CTO approval.
- Do not install packages unless explicitly approved.
- Do not change package.json or lockfiles unless explicitly approved.
- Do not change database, Prisma schema, migrations, auth, API, permissions, payments, production deployment, EAS, Flutter, mobile app logic, or business logic unless explicitly approved.
- Do not print or store secrets.
- Do not run destructive commands.
- Do not run Codex automatically from repository tooling.

Start with:
- git fetch origin
- git checkout main
- git pull --ff-only origin main
- node tools/agents/rezno-orchestrator.mjs status
- node tools/agents/rezno-orchestrator.mjs audit
- node tools/agents/rezno-orchestrator.mjs delegate "${nextAction}"

Plan the sprint, execute only approved scope, run safe checks, and stop for CTO review. No merge without explicit CTO approval.`);
}

function printAudit() {
  const state = context();
  let memory = null;
  let memoryError = null;

  try {
    memory = readMemory();
  } catch (error) {
    memoryError = error;
  }

  const memoryExists = existsSync(memoryPath());
  const approvedMain = memory?.currentApprovedMain ?? null;
  const approvedMainKnown = isGitSha(approvedMain ?? "");
  const memoryValidationErrors = memory ? validateMemoryLedger(memory) : [];
  const freshness = memory ? memoryFreshness(memory) : null;
  const risks = state.risks;
  const auditPassed =
    memoryExists &&
    !memoryError &&
    memoryValidationErrors.length === 0 &&
    approvedMainKnown &&
    freshness?.safeForDelegation &&
    state.decision.label === DECISIONS.APPROVE;
  const decision = auditPassed
    ? {
        label: DECISIONS.APPROVE,
        reason: `Memory ledger exists, JSON is valid, ${freshness.reason}, and repository risk review is approved.`,
      }
    : { label: DECISIONS.NEEDS_QA_GATE, reason: "Audit found missing, dirty, or uncertain state that needs review." };

  console.log("REZNO Agent Memory Audit");
  console.log(`Memory file exists: ${memoryExists ? "yes" : "no"}`);
  console.log(`Memory JSON valid: ${memoryError ? `no (${memoryError.message})` : "yes"}`);
  console.log(`Current approved main in memory: ${approvedMain ?? "missing"}`);
  console.log(`Latest local main SHA: ${freshness?.latestMain ?? "missing"}`);
  console.log(`Current branch: ${state.branch}`);
  console.log(`Memory approved main format: ${approvedMainKnown ? "valid" : "invalid"}`);
  console.log(`Memory freshness: ${freshness?.reason ?? "memory unavailable"}`);
  if (freshness?.note) {
    console.log(`Note: ${freshness.note}`);
    console.log("Recommendation: record the sprint after CTO-approved merge when appropriate.");
  }
  if ((freshness?.changedFiles ?? []).length > 0) {
    console.log("Files changed between memory approved main and local main:");
    console.log(freshness.changedFiles.map((file) => `- ${file}`).join("\n"));
    console.log("Risk categories in memory drift:");
    console.log(riskLines(freshness.risks).join("\n"));
  }
  console.log(`Closed sprints array valid: ${Array.isArray(memory?.closedSprints) ? "yes" : "no"}`);
  if (memoryValidationErrors.length > 0) {
    console.log("Memory validation errors:");
    console.log(memoryValidationErrors.map((error) => `- ${error}`).join("\n"));
  }
  if (freshness && freshness.status !== "exact" && !freshness.safeForDelegation) {
    console.log("Warning: Memory approved main differs from local main. Run record-sprint only after CTO-approved merge.");
    if (state.branch !== "main") {
      console.log("Note: current branch is not main; this may be expected on a feature branch, but the mismatch is still reported.");
    }
  }
  console.log(`Working tree: ${state.workingEntries.length === 0 ? "clean" : "dirty"}`);
  console.log("Risk categories:");
  console.log(riskLines(risks).join("\n"));
  console.log("Closed sprints:");
  console.log(memory ? sprintLines(memory.closedSprints).join("\n") : "- unavailable");
  console.log("");
  printDecision(decision);
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

  if (command === "risk") {
    printRiskAnalysis();
    return;
  }

  if (command === "sprint") {
    printSprintPack();
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

  if (command === "pr-body") {
    printPrBody();
    return;
  }

  if (command === "decision") {
    printCompactDecision();
    return;
  }

  if (command === "memory") {
    printMemoryBlock();
    return;
  }

  if (command === "memory-status") {
    printMemoryStatus();
    return;
  }

  if (command === "record-sprint") {
    printRecordSprint();
    return;
  }

  if (command === "next") {
    printNext();
    return;
  }

  if (command === "audit") {
    printAudit();
    return;
  }

  if (command === "delegate") {
    printDelegate();
    return;
  }

  if (command === "gate") {
    printGate();
    return;
  }

  if (command === "operator-pack") {
    printOperatorPack();
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
