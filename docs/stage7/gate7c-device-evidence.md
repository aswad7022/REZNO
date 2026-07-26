# Gate 7C Device Evidence

Status: **NOT RUN — DEFERRED TO GATE 7D**.

No physical-device, EAS build, provider, store, or production result may be
inferred from repository tests, simulator output, or Expo exports.

## Evidence matrix

| Check | iOS simulator | Android emulator | Physical iPhone | Physical Android |
| --- | --- | --- | --- | --- |
| Exact approved hosted page opens | `NOT_RUN — no provider origin approved` | `NOT_RUN — no provider origin approved` | `NOT_RUN` | `NOT_RUN` |
| Warm return | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| Cold/process-death return | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| Duplicate/replayed return | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| Browser cancel | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| Offline/slow/timeout recovery | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| `ar`/`en`/`ckb`, RTL/LTR | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| Provider receipt matches server status | `BLOCKED — provider not configured` | `BLOCKED — provider not configured` | `BLOCKED` | `BLOCKED` |

## Gate 7D evidence template

```text
Date/time and timezone:
Tester:
Commit SHA:
Device model and OS:
Build ID/profile:
Approved checkout origin:
Payment intent test identifier (redacted):
Warm return:
Cold/process-death return:
Success/failure/cancel hint versus server status:
Duplicate/replay:
Offline/slow/timeout:
Browser cancellation:
ar/en/ckb and RTL/LTR:
Sanitized evidence names:
Final result: PASS / FAIL / BLOCKED
```

Forbidden evidence includes credentials, cookies, authorization headers,
signed return state, checkout URLs, provider secrets/responses, customer
contact data, database URLs, device identifiers, or financial account data.
