import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production mobile booking routes to the API screen and never falls back to visual bookings", async () => {
  const source = await readFile(
    new URL("../../../apps/mobile/App.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /<CustomerBookingCreationScreen/);
  assert.match(source, /<CustomerBookingsHubScreen/);
  assert.doesNotMatch(source, /bookingVisualQaFixtures/);
  assert.doesNotMatch(source, /managedBookings/);
  assert.doesNotMatch(
    source,
    /selectedBusiness && !bookingFlowStep \? \(\s*<SalonDetailScreen/,
  );
});

test("mobile booking management exposes persisted list, detail, mutations, refresh, and recovery", async () => {
  const hub = await readFile(
    new URL("../../../apps/mobile/src/screens/customer-bookings-hub-screen.tsx", import.meta.url),
    "utf8",
  );
  const source = await readFile(
    new URL("../../../apps/mobile/src/screens/customer-booking-management-screen.tsx", import.meta.url),
    "utf8",
  );
  assert.match(hub, /<CustomerBookingManagementScreen/);
  assert.match(source, /fetchMobileManagedBookings/);
  assert.match(source, /fetchMobileBookingDetail/);
  assert.match(source, /cancelMobileBooking/);
  assert.match(source, /requestMobileBookingChange/);
  assert.match(source, /refreshAuthoritative/);
  assert.match(source, /mobileBookingManagementFailure/);
  assert.match(source, /mergeMobileBookingPage/);
  assert.doesNotMatch(source, /VisualBooking/);
});

test("mobile booking screen exposes loading, retry, persisted success, and recovery wiring", async () => {
  const source = await readFile(
    new URL("../../../apps/mobile/src/screens/customer-booking-creation-screen.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /status: "loading"/);
  assert.match(source, /status: "error", message: errorMessage\(error\)/);
  assert.match(source, /onAction=\{retryCurrent\}/);
  assert.match(source, /await createMobileBooking\(/);
  assert.match(source, /await fetchMobileBookingDetail\(/);
  assert.match(source, /setDetail\(persisted\.data\);\s*setStep\("detail"\)/);
  assert.match(source, /mobileBookingFailureRecovery\(requestError\?\.code\)/);
  assert.match(source, /recovery\.returnToSlots/);
  assert.match(source, /recovery\.requiresAuthentication/);
  assert.match(source, /onPress=\{onSignIn\}/);
});

test("web Booking creation distinguishes rate-limit outage from exhaustion before persistence", async () => {
  const source = await readFile(
    new URL(
      "../../../features/bookings/actions/manage-bookings.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const unavailableGuard = source.indexOf("if (rateLimit.unavailable)");
  const exhaustedGuard = source.indexOf("if (!rateLimit.success)");
  const createCall = source.indexOf(
    "const result = await createCustomerBooking",
  );

  assert.ok(unavailableGuard >= 0, "the store outage must be handled");
  assert.ok(
    unavailableGuard < exhaustedGuard,
    "store outage must be checked before quota exhaustion",
  );
  assert.ok(
    exhaustedGuard < createCall,
    "both rate-limit failures must stop before Booking creation",
  );

  const unavailableBranch = source.slice(unavailableGuard, exhaustedGuard);
  assert.match(
    unavailableBranch,
    /bookingErrorUrl\(\s*"unavailable"/u,
  );
  assert.doesNotMatch(unavailableBranch, /rateLimited/u);

  const exhaustedBranch = source.slice(exhaustedGuard, createCall);
  assert.match(exhaustedBranch, /bookingErrorUrl\(\s*"rateLimited"/u);
  assert.doesNotMatch(
    exhaustedBranch,
    /bookingErrorUrl\(\s*"unavailable"/u,
  );
});
