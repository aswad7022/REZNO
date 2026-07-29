# Stage 9 Deferred External Work

Status: `ACTIVE — AUTHOR IMPLEMENTATION`

Gate 9A records deferred external work honestly; it does not claim these items
as completed.

| Item | Status | Earliest gate | Notes |
| --- | --- | --- | --- |
| Stage 6 runtime activation | `DEFERRED_BY_OWNER` | 9D | Code is merged, runtime remains inactive. |
| Stage 7 physical device validation | `DEFERRED_BY_OWNER` | 9D | Simulator/local checks do not replace physical-device evidence. |
| Stage 7 APNs/FCM/store-provider validation | `DEFERRED_BY_OWNER` | 9D | No provider activation in Gate 9A. |
| Staging/production AI activation | `DISABLED` | 9B/9C/9D | AI Gates A-D are code-closed; production runtime remains off. |
| Gemini production key provisioning | `NOT_CONFIGURED_BY_GATE_9A` | 9B/9C | Gate 9A does not create or upload provider secrets. |
| Payment/storage production providers | `NOT_ACTIVATED_BY_GATE_9A` | 9C | Deterministic providers remain test-only and are forbidden in production. |
| PR #100 | `PROTECTED · OUT_OF_SCOPE` | none | Must not be modified, synchronized, merged, or rebuilt here. |

Any later gate that resolves one of these items must add fresh evidence and
security review for that specific activation path.
