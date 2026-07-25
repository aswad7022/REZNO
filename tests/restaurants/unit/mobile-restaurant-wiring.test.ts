import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production mobile routing separates restaurant and generic booking flows", async () => {
  const app = await readFile(new URL("../../../apps/mobile/App.tsx", import.meta.url), "utf8");
  assert.match(app, /selectedBusiness\.vertical === "RESTAURANT"/);
  assert.match(app, /selectedBusiness\.vertical === "CAFE"/);
  assert.match(app, /<CustomerRestaurantReservationCreationScreen/);
  assert.match(app, /<CustomerBookingCreationScreen/);
  assert.match(app, /<CustomerBookingsHubScreen/);
  const screen = await readFile(
    new URL("../../../apps/mobile/src/screens/customer-restaurant-reservation-creation-screen.tsx", import.meta.url),
    "utf8",
  );
  assert.match(screen, /createMobileRestaurantReservation/);
  assert.match(screen, /fetchMobileRestaurantReservationDetail/);
  assert.match(screen, /createRestaurantReservationSubmissionGate/);
  assert.match(screen, /formatToParts/);
  assert.ok(
    (screen.match(/idempotencyKey\.current = randomUUID\(\)/g) ?? []).length >= 4,
    "material selection changes must rotate the submission key",
  );
  assert.doesNotMatch(screen, /NEARBY_VISUAL_QA_FIXTURES|ReznoNearbyPreviewFlow|local reservation/);
  assert.doesNotMatch(screen, /Intl\.DateTimeFormat\("en-CA"/);
});

test("mobile management uses persisted Restaurant endpoints without service change requests or mocks", async () => {
  const hub = await readFile(
    new URL("../../../apps/mobile/src/screens/customer-bookings-hub-screen.tsx", import.meta.url),
    "utf8",
  );
  const screen = await readFile(
    new URL("../../../apps/mobile/src/screens/customer-restaurant-reservation-management-screen.tsx", import.meta.url),
    "utf8",
  );
  const service = await readFile(
    new URL("../../../features/restaurants/services/reservation-management.ts", import.meta.url),
    "utf8",
  );
  assert.match(hub, /domain === "services"/);
  assert.match(hub, /CustomerRestaurantReservationManagementScreen/);
  assert.match(screen, /fetchMobileManagedRestaurantReservations/);
  assert.match(screen, /cancelMobileRestaurantReservation/);
  assert.match(screen, /rescheduleMobileRestaurantReservation/);
  assert.match(screen, /selected\.updatedAt/);
  assert.match(screen, /optionsRequestSequence/);
  assert.match(screen, /retryDetailId/);
  assert.match(screen, /CANCELLATION_DEADLINE_PASSED/);
  assert.match(screen, /CAPACITY_UNAVAILABLE/);
  assert.match(screen, /RESTAURANT_CLOSED/);
  assert.match(screen, /selected\.activityHistory\.map/);
  assert.match(screen, /activityCreated/);
  assert.match(screen, /activityCancelled/);
  assert.match(screen, /activityRescheduled/);
  assert.match(screen, /activityStatusChanged/);
  assert.doesNotMatch(screen, /selected\.statusHistory|entry\.note/);
  assert.match(screen, /onAction=\{\(\) =>/);
  assert.match(service, /restaurantReservationMutation/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /expectedRestaurantBookingVersion/);
  assert.doesNotMatch(service, /bookingChangeRequest\.create/);
  assert.doesNotMatch(screen, /mock|fixture/i);
});

test("web and mobile creation both use the canonical shared service", async () => {
  const action = await readFile(
    new URL("../../../features/restaurants/actions/create-reservation.ts", import.meta.url),
    "utf8",
  );
  const route = await readFile(
    new URL("../../../app/api/mobile/restaurant-reservations/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(action, /createCustomerRestaurantReservation/);
  assert.match(route, /createCustomerRestaurantReservation/);
  assert.doesNotMatch(action, /ensureRestaurantReservationOffering|tableId/);

  const genericBookings = await readFile(
    new URL("../../../features/bookings/services/bookings.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    genericBookings,
    /canCustomerCancel:\s*!booking\.restaurantReservation\s*&&/,
  );
  assert.match(
    genericBookings,
    /canCustomerReschedule:\s*!booking\.restaurantReservation\s*&&/,
  );
});

test("web Restaurant creation distinguishes rate-limit outage from exhaustion before persistence", async () => {
  const action = await readFile(
    new URL(
      "../../../features/restaurants/actions/create-reservation.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const unavailableGuard = action.indexOf("if (rateLimit.unavailable)");
  const exhaustedGuard = action.indexOf("if (!rateLimit.success)");
  const createCall = action.indexOf(
    "const result = await createCustomerRestaurantReservation",
  );

  assert.ok(unavailableGuard >= 0, "the store outage must be handled");
  assert.ok(
    unavailableGuard < exhaustedGuard,
    "store outage must be checked before quota exhaustion",
  );
  assert.ok(
    exhaustedGuard < createCall,
    "both rate-limit failures must stop before Restaurant Reservation creation",
  );

  const unavailableBranch = action.slice(unavailableGuard, exhaustedGuard);
  assert.match(unavailableBranch, /failure\("unavailable"\)/u);
  assert.doesNotMatch(unavailableBranch, /rateLimited/u);

  const exhaustedBranch = action.slice(exhaustedGuard, createCall);
  assert.match(exhaustedBranch, /failure\("rateLimited"\)/u);
  assert.doesNotMatch(exhaustedBranch, /failure\("unavailable"\)/u);

  const localeFiles = ["ar", "en", "ckb"].map((locale) =>
    readFile(
      new URL(`../../../messages/${locale}.json`, import.meta.url),
      "utf8",
    ),
  );
  for (const source of await Promise.all(localeFiles)) {
    const messages = JSON.parse(source) as {
      RestaurantReservations: {
        errors: { rateLimited: string; unavailable: string };
      };
    };
    assert.ok(messages.RestaurantReservations.errors.unavailable.length > 0);
    assert.notEqual(
      messages.RestaurantReservations.errors.unavailable,
      messages.RestaurantReservations.errors.rateLimited,
    );
  }
});
