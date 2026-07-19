import assert from "node:assert/strict";
import test from "node:test";

import {
  compareExactPostgresTimestamps,
  parseExactPostgresTimestamp,
} from "../../../lib/db/postgres-timestamp";

test("exact PostgreSQL cursor timestamps require canonical UTC microseconds", () => {
  const older = parseExactPostgresTimestamp("2026-07-19T09:00:00.123400Z");
  const newer = parseExactPostgresTimestamp("2026-07-19T09:00:00.123456Z");
  assert.ok(older);
  assert.ok(newer);
  assert.equal(compareExactPostgresTimestamps(older, newer), -1);
  assert.equal(compareExactPostgresTimestamps(newer, older), 1);
  assert.equal(compareExactPostgresTimestamps(older, older), 0);

  for (const malformed of [
    "2026-07-19T09:00:00.123Z",
    "2026-07-19T09:00:00.1234567Z",
    "2026-07-19T09:00:00.123456+00:00",
    "2026-02-29T09:00:00.123456Z",
    "2024-02-30T09:00:00.123456Z",
    "2026-13-01T09:00:00.123456Z",
    "2026-07-19T24:00:00.123456Z",
    "0000-01-01T00:00:00.000000Z",
    "not-a-timestamp",
    null,
  ]) assert.equal(parseExactPostgresTimestamp(malformed), null);

  assert.ok(parseExactPostgresTimestamp("2024-02-29T23:59:59.999999Z"));
});
