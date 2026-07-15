import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile Restaurant mutations carry the selected authoritative booking version", async () => {
  const validation = await readFile(
    new URL("../../../features/restaurants/api/validation.ts", import.meta.url),
    "utf8",
  );
  const client = await readFile(
    new URL("../../../apps/mobile/src/api/restaurant-reservations.ts", import.meta.url),
    "utf8",
  );
  const cancelRoute = await readFile(
    new URL("../../../app/api/mobile/restaurant-reservations/[bookingId]/cancel/route.ts", import.meta.url),
    "utf8",
  );
  const rescheduleRoute = await readFile(
    new URL("../../../app/api/mobile/restaurant-reservations/[bookingId]/reschedule/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(validation, /x-rezno-booking-version/);
  assert.ok(
    (client.match(/"X-Rezno-Booking-Version": bookingVersion/g) ?? []).length === 2,
    "cancel and reschedule must send the selected booking version",
  );
  for (const route of [cancelRoute, rescheduleRoute]) {
    assert.match(route, /parseRestaurantBookingVersion/);
    assert.match(route, /expectedBookingUpdatedAt/);
  }
});
