# Mobile Phase 29F — Salon Detail Reference Rebuild

## Status

SALON DETAIL REFERENCE VISUAL PASS / NO RUNTIME DATA INTEGRATION

This phase rebuilds the React Native + Expo Salon Detail screen to follow the approved premium dark and warm ivory reference layouts. The work is visual-only: no real-data integration, booking mutation, payment behavior, authentication behavior, database behavior, or API behavior was changed.

## Scope

- Salon Detail hero visual treatment.
- Rounded overlapping luxury detail panel.
- RTL salon identity and rating composition.
- Quick action tiles.
- Services tab and service rows.
- Booking CTA placement inside the detail panel.
- Route-specific hiding of the floating bottom navigation on Salon Detail only.
- Dark and day theme parity.

## Visual reference implementation

- The hero uses native local visual shapes and existing REZNO gold salon-light motifs rather than remote images.
- The detail panel overlaps the lower portion of the hero and uses theme-aware glass/ivory surfaces, thin gold borders, and subtle glow/shadow.
- The salon identity remains Arabic-first and RTL: salon name on the right, rating block on the left, and a favorite count pill in the upper identity row.
- Decorative REZNO gold frame/corner ornaments remain subtle and are positioned away from text, actions, service rows, and the CTA.

## Non-changes

- No API changes.
- No marketplace fetch changes.
- No database, Prisma schema, or migration changes.
- No auth changes.
- No package or lockfile changes.
- No EAS or deployment changes.
- No real booking/payment behavior changes.
- No new dependencies.

## QA request

Please verify in an Android development build:

1. Salon Detail dark theme: hero, action buttons, detail panel, services, and CTA visible.
2. Salon Detail light theme: hero, action buttons, detail panel, services, and CTA visible.
3. Scrolled state if needed: service rows and CTA are not clipped by the screen edge and no bottom navigation bar appears on Salon Detail.

## Decision recommendation

READY FOR CTO VISUAL REVIEW if validation passes and Android screenshots confirm the reference layout.
