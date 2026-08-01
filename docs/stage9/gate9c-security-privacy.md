# Gate 9C Security and Privacy Review

Status: `AUTHOR IMPLEMENTATION`

## Threats and controls

| Threat | Control |
| --- | --- |
| Preview or attacker-controlled origin used as release | Exact approved HTTPS origin; credentials, path, query, fragment, alternate ports, and preview aliases rejected. |
| Self-attested deployment | GitHub default branch, local HEAD, authorized SHA, Vercel source SHA/ref/project/alias/status must agree. |
| Stale clean snapshot hides a later incident | Deployment and database evidence expire after 30 minutes and future timestamps fail. |
| Test provider reaches release | Payment/storage deterministic providers, APNs/FCM, Gemini, and AI credentials are rejected. |
| Dirty runtime accepted | Runtime must be enabled with 13/13 schedules and zero backlog, alerts, running work, or stale leases. |
| Database drift or hidden migration | Exact 51/51 baseline, critical hashes, and explicit `ABSENT` drift required. |
| Secret leakage through evidence | Evidence types carry booleans/hashes/counters; CLI prints codes only and never file paths, SHAs, connection strings, tokens, prompts, or IDs. |
| Mobile release silently points to staging/localhost | Preview origin is explicit; store profile remains without a production origin and release code fails closed when absent. |

## Remaining external risk

Gate 9C does not lower the Stage 7 closure standard. Physical iPhone/Android,
APNs/FCM, store credentials, payment/storage production adapters, and hosted
payment return evidence remain external inputs. Their absence is represented
as an explicit production blocker, not a warning that can be overridden.

No staging/production secret creation, provider activation, database mutation,
or production deployment is authorized by this gate.
