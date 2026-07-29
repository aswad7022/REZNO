# Gate 9B Security and Privacy

Status: `AUTHOR IMPLEMENTATION`

## Hard boundaries

- Production and production DB are forbidden.
- Vercel project `rezno` is forbidden.
- Gemini is forbidden on staging and production in Gate 9B.
- APNs/FCM, real payment, real storage, and app-store provider validation are
  out of scope.
- Migration 52 and Prisma schema changes are forbidden.
- Stage 7 external validation remains deferred.
- PR #100 remains out of scope.

## Secret handling

Gate 9B evidence prints names and redacted hashes only. It must never print:

- `DATABASE_URL`;
- database host or role;
- passwords;
- authorization headers;
- session cookies;
- OIDC tokens;
- provider keys;
- payment or push secrets.

## Fail-closed posture

The scripts refuse staging writes unless the target database, restore point,
runtime URL, origin, and Admin authority are proven first. Provider-dependent
jobs must report `NOT_CONFIGURED` truthfully when their provider is unavailable.

