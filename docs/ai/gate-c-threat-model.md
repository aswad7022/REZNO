# AI Gate C — Threat Model

## Assets

- `GEMINI_API_KEY`
- authenticated Person identity
- rate/concurrency/circuit state
- public Marketplace result summaries
- policy, prompt, evaluation, and provider configuration versions

## Primary threats and controls

| Threat | Control |
| --- | --- |
| API key leakage in URL, logs, errors, metadata, or client bundles | Header-only `x-goog-api-key`, no query string, server-only modules, bundle scans, no key snippets in readiness. |
| Provider activation in staging/production without approval | posture-specific flags fail closed; staging/production require explicit approval and configured secret. |
| Retry storm after invalid key, permission failure, timeout, or provider outage | retry only transient unavailable responses; invalid key and permission failures open or fail the circuit; quota returns rate-limited. |
| Free Tier exhaustion | per-Person and service budgets, daily/request-window limits, atomic concurrency leases, fail-closed store behavior. |
| Cross-account lease release | budget leases are acquired with the authenticated Person and released idempotently by the owning request. |
| Prompt injection from user or Marketplace text | Gate B preflight and post-provider grounding remain active; the model cannot call tools or create links. |
| Internal ID exfiltration to Gemini | provider DTO contains temporary citation IDs and sanitized public Marketplace fields only. |
| Telemetry privacy leak | telemetry excludes raw question, prompt, answer, provider body, names, cookies, JWTs, keys, Person/Organization/Business IDs, and full descriptions. |
| Stale circuit update | generation fencing prevents an old success/failure from changing a newer circuit state. |

Gate C does not add write actions, persistence, AI memory, or a second provider.
