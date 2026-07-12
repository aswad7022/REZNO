# Milestone 2B — Shared Rate-Limiter Regression Review

Date: 2026-07-12

This targeted review covers only the shared in-process rate limiter extracted during Milestone 2B. Commerce catalog behavior, Prisma, Booking, service discovery, and later Marketplace milestones are unchanged.

## Runtime evidence and proxy decision

The installed Next.js 16.2.9 `NextRequest` type extends the Web `Request` API and exposes cookies, `nextUrl`, and URL helpers, but no supported `ip`, socket, or direct peer property. Standard route-handler `Request` is the Web API and likewise provides no socket. No affected route declares Edge runtime; these handlers/actions use the default Node runtime, but the Next route abstraction still does not expose the Node socket.

The repository has no `vercel.json`. `next.config.ts` configures response security headers only. `proxy.ts` does not match API routes and does not establish client identity. `docs/cloud-staging-setup.md` recommends Vercel and Neon or equivalents but does not prove a chosen edge, an overwrite rule, or the safety of a particular forwarding header.

Therefore proxy trust remains disabled when `REZNO_TRUSTED_PROXY_HEADER` is absent or invalid. A future deployment may set exactly `x-forwarded-for` or `x-real-ip` only after proving its trusted edge overwrites that header with one client IP. Appended chains are rejected rather than selecting a client-controlled first element.

## Client-key algorithm

1. When one trusted proxy header is explicitly configured, read only that header. Trim, require exactly one address (no comma), validate with Node `net.isIP`, normalize IPv4 or canonical lowercase/compressed IPv6, hash with SHA-256, and prefix `trusted-ip:`.
2. If the trusted header is missing or invalid, do not consult another forwarding header and do not use a proxy peer; use the fallback path.
3. With proxy trust disabled, ignore `x-forwarded-for` and `x-real-ip`. If the caller supplies a reliable direct peer address, validate/normalize/hash it and prefix `peer-ip:`.
4. The current Next route API supplies no reliable peer, so hash the available `user-agent`, `accept-language`, and `accept-encoding` fingerprint and prefix `fingerprint:`.
5. If neither peer nor fingerprint exists, generate an `ephemeral:` key. This deliberately fails open for an unidentifiable request rather than placing unrelated users in one global denial-of-service bucket. Such requests are not effectively rate-limited; verified edge identity plus a shared limiter is a production release gate.

No raw IP or fingerprint is retained in a key.

## Bounded in-memory state

The process-local store has a hard ceiling of 10,000 active buckets. Before adding at the ceiling, it removes expired buckets, then evicts oldest insertion-order buckets until space exists. Existing buckets retain their original fixed-window behavior. The trade-off is that high-cardinality abuse can evict older buckets; distributed edge/shared limiting remains required for production.

## Call-site inventory and compatibility

| Call site | Operation/runtime | Key before Milestone 2B | Final key | Limit/window before and after | Public behavior |
| --- | --- | --- | --- | --- | --- |
| `app/api/auth/[...all]/route.ts:13-14` | Better Auth POST route handler; default Node | first `x-forwarded-for`, else `x-real-ip`, fingerprint, then global fallback | exact configured trusted header; otherwise fingerprint/ephemeral | 30/60 seconds | 429 status, message body, and `Retry-After` unchanged; spoofable forwarding headers no longer work by default |
| `app/api/mobile/marketplace/route.ts:30-33` | Legacy mobile service-discovery GET; default Node | forwarding header/fingerprint/global fallback through `headers()` | exact configured trusted header; otherwise fingerprint/ephemeral | 120/60 seconds | `RATE_LIMITED` envelope and legacy discovery behavior unchanged; header trust hardened |
| `features/bookings/actions/manage-bookings.ts:36` | Authenticated booking server action; default Node | `Person.id` | `Person.id` | 6/60 seconds | unchanged redirect contract |
| `features/messages/actions/messages.ts:130` | Authenticated customer conversation server action | `Person.id` | `Person.id` | 10/60 seconds | unchanged error contract |
| `features/messages/actions/messages.ts:246` | Authenticated message-send server action | authenticated sender User ID | authenticated sender User ID | 20/60 seconds | unchanged error contract |
| `features/messages/actions/messages.ts:332` | Authenticated admin conversation server action | session User ID | session User ID | 20/60 seconds | unchanged error contract |
| `features/notifications/actions/admin-notifications.ts:35` | Authenticated admin notification server action | session User ID | session User ID | 10/60 seconds | unchanged error contract |
| `features/restaurants/actions/create-reservation.ts:139` | Authenticated restaurant-reservation server action | `Person.id` | `Person.id` | 6/60 seconds | unchanged redirect contract |
| `features/commerce/public/http.ts:20-25` | Six public Commerce route handlers; default Node | Milestone 2B fingerprint unless boolean proxy trust enabled | exact configured trusted header; otherwise fingerprint/ephemeral | collections 60/60 seconds; details 120/60 seconds | `RATE_LIMITED`, `Retry-After`, JSON, and `no-store` unchanged |

