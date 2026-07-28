# REZNO AI Canonical Scope

Status: Gate A foundation only.  
Base: `bcfbe17c3f6407a2b33b9048fd39a7648088d290`.  
Stage 6 runtime: `DEFERRED_BY_OWNER — CODE MERGED, RUNTIME NOT ACTIVATED`.  
Stage 7 external validation: `DEFERRED_BY_OWNER`.  
Migration 52: `NOT CREATED`.

## Product boundary

REZNO product AI is a future customer, business, and admin assistance layer for bounded, grounded, read-mostly help inside REZNO. It is separate from:

- coding assistant instructions in `docs/09-CODEX-INSTRUCTIONS.md` and `docs/99-MASTER-PROMPT.md`;
- the deterministic local marketplace helper in `features/ai/services/local-assistant.ts`;
- any future large-language-model provider.

The coding-agent documents instruct repository maintainers and must never be used as product prompts. The local assistant is deterministic application code and is not a provider integration. A future LLM may be introduced only after later gates approve provider, prompt, privacy, evaluation, and operations controls.

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

## Future gate outline

- Gate B: first approved product use case and UX, still behind closed rollout controls.
- Gate C: provider integration and operations only after secrets, privacy, budget, and observability approvals.
- Gate D: end-to-end AI closure, red-team results, accessibility, device/browser evidence, and production readiness.
