# Mobile Phase 29D — Home Reference Pixel-Match Rebuild

## Status

HOME REFERENCE VISUAL PASS / NO RUNTIME DATA INTEGRATION

This phase rebuilds the mobile Home screen presentation against the owner-provided Home screenshot. It does not approve production release, does not connect real marketplace data, and does not change runtime backend behavior.

Focused fix pass: after CTO visual review, PR #90 was tightened further for the Home header/location composition, compact top-right controls, greeting/search rhythm, dark glass category card scale, venue-like native media panels, promo card proportions, and floating bottom navigation pill.

Focused fix pass 2: PR #90 was tightened again for the bottom navigation icon system, native compass Explore mark, layered premium center plus button, shorter floating glass nav pill, promo gradient/ticket treatment, reduced Home bottom whitespace, lighter category icon containers, and stronger native venue-like business media.

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
