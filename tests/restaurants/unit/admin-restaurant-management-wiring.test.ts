import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Admin Restaurant booking views load current table details and historical preorder snapshots", async () => {
  const service = await readFile(
    new URL("../../../features/admin/services/admin-dashboard.ts", import.meta.url),
    "utf8",
  );
  const bookingsPage = await readFile(
    new URL("../../../app/admin/bookings/page.tsx", import.meta.url),
    "utf8",
  );
  const businessPage = await readFile(
    new URL("../../../app/admin/businesses/[id]/page.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    (service.match(/restaurantReservation:\s*\{/g) ?? []).length >= 2,
    "both Admin booking queries must load Restaurant management relationships",
  );
  assert.match(service, /table:\s*true/);
  assert.match(service, /items:\s*\{\s*include:\s*\{\s*menuItem:\s*true/);

  for (const page of [bookingsPage, businessPage]) {
    assert.match(page, /restaurantReservation\.guestCount/);
    assert.match(page, /restaurantReservation\.table\.name/);
    assert.match(page, /item\.itemNameSnapshot\s*\?\?\s*item\.menuItem\.name/);
    assert.match(page, /item\.currencySnapshot\s*\?\?\s*item\.menuItem\.currency/);
  }
});
