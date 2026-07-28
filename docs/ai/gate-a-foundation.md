# AI Gate A Foundation

Gate A establishes a closed, provider-neutral AI foundation. It does not provide a real customer AI experience.

## Implemented contracts

- `features/ai/contracts.ts` defines server-only request, response, flags, budgets, citations, audit metadata, roles, locales, and version identifiers.
- `features/ai/policy.ts` normalizes input, classifies intent, refuses unsafe or forbidden requests, verifies post-provider grounding, and emits audit-safe metadata.
- `features/ai/tool-registry.ts` exposes only read-only tool definitions with `sideEffect: "NONE"`.
- `features/ai/provider.ts` exposes an `AiProvider` interface and a deterministic local provider used only to prove policy and evaluation contracts.
- `features/ai/evaluation.ts` runs deterministic Gate A evaluations across `ar`, `en`, and `ckb`.

## Feature posture

Default flags are deliberately closed:

- `enabled: false`
- `killSwitch: true`
- `externalProviderEnabled: false`

The customer web assistant page now presents foundation/coming-soon copy only. Mobile remains governed by the existing `EXPO_PUBLIC_REZNO_AI_ENABLED` reserved flag and does not expose a real AI workflow.

## Policy sequence

1. Normalize bounded input.
2. Refuse when the feature is disabled or the kill switch is active.
3. Verify requested use case is allowed by authorization context.
4. Refuse prompt injection, PII-like input, and forbidden side-effect requests.
5. Run only the deterministic local provider when tests explicitly enable local mode.
6. Refuse ungrounded or malformed output after provider completion.
7. Emit audit metadata without raw input, prompt, response body, session cookie, token, or provider payload.

## Provider-neutral architecture

No provider-specific SDK, endpoint, API key, model name, embedding store, or streaming channel is introduced in Gate A. Future providers must implement the typed `AiProvider` interface and pass the same preflight, postflight, budget, audit, and evaluation controls before any user exposure.
