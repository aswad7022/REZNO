import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOKING_QA_CONFIRMATION_ENV,
  BOOKING_QA_CONFIRMATION_TOKEN,
  BookingQaSeedSafetyError,
  validateBookingQaSeedEnvironment,
} from "../../../scripts/staging/booking-qa-seed-safety";

const confirmation = {
  [BOOKING_QA_CONFIRMATION_ENV]: BOOKING_QA_CONFIRMATION_TOKEN,
};

test("Booking QA seed requires confirmation and an explicit non-production staging target", () => {
  const blocked = [
    {},
    { ...confirmation },
    { ...confirmation, DATABASE_URL: "mysql://stage.example/rezno_staging" },
    { ...confirmation, DATABASE_URL: "postgresql://db.example/rezno" },
    { ...confirmation, DATABASE_URL: "postgresql://stage.example/rezno_prod" },
    { ...confirmation, DATABASE_URL: "postgresql://stage.example/rezno_live" },
  ];
  for (const environment of blocked) {
    assert.throws(
      () => validateBookingQaSeedEnvironment(environment),
      BookingQaSeedSafetyError,
    );
  }
  const databaseUrl = "postgresql://operator:secret@stage.example/rezno?schema=public";
  assert.deepEqual(
    validateBookingQaSeedEnvironment({ ...confirmation, DATABASE_URL: databaseUrl }),
    { databaseUrl },
  );
});

test("Booking QA safety errors never echo database credentials", () => {
  const secret = "booking-super-secret";
  assert.throws(
    () =>
      validateBookingQaSeedEnvironment({
        ...confirmation,
        DATABASE_URL: `postgresql://operator:${secret}@stage.example/rezno_production`,
      }),
    (error) => {
      assert.ok(error instanceof BookingQaSeedSafetyError);
      assert.equal(error.message.includes(secret), false);
      return true;
    },
  );
});