Better Auth GET is not rate-limited by this wrapper; that pre-existing scope is unchanged. Authenticated action keys never depend on proxy headers and are unaffected by the extraction.

## Proven defects and narrow corrections

The review found four concrete shared defects:

1. The extracted API could not represent a reliable direct peer even when a caller had one.
2. Boolean proxy trust selected the first `x-forwarded-for` chain entry without IP validation and fell through to another arbitrary forwarding header.
3. A completely unidentified request used one shared fallback key, enabling global-bucket denial of service.
4. Cleanup removed expired buckets after 500 entries but placed no ceiling on simultaneously active buckets.

The corrections add direct-peer input support, one explicit trusted-header choice, strict IPv4/IPv6 validation/normalization, ephemeral fail-open identity when nothing stable exists, and a hard bucket ceiling. Scope names, limits, windows, and existing response contracts were not changed.

## Test coverage

Node tests cover direct peers, missing peers, disabled and enabled proxy trust, forged and conflicting headers, comma-separated chains, malformed/empty IPv4/IPv6, whitespace/canonicalization, independent client buckets, fixed-window reset, expired cleanup, maximum bucket count, every pre-existing consumer’s source contract, Commerce collection/detail limits, spoof resistance, independent Commerce fingerprints, `429 RATE_LIMITED`, `Retry-After`, JSON, and `no-store`.

Validation on 2026-07-12 passed: 28 unit tests, 29 PostgreSQL integration tests, and 6 Commerce HTTP tests. Root lint, scoped lint, root TypeScript with incremental writes disabled, isolated Next 16.2.9 Webpack production build, isolated mobile typecheck, and isolated Expo iOS export all passed.

Production-handler smoke against the disposable test database confirmed the unchanged existing contracts. Better Auth returned its normal 404 for requests 1–30 to a deliberately absent action and wrapper `429` on request 31; another fingerprint remained independent. The legacy mobile Marketplace returned 200 for requests 1–120, wrapper `429 RATE_LIMITED` on request 121, and 200 for an independent fingerprint. Rotating forged forwarding headers did not bypass either limit with trust disabled. With `x-real-ip` explicitly configured, rotating user agents and conflicting `x-forwarded-for` values shared the validated `x-real-ip` bucket and request 61 received Commerce `429`; malformed trusted values fell back to independent fingerprints.

The two protected-file SHA-256 hashes were recorded before and after the isolated Next build, after the real-handler smoke, before and after the isolated mobile/Expo group, and at final validation. They remained unchanged throughout the targeted review.

## Release gates

- Prove the selected edge overwrites exactly one configured client-IP header.
- Configure `REZNO_TRUSTED_PROXY_HEADER` only after that proof.
- Replace process-local limiting with reviewed shared/edge enforcement.
- Load-test bucket eviction and catalog traffic under production-like concurrency.
