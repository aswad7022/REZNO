import assert from "node:assert/strict";
import test from "node:test";

import { BookingApiError, mapBookingApiError } from "../../../features/bookings/api/errors";
import {
  parseAvailabilityQuery,
  parseBookingIdempotencyKey,
  parseCreateBookingRequest,
} from "../../../features/bookings/api/validation";
import { BookingDomainError } from "../../../features/bookings/domain/errors";

const offeringId = "20000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000001";

test("booking API validates exact create DTOs and canonical timestamps", async () => {
  const request = new Request("https://rezno.invalid/api/mobile/bookings", {
    body: JSON.stringify({
      branchServiceId: offeringId,
      date: "2026-07-20",
      memberId,
      startsAt: "2026-07-20T07:00:00.000Z",
    }),
    headers: {
      "content-type": "application/json",
      "idempotency-key": "30000000-0000-4000-8000-000000000001",
    },
    method: "POST",
  });
  assert.deepEqual(await parseCreateBookingRequest(request.clone()), {
    branchServiceId: offeringId,
    date: "2026-07-20",
    memberId,
    startsAt: "2026-07-20T07:00:00.000Z",
  });
  assert.equal(
    parseBookingIdempotencyKey(request),
    "30000000-0000-4000-8000-000000000001",
  );

  await assert.rejects(
    parseCreateBookingRequest(
      new Request(request.url, {
        body: JSON.stringify({
          branchServiceId: offeringId,
          date: "2026-02-30",
          startsAt: "2026-02-30T07:00:00Z",
          customerId: memberId,
        }),
        method: "POST",
      }),
    ),
    (error) => error instanceof BookingApiError && error.code === "INVALID_REQUEST",
  );
});

test("availability query rejects duplicate, unknown, and malformed parameters", () => {
  assert.deepEqual(
    parseAvailabilityQuery(
      new URLSearchParams({ date: "2026-07-20", memberId }),
    ),
    { date: "2026-07-20", memberId },
  );
  for (const query of [
    "date=2026-07-20&date=2026-07-21",
    "date=2026-07-20&customerId=x",
    "date=not-a-date",
  ]) {
    assert.throws(
      () => parseAvailabilityQuery(new URLSearchParams(query)),
      (error) => error instanceof BookingApiError && error.code === "INVALID_REQUEST",
    );
  }
});

test("domain failures map to stable public API codes without internal details", () => {
  const conflict = mapBookingApiError(
    new BookingDomainError("SLOT_CONFLICT", "Slot conflict."),
  );
  assert.deepEqual(
    { code: conflict.code, status: conflict.status },
    { code: "SLOT_CONFLICT", status: 409 },
  );
  const internal = mapBookingApiError(new Error("secret database host"));
  assert.equal(internal.code, "INTERNAL_ERROR");
  assert.equal(internal.message.includes("secret"), false);
});
