# REZNO Marketplace Milestone 1 Device QA

QA date: 2026-07-12

Verdict: **PASS WITH MINOR LIMITATIONS**

## Test environment

- iPhone 17 Pro Simulator, iOS 26.5.
- iPhone 17e Simulator, iOS 26.5.
- Expo 57 development client.

## Results

| Area | Result | Notes |
| --- | --- | --- |
| Bottom navigation | PASS | RTL physical order, active states, and Activity launcher behavior were verified. |
| Home | PASS | Service entry points remain separate from the commerce Market shell. |
| Market shell | PASS | Truthful coming-soon content is shown without fabricated product or commerce data. |
| REZNO AI | PASS | Coming-soon state and accessibility labeling were verified. |
| My Activity | PASS | Bookings, favorites, and orders routes remain reachable; orders show a truthful empty state. |
| Narrow-screen layout | PASS | The iPhone 17e layout remained usable without clipping or navigation overlap. |
| Reduced Motion | PASS | Activity navigation remains usable with system Reduced Motion enabled. |
| Regression | PASS | Existing Home service discovery, bookings, favorites, and account navigation remained reachable. |
| VoiceOver | BLOCKED | The iOS 26.5 Simulator Settings application did not expose VoiceOver. Opening `prefs:root=ACCESSIBILITY&path=VOICEOVER_TITLE` failed with `LSApplicationWorkspaceErrorDomain` code `115`, so an actual screen-reader traversal could not be completed in this runtime. |

## Defects fixed during QA

1. Corrected the Activity favorites label from `المفضلة` to `مفضلتي`.
2. Kept My Activity visually active while bookings, orders, or favorites are open.
3. Added an explicit accessibility label to the REZNO AI coming-soon state.
4. Improved the Activity launcher accessibility hint and made the Activity tab close its open modal consistently.
5. Corrected the Favorites empty-state action from `استكشف السوق` to `استكشف الخدمات` so it returns to service discovery rather than the commerce shell.

## Known platform warning

The existing React Native core `SafeAreaView` deprecation warning remains. It predates this milestone and requires a separately reviewed dependency migration to `react-native-safe-area-context`; no package or native configuration was changed here.

## Validation

The final pre-commit validation set comprises:

- `npm run lint`
- scoped ESLint for the changed mobile and supporting TypeScript files
- `cd apps/mobile && npm run typecheck`
- `npx --no-install prisma validate`
- `npx --no-install prisma migrate status`
- isolated Next.js production build with Webpack
- `cd apps/mobile && npx --no-install expo export --platform ios ...`
- `git diff --check`

All commands passed on 2026-07-12. Prisma reported 20 existing migrations and a current local PostgreSQL schema. The Webpack production build completed with 49 routes, and the Expo iOS export completed successfully.

## Milestone boundary

No Milestone 2 product, store, cart, order, inventory, payment, or shipment models, migrations, APIs, mutations, or fake production commerce data were introduced. Milestone 1 contains navigation and truthful shell/empty states only; the proposed commerce model remains documentation for future review.

## Release requirement

Production release still requires actual VoiceOver QA on a physical iPhone or another supported runtime where VoiceOver can be enabled and traversed end to end.
