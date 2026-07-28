# AI Gate C — Architecture and Provider Control Plane

Gate C adds a server-only control plane around the Gate B Gemini call path.

```text
Customer route
  -> authenticated active onboarded Person
  -> safe JSON/body/content-type limit
  -> privacy refusal before Marketplace/budget/provider
  -> Gate C readiness and kill switch
  -> Gate C budget and concurrency lease
  -> Marketplace public search
  -> Gate C circuit breaker
  -> Gemini provider request with x-goog-api-key header
  -> Gate B structured output validation and server-built answer
  -> public response stripped of model/provider internals
```

## Provider registry

The registry is closed and contains only `gemini`. The only approved model is `gemini-3.6-flash`. Missing or invalid model configuration fails closed. There is no fallback to a different model.

## Configuration posture

- Local: requires `REZNO_AI_GATE_C_ENABLED=true` and `REZNO_AI_GATE_C_LOCAL_PROVIDER_ENABLED=true`.
- Staging: remains closed unless `REZNO_AI_GATE_C_STAGING_APPROVED=true` and the server secret is configured.
- Production: remains closed unless `REZNO_AI_GATE_C_PRODUCTION_APPROVED=true` and the server secret is configured.

`LOCAL_ONLY` is not the sole protection. Gate C also checks global AI flags, Gemini flag, Gate C flag, kill switch, posture approval, key presence, and exact model allowlist.

## Secret boundary

`GEMINI_API_KEY` is read server-side for the current request and passed only in `x-goog-api-key`. The request URL never contains the key. The provider client is created per operation and is not stored globally, so rotation can take effect without keeping an old key in process-wide state.

## Budgets and circuit

Gate C reuses REZNO's distributed rate-limit infrastructure and PostgreSQL advisory locks for production/serverless posture. Memory stores are allowed only for local tests. The circuit states are `CLOSED / OPEN / HALF_OPEN`; old successes or failures are fenced by generation and cannot reset a newer open circuit.

## Public response boundary

The server may keep internal metadata for tests and operations, but the Route Handler returns a public response that strips `modelId` and provider internals. Users receive safe availability/rate-limit/refusal messages only.
