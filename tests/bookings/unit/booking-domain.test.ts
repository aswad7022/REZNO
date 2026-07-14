import assert from "node:assert/strict";
import test from "node:test";

import {
  bookingCreationRequestHash,
  bookingReference,
  selectBookingSlots,
  selectionMatchesSlot,
} from "../../../features/bookings/domain/creation";

const memberA = "10000000-0000-4000-8000-000000000001";
const memberB = "10000000-0000-4000-8000-000000000002";
const selection = {
  branchServiceId: "20000000-0000-4000-8000-000000000001",
  date: "2026-07-20",
  memberId: memberA,
  startsAt: "2026-07-20T07:00:00.000Z",
};
const slots = [
  { ...selection, endsAt: "2026-07-20T07:30:00.000Z", memberName: "A" },
  {
    startsAt: selection.startsAt,
    endsAt: "2026-07-20T07:30:00.000Z",
    memberId: memberB,
    memberName: "B",
  },
  {
    startsAt: "2026-07-20T08:00:00.000Z",
    endsAt: "2026-07-20T08:30:00.000Z",
    memberId: memberA,
    memberName: "A",
  },
  {
    startsAt: "2026-07-20T09:00:00.000Z",
    endsAt: "2026-07-20T09:30:00.000Z",
    memberId: null,
    memberName: null,
  },
];

test("booking request hashes are stable and bind every selection field", () => {
  const first = bookingCreationRequestHash(selection);
  assert.equal(first, bookingCreationRequestHash({ ...selection }));
  assert.notEqual(
    first,
    bookingCreationRequestHash({ ...selection, memberId: memberB }),
  );
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(
    bookingReference("12345678-90ab-4cde-8fab-1234567890ab"),
    "RZ-1234567890AB",
  );
});

test("slot policy separates NONE, OPTIONAL automatic, REQUIRED, and specific staff", () => {
  assert.deepEqual(selectBookingSlots(slots, "NONE", null), [slots[3]]);
  assert.deepEqual(
    selectBookingSlots(slots, "OPTIONAL", memberB),
    [slots[1]],
  );
  assert.deepEqual(
    selectBookingSlots(slots, "OPTIONAL", null).map((slot) => slot.startsAt),
    ["2026-07-20T07:00:00.000Z", "2026-07-20T08:00:00.000Z", "2026-07-20T09:00:00.000Z"],
  );
  assert.deepEqual(selectBookingSlots(slots, "REQUIRED", null), []);
  assert.equal(selectionMatchesSlot(selection, slots[0]!), true);
  assert.equal(selectionMatchesSlot(selection, slots[1]!), false);
});
