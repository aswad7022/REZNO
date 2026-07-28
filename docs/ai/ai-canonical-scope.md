# REZNO AI Canonical Scope

Status: AI Gate C provider operations control plane.
Base: `c9182bb53b55cb1fa01104db0e92733bcd740e89`.
Gate B merge: `c9182bb53b55cb1fa01104db0e92733bcd740e89`.
Stage 6 runtime: `DEFERRED_BY_OWNER — CODE MERGED, RUNTIME NOT ACTIVATED`.
Stage 7 external validation: `DEFERRED_BY_OWNER`.
Migration 52: `NOT CREATED`.

## Product boundary

REZNO product AI is a future customer, business, and admin assistance layer for bounded, grounded, read-mostly help inside REZNO. It is separate from:

- coding assistant instructions in `docs/09-CODEX-INSTRUCTIONS.md` and `docs/99-MASTER-PROMPT.md`;
- the deterministic local marketplace helper in `features/ai/services/local-assistant.ts`;
- any future large-language-model provider.

The coding-agent documents instruct repository maintainers and must never be used as product prompts. The local assistant is deterministic application code and is not a provider integration. A future LLM may be introduced only after later gates approve provider, prompt, privacy, evaluation, and operations controls.

## Gate status

- Gate A: `CLOSED`
- Gate B: `CLOSED`
- Gate C: `ACTIVE — AUTHOR IMPLEMENTATION`
- Gate D: `NOT STARTED`

## AI Gate A

Gate A creates the canonical contracts that every later AI gate must obey:

- provider-neutral server-only request/response interface;
- closed feature flags and kill switch by default;
- deterministic local fallback for tests and contract verification only;
- pre-provider and post-provider policy checks;
- read-only tool registry allowlist with no side effects;
- authorization context separated from prompt/input text;
- grounding citations required for successful answers;
- refusal and degraded-response modes in `ar`, `en`, and `ckb`;
- RTL/LTR-safe user copy contract;
- bounded timeout, cancellation, retry, token, and cost budgets;
- audit-safe metadata that excludes raw prompts, raw answers, tokens, cookies, and secrets;
- versioned policy, prompt, and evaluation identifiers.

## Explicitly out of scope for Gate A

- No external AI provider calls.
- No model API key, provider SDK, or secret.
- No user-facing AI recommendations, chat, ranking, automated decisions, or actions.
- No business, booking, payment, messaging, notification, admin, or platform mutations.
- No Gate B, Gate C, Gate D, AI production operations, or provider rollout.
- No Migration 52, Prisma schema change, staging/production database change, Stage 6 runtime activation, Stage 7 external validation, or PR #100 change.

## AI Gate B

Gate B is closed at merge `c9182bb53b55cb1fa01104db0e92733bcd740e89`. It delivered the approved Gemini grounded customer discovery assistant for public Marketplace search only. The assistant remains read-only, citation-bound, privacy-gated before provider work, and closed unless server-only runtime flags, a kill-switch-safe posture, and approved secrets are present.

## AI Gate C

Gate C is the active author implementation. It does not introduce a new AI feature. It hardens Gemini operations through a server-only provider control plane:

- closed provider registry for Gemini only;
- exact model allowlist with no fallback;
- versioned provider configuration;
- kill switch and environment posture checks before every network call;
- per-Person, daily, request-window, service-wide, and concurrency budgets;
- circuit breaker states `CLOSED / OPEN / HALF_OPEN` with generation fencing;
- safe operational telemetry without prompts, answers, secrets, cookies, sessions, private IDs, or full Marketplace descriptions;
- local-only smoke support with synthetic public data;
- no staging or production activation without explicit approval and configured secrets.

Gate C keeps Stage 8 historical closure intact and does not create Migration 52.

## Future gate outline

- Gate D: end-to-end AI closure, red-team results, accessibility, device/browser evidence, and production readiness.
