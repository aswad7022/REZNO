# AI Gate D — Provider Outage and Rollback Drills

Status: `ACTIVE — AUTHOR IMPLEMENTATION`
Stage 6 runtime: `DEFERRED_BY_OWNER — CODE MERGED, RUNTIME NOT ACTIVATED`
Migration 52: `NOT CREATED`

## Deterministic drills

- Missing/rotated/invalid key returns safe unavailable response with `providerRequestCount=0` where no network starts.
- Invalid model fails readiness before provider work.
- Timeout maps to timeout copy without exposing provider internals.
- Cancellation releases the client generation and cannot overwrite a newer response.
- 401/403 maps to safe unavailable server behavior.
- 429 maps to safe rate-limited behavior.
- 5xx maps to safe unavailable behavior.
- Malformed provider response is rejected.
- Distributed store unavailable fails closed before concurrency acquisition.
- Circuit OPEN rejects without provider calls; HALF_OPEN allows one fenced probe.
- Kill switch before and during a request stops before Gemini network work.
- Rollback path is the existing flags/kill switch returning the Web/Mobile coming-soon or unavailable experience without deployment.

No retry storm or stuck lease is accepted.

