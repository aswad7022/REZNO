# AI Gate B Threat Model

| Threat | Gate B control |
| --- | --- |
| Secret exposure | Gemini key is server-only, copied only to local ignored `.env.local`, sent to Gemini only in `x-goog-api-key`, and never placed in URLs, logs, clients, CI, Vercel, or EAS. |
| Private data exfiltration | Unicode-normalized PII and private-domain requests are refused before Gemini. Provider input is sanitized public Marketplace data only and excludes internal IDs. |
| Prompt injection | User text and Marketplace text are treated as untrusted data; system policy forbids following embedded instructions. |
| Hallucinated businesses or facts | Provider output only selects supplied citation IDs; unknown, duplicate, malformed, URL-bearing, or unverifiable free-text claims are rejected. Server builds final answer text from trusted sources. |
| Model-generated URLs | Provider output containing URLs is rejected; server builds links from trusted public paths. |
| Side effects | Gemini cannot call tools. REZNO executes only read-only Marketplace search. |
| Denial-of-wallet / retry loop | Local-only flags, authenticated Person/service rate budgets, bounded concurrency leases, timeout, small output cap, and one transient retry maximum. |
| Provider outage/quota/safety block | Errors are mapped to safe client statuses without provider internals. |
| Accidental production activation | `REZNO_AI_GATE_B_LOCAL_ONLY=true` is required and staging/production secrets are not configured. |

P0/P1/P2 blockers include any provider call with private data, any direct client Gemini call, any writable tool, any secret in source or logs, any unsupported citation accepted, or any production/staging activation.
