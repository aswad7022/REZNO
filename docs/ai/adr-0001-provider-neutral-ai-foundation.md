# ADR 0001 — Provider-Neutral AI Foundation

## Status

Accepted for AI Gate A.

## Context

REZNO needs an AI foundation before any provider, prompt, or user-facing assistant is introduced. The project already contains coding-assistant documentation and a deterministic local marketplace helper. Neither is a production AI provider.

## Decision

Gate A introduces a provider-neutral server-only interface and closed policy/evaluation contracts. It intentionally avoids external providers, provider SDKs, model names, API keys, migrations, and production runtime changes.

## Consequences

- Later gates can swap or add providers only behind the same typed contract.
- Tests can verify safety, grounding, budgets, audit metadata, and refusal behavior deterministically.
- User-facing AI remains closed by default until a later gate approves real product scope and rollout.
- Gate A cannot be used to claim model quality or production AI readiness.
