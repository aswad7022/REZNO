# AI Gate B Gemini Provider Record

Gate B uses Google Gemini through a server-only REST call to the official
Interactions API:

- Package dependency: none. The implementation intentionally avoids
  `@google/genai` because its optional MCP peer dependency pulls development
  server tooling into the production dependency audit.
- API style: Interactions API (`POST /v1beta/interactions`)
- Endpoint origin: `https://generativelanguage.googleapis.com`
- Authentication: `GEMINI_API_KEY` is sent only in the official `x-goog-api-key` request header. The request URL has no `key` query parameter and provider errors/logs never include the key.
- API revision header: `2026-06-08`
- Storage: `store: false`
- Tool calling: disabled; REZNO executes tools itself before the provider call.
- Candidate behavior: one structured text response is requested and post-validated.
- Output: JSON schema via `response_format` with `application/json`.

## Model

The approved Gate B default model is:

`gemini-3.6-flash`

It was selected after a read-only Gemini model listing confirmed Flash-family models available to the configured key. The model is configurable only through server-side `GEMINI_MODEL`. There is no automatic fallback to another model; missing or invalid model configuration fails closed.

## Free Tier boundary

Gate B is designed for Free Tier local validation only:

- limited request count;
- authenticated Person and service-wide rate limits plus bounded concurrency before any provider call;
- no paid/billing tier escalation;
- no private customer, booking, payment, staff, admin, platform, token, cookie, or session data;
- synthetic eval prompts and public Marketplace data only, with no internal IDs in provider payloads;
- quota/rate errors return safe local unavailable/rate-limited responses.
