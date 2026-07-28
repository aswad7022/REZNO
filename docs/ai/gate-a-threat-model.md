# AI Gate A Threat Model

Gate A treats AI as untrusted, closed-by-default infrastructure.

| Threat | Gate A control |
| --- | --- |
| Prompt injection or system-prompt extraction | Injection patterns are refused before provider execution. Coding-agent docs are excluded from product AI scope. |
| Indirect injection through retrieved data | Future retrieval must cite allowed REZNO sources; ungrounded output is refused. |
| Cross-tenant or unauthorized data leakage | Authorization context is structured separately from prompt text and only readable scopes are passed through contracts. |
| Side-effect tool abuse | Tool registry is allowlisted and read-only with `sideEffect: "NONE"`. Booking, payment, messaging, notification, and admin mutations are forbidden. |
| PII or secrets in prompts/logs | PII-like input is refused; audit metadata stores lengths, versions, role, locale, mode, and refusal code only. |
| Hallucinated unsupported facts | Successful output requires at least one REZNO citation. |
| Denial-of-wallet or retry loops | Cost is fixed at `0.00` in Gate A; retries are `0`; timeout and token budgets are explicit. |
| Provider outage or timeout | Provider modes include refusal/degraded states; no external provider is enabled in Gate A. |
| Locale/RTL confusion | Refusal copy exists for `ar`, `en`, and `ckb`; UI remains normal dashboard layout with existing direction handling. |
| Accidental production rollout | Default flags are closed, kill switch is active, external provider flag is false, and UI says coming soon. |

P0/P1/P2 blockers for later gates include any external AI call without policy, any side-effect-capable tool, any raw secret/prompt logging, any cross-tenant context mixing, any automated decision presented as authoritative, or any feature flag defaulting open.
