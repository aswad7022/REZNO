# Milestone 2B — Public Commerce Catalog and Search API

Date: 2026-07-12

This document defines the implemented, public, read-only Commerce catalog boundary. It builds on the approved Milestone 2A models without changing the Prisma schema or migrations. The legacy service-discovery Marketplace remains a separate domain and route family.

## Scope

Milestone 2B includes public categories, Store discovery and details, global and Store-scoped Product discovery, Product details, strict visibility, Arabic-aware PostgreSQL search, filters, opaque cursor pagination, DTO serialization, safe errors, conservative caching, process-local rate limiting, and test-only fixtures.

It explicitly excludes Cart, Checkout, Orders, favorites, notifications, merchant/admin APIs, mobile or web Marketplace UI, payments, and Milestones 2C/2D/2E.

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/commerce/public/categories` | Active categories containing at least one public Product |
| `GET` | `/api/commerce/public/stores` | Public Store discovery |
| `GET` | `/api/commerce/public/stores/[storeSlug]` | One public Store by scoped slug |
| `GET` | `/api/commerce/public/stores/[storeSlug]/products` | Public Products belonging to one public Store |
| `GET` | `/api/commerce/public/stores/[storeSlug]/products/[productSlug]` | One public Product resolved within Store scope |
| `GET` | `/api/commerce/public/products` | Global public Product discovery |

All routes are unauthenticated, read-only, dynamically evaluated, JSON-only, and return `Cache-Control: no-store, max-age=0`.

## Response contracts

Collections return:

```json
{
  "data": [],
  "pageInfo": { "nextCursor": null, "hasNextPage": false }
}
```

Details return `{ "data": {} }`. Errors return `{ "error": { "code": "...", "message": "..." } }` with stable codes `INVALID_QUERY`, `INVALID_CURSOR`, `NOT_FOUND`, `RATE_LIMITED`, and `INTERNAL_ERROR`. Unknown failures receive a generic message; SQL, Prisma text, and stack details are not serialized.

### Category DTO

`id`, `slug`, `name`, and `displayOrder`. No invented media, description, or count is returned.

### Store summary/detail DTO

- `id`, `slug`, `name`, `description`, `logoUrl`, `coverImageUrl`, `currency`.
- `minimumOrderValue` as a decimal string.
- `preparationEstimateMinutes`.
- `delivery`: `enabled`, `fee` as a decimal string, `estimateMinutes`, `city`, `area`.
- `pickup`: `enabled`, `instructions`, `city`, `area`.

Organization identifiers, membership, moderation state/reasons, internal timestamps, and private address/support fields are excluded. Store detail intentionally does not embed an unpaginated Product preview.

### Product summary DTO

- `id`, `slug`, `productSlug`, `storeSlug`, `name`, `description`.
- Category summary and Store summary.
- `primaryMediaUrl` from deterministic media order, or `null`; no placeholder is generated.
- `lowestPrice` and optional `highestPrice` as decimal strings, calculated from active public Variants only.
- `currency` and aggregate `inStock` boolean.

### Product detail DTO

The summary plus ordered `media` (`id`, `url`, `altText`, `mediaType`, `sortOrder`) and ordered active `variants` (`id`, `title`, `isDefault`, `optionValues`, `price`, `compareAtPrice`, `currency`, `inStock`). SKU and exact inventory are private.

All public money uses Prisma Decimal until explicit decimal-string serialization. No JavaScript floating-point money is used. Dates are not currently part of these DTOs; any future public date must be ISO-8601.

## Visibility predicates

A public Store has `status=ACTIVE`, `archivedAt IS NULL`, and a non-null `publishedAt`. Every other state and a missing Store resolve identically as `404 NOT_FOUND`.

A public Product has `status=PUBLISHED`, `archivedAt IS NULL`, a non-null `publishedAt`, an active category, a public Store, and at least one active, non-archived Variant. A public Variant has `status=ACTIVE` and `archivedAt IS NULL`. Product slugs are always resolved inside Store scope.

Out-of-stock Products remain visible. Availability is computed as `onHand - reserved > 0` and only a boolean leaves the DTO layer. Visibility filtering occurs inside PostgreSQL/Prisma queries; hidden records are not returned and then filtered in application memory.

## Query parameters

Common rules: `q` is trimmed and normalized; an empty value is absent; maximum length is 100 characters. `limit` defaults to 20 and must be an integer from 1 through 50. Duplicate parameters, unknown parameters, unsupported sorts, malformed slugs, and cursors longer than 2,048 characters are rejected.

Store collections support `q`, `category`, `fulfillment=delivery|pickup`, `sort=newest|name_asc`, `cursor`, and `limit`. Category membership is based on public Products only. Fulfillment uses the actual Store configuration.

Product collections support `q`, `store` (global route only), `category`, `inStock=true|false`, `minPrice`, `maxPrice`, `sort=newest|name_asc|price_asc|price_desc`, `cursor`, and `limit`. Prices must be nonnegative whole-IQD decimal strings; fractional IQD and `minPrice > maxPrice` are rejected. Price filters and sorts use active public Variants. A Store-scoped route supplies Store scope server-side and rejects a client `store` parameter.

Raw SQL fragments are selected only from internal allowlists. Every client value is a Prisma parameter, and `%`, `_`, and backslash are escaped for literal substring search.

## Search normalization and PostgreSQL strategy

Node-side query normalization applies Unicode NFKC, lowercase conversion, removal of Arabic tatweel and the documented Arabic combining-mark ranges, common Alef conversion (`أ`, `إ`, `آ`, `ٱ` → `ا`), Alef Maqsura conversion (`ى` → `ي`), trim, and whitespace collapse. It deliberately does not collapse `ة`, `ؤ`, or `ئ`.

The equivalent bounded PostgreSQL expression normalizes the stored public fields. Store search covers public Store name/description. Product search covers public Product name/description, active category name, and public Store name. Search is executed in PostgreSQL with parameterized normalized `%ILIKE%`; the catalog is never loaded wholesale into Node.js.

### `pg_trgm` decision

No Milestone 2B migration was added. Repository deployment documentation permits “Neon PostgreSQL or an equivalent managed PostgreSQL provider” but does not prove the selected target, extension privilege, or production ability to run `CREATE EXTENSION pg_trgm`. Introducing an extension-dependent migration would therefore exceed the available deployment evidence.

Trigram search and GIN expression indexes remain deferred until the selected staging/production database proves extension support and the exact normalization expression/index contract is rehearsed. Until then, query length is bounded to 100, page size to 50, and response caching is disabled. This fallback is functionally safe but not claimed to be production-scale search.

## Cursor contract

Cursors are opaque Base64URL JSON envelopes containing a version, allowlisted sort, filter/query/scope fingerprint, sort value, stable UUID tie-breaker, and integrity checksum. The fingerprint is SHA-256 over canonical filter state. The checksum detects accidental or client tampering; it is not an authentication token and contains no authorization decision.

Ordering always ends with Product/Store ID. `name_asc`, `price_asc`, `price_desc`, and `newest` preserve the matching comparison direction for both the sort value and ID. Reuse after changing query, Store scope, category, availability, price range, fulfillment, or sort returns `400 INVALID_CURSOR`. Global Product cursors cannot be reused on Store-scoped lists.

## Rate limiting and proxy trust

The existing process-local in-memory limiter is reused: 60 requests/minute for collections and 120 requests/minute for details. `429` returns `RATE_LIMITED` and `Retry-After`. Forwarded IP headers are ignored by default because clients can spoof them. A deployment may select exactly one header with `REZNO_TRUSTED_PROXY_HEADER=x-forwarded-for` or `REZNO_TRUSTED_PROXY_HEADER=x-real-ip` only after its trusted edge is proven to overwrite that header with one validated client IP. Chains and malformed IP values are rejected. The current Next.js route API does not expose a reliable direct peer address, so the fallback hashes the user-agent/language/encoding fingerprint. A request with neither a peer nor a fingerprint receives an ephemeral key (fail-open) instead of sharing one global denial-of-service bucket; such unidentified requests are not effectively rate-limited and require an edge/shared limiter before release.

Process-local limiting is development protection only. A shared production limiter (for example, a reviewed Redis-backed implementation) and verified edge proxy policy remain release gates.

## Query-plan review

Representative `EXPLAIN` plans were captured on the disposable `rezno_m2b_test` database. Tiny fixtures do not establish production-scale performance.

- Store visibility used `Store_status_publishedAt_idx`; final sort remained explicit.
- Product visibility used `Store_status_publishedAt_idx`, `Product_storeId_slug_key`, `MarketplaceCategory_status_displayOrder_idx`, and `ProductVariant_productId_optionKey_key` in the representative joined plan.
- Inventory lookup used `InventoryItem_variantId_key`; the tiny Product relation was a sequential scan before indexed Variant/Inventory joins.
- Normalized contains search remained a sequential scan because it is an expression-based leading-wildcard `ILIKE` without trigram support.
- Availability aggregation and price ordering require bounded work across active Variants. Existing Milestone 2A visibility/relation indexes help joins, but a production-like load test is required before catalog release.

## Test strategy and results

Tests use Node 24 `node:test` through the existing `tsx` dependency. PostgreSQL tests refuse a database whose name does not contain `test`/`_test`; fixtures are created only in tests and truncated between suites. Integration and HTTP scripts use concurrency 1 to prevent suites from resetting shared disposable fixtures concurrently.

- Unit: Arabic normalization, query/IQD bounds, cursor round-trip/tampering/fingerprint mismatch, DTO decimal serialization/privacy, safe errors, and proxy-header trust.
- PostgreSQL integration: every Store/Product visibility state; out-of-stock visibility; detail scoping; Arabic/Latin search; category/Store/fulfillment/stock/price filters; equal-name/equal-price/equal-time pagination; cursor scope rejection; privacy; and representative plans.
- HTTP handlers: all six routes, collection/detail envelopes, `400`, `404`, `429`, safe `500`, JSON content type, and no-store policy.
- Existing Milestone 2A PostgreSQL integration suite remains part of `test:commerce`, including Booking regression coverage.

Observed on 2026-07-12 against PostgreSQL 17 disposable database after all 21 approved migrations: 22 unit tests passed, 29 integration tests passed (23 Milestone 2A/Booking checks plus 6 Milestone 2B groups), and 4 HTTP groups passed. The full Commerce script runs all three suites sequentially.

## Known limitations and release gates

- `pg_trgm` and production-scale relevance/performance remain unproven.
- Rate limiting is process-local; distributed enforcement is not complete.
- Proxy-header trust must select one explicitly configured header only behind an overwriting trusted edge.
- No cache is used, prioritizing suspension correctness over performance.
- Tests invoke real route handlers; a disposable-database smoke through a running Next server is desirable in staging.
- The legacy integration suite emits an existing `pg` deprecation warning during a concurrent query scenario; this pass does not alter Milestone 2A concurrency code.
- Cart, Checkout, Orders, favorites, notifications, commerce UI, merchant/admin APIs, online payments, taxes, coupons, and later Marketplace milestones remain outside this implementation.
