# AI Gate B Threat Model

| Threat | Gate B control |
| --- | --- |
| Secret exposure | Gemini key is server-only, copied only to local ignored `.env.local`, and never sent to clients or CI. |
| Private data exfiltration | PII and private-domain requests are refused before Gemini. Provider input is sanitized public Marketplace data only. |
| Prompt injection | User text and Marketplace text are treated as untrusted data; system policy forbids following embedded instructions. |
| Hallucinated businesses or facts | Provider output must cite supplied citation IDs; unknown citations and malformed JSON are rejected. |
| Model-generated URLs | Provider is forbidden to return URLs; server builds links from trusted slugs. |
| Side effects | Gemini cannot call tools. REZNO executes only read-only Marketplace search. |
| Denial-of-wallet / retry loop | Local-only flags, timeout, small output cap, and one transient retry maximum. |
| Provider outage/quota/safety block | Errors are mapped to safe client statuses without provider internals. |
| Accidental production activation | `REZNO_AI_GATE_B_LOCAL_ONLY=true` is required and staging/production secrets are not configured. |

P0/P1/P2 blockers include any provider call with private data, any direct client Gemini call, any writable tool, any secret in source or logs, any unsupported citation accepted, or any production/staging activation.

