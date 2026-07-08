# Mobile Phase 29D — Home Reference Pixel-Match Rebuild

## Status

HOME REFERENCE VISUAL PASS / NO RUNTIME DATA INTEGRATION

This phase rebuilds the mobile Home screen presentation against the owner-provided Home screenshot. It does not approve production release, does not connect real marketplace data, and does not change runtime backend behavior.

Focused fix pass: after CTO visual review, PR #90 was tightened further for the Home header/location composition, compact top-right controls, greeting/search rhythm, dark glass category card scale, venue-like native media panels, promo card proportions, and floating bottom navigation pill.

Focused fix pass 2: PR #90 was tightened again for the bottom navigation icon system, native compass Explore mark, layered premium center plus button, shorter floating glass nav pill, promo gradient/ticket treatment, reduced Home bottom whitespace, lighter category icon containers, and stronger native venue-like business media.

Focused fix pass 4: Home language selection was removed from the header and kept in Account/settings. Home now uses a local `ليلي / نهاري` theme selector, with night remaining the default and day mode wired to the existing light theme. Home content order is now `توصياتنا`, then `قريب منك`, then `جديد على REZNO`, with RTL section headers and the promo card copy aligned right opposite the ticket visual.

Focused fix pass 5: The owner-provided day-theme reference screenshot was used for the final Home ordering and day-mode correction. Home now renders Search, then the discount/ad card, then Categories, then `توصياتنا`, then `قريب منك`, then `جديد على REZNO`. The discount card is now a primary future ad slot directly below search, recommendations are a separate static curated section, language remains only in Account/settings, and Home keeps the `ليلي / نهاري` theme selector. No API, backend, database, package, or deployment behavior changed.

Focused fix pass 6: Home bottom scroll clearance was increased so `قريب منك` and `جديد على REZNO` can clear the floating bottom navigation. The residual Home gear-like circular Explore control was suppressed on Home while preserving the five-tab navigation and Account/settings access. Account language settings remain available, Home still has no language selector, and the default visual review locale remains Arabic. No data, API, backend, database, package, or deployment behavior changed.

Focused fix pass 7: The floating bottom navigation surface was made near-opaque in both night and day themes so Home card text no longer reads through the nav. Home-only bottom scroll clearance was increased again so the final `جديد على REZNO` section can scroll fully above the floating pill. No app-rendered Home settings gear was identified beyond previously suppressed Home nav chrome; any remaining gray gear-like control in emulator screenshots is treated as likely external development/emulator overlay.

Focused fix pass 8: The floating bottom navigation now uses solid dark and ivory surfaces instead of translucent glass, while preserving the rounded floating pill, border, shadow, and center plus. Home now includes an explicit final spacer after `جديد على REZNO` so the last section can clear the nav independently of generic scroll padding. Any remaining gray gear-like control in BlueStacks screenshots remains classified as likely external emulator/development overlay unless a real app-rendered component is identified.

## Reference

- Visual source of truth: attached owner Home screenshot from July 8, 2026.
- Scope is Home screen only.
- PR #89 remains unmerged and is not continued by this phase.

## Scope

- Home header/top chrome.
- Greeting and Arabic-first hierarchy.
- Search bar.
- 4x2 category grid.
- Nearby business cards.
- Promo coupon card.
- Bottom navigation visual treatment.

## Media approach

No new approved local business media assets were provided for this phase. The Home business cards therefore keep native view-based, image-like placeholders built from local UI shapes and existing bundled icon assets. The attached reference screenshot was not committed or used as a single static UI image.

Remaining media asset gap: production-quality local business photography or approved illustration assets are still needed for closer visual parity.

## Bottom navigation decision

The reference uses `استكشف` instead of `المفضلة`. This phase maps `استكشف` to the existing marketplace/search discovery screen while preserving the five-tab structure:

- الرئيسية
- استكشف
- +
- حجوزاتي
- الحساب

No new navigation infrastructure or runtime feature logic was added.

## Non-changes

- No API changes.
- No database changes.
- No staging seed changes.
- No backend route changes.
- No package or dependency changes.
- No EAS, deployment, publish, submit, or build changes.
- No real booking, payment, authentication, or marketplace data integration changes.

## Recommended next action

Run CTO visual review through the Android development build. If accepted, extend the same reference system to the remaining screens. If rejected, run one focused Home correction pass using new marked screenshots.
