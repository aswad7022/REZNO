# AI Gate C — Outage and Rollback Runbook

## Symptoms

- elevated `TIMEOUT` or `UNAVAILABLE` outcomes
- circuit state `OPEN`
- provider request count dropping to zero because circuit blocks calls
- Free Tier quota returns `RATE_LIMITED`

## Response

1. Keep the kill switch available as the top authority.
2. Do not retry auth, permission, quota, safety, policy, or malformed-output failures.
3. Let transient 5xx/timeout failures enter the bounded retry and circuit policy.
4. If the circuit is `OPEN`, wait for the half-open window; only one probe is permitted.
5. If customer impact is unacceptable, set the kill switch and serve safe unavailable copy.

## Rollback

Rollback is code-only unless a later gate authorizes runtime configuration changes. No Stage 6 runtime, staging database, production database, or migration operation is part of Gate C rollback.
