# Gate 9B Monitoring and Rollback

Status: `AUTHOR IMPLEMENTATION`

## Monitoring

Gate 9B monitoring checks:

- runtime readiness and last successful invocation;
- enabled schedule list and delayed schedule metrics;
- available/running/retry/dead-letter job counts;
- failed-job recovery;
- alert lifecycle;
- incident lifecycle when explicitly tested;
- safe logs with zero credentials, tokens, prompt/response payloads, or
  connection strings.

## Rollback plan

1. Disable Stage 6 runtime.
2. Disable affected schedules.
3. Confirm generation changed so stale invocations cannot publish results.
4. Verify no running leases remain or recover expired leases.
5. Cleanup only Gate 9B fixture rows.
6. Compare fingerprints.
7. Use the documented restore point only if a proven staging incident requires
   restore. Do not perform destructive restore as a routine test.

