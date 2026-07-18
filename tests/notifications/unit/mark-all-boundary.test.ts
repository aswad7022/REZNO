import assert from "node:assert/strict";
import test from "node:test";

import { NotificationDomainError } from "../../../features/notifications/domain/errors";
import { assertMarkAllSnapshotCurrent } from "../../../features/notifications/domain/mark-all";

test("mark-all accepts past and exact authoritative snapshots", () => {
  const now = new Date("2026-07-18T10:00:00.000Z");
  assert.doesNotThrow(() => assertMarkAllSnapshotCurrent(new Date(now.getTime() - 1), now));
  assert.doesNotThrow(() => assertMarkAllSnapshotCurrent(now, now));
});

test("mark-all rejects one millisecond and five seconds in the future", () => {
  const now = new Date("2026-07-18T10:00:00.000Z");
  for (const offset of [1, 5_000]) {
    assert.throws(() => assertMarkAllSnapshotCurrent(new Date(now.getTime() + offset), now), (error) =>
      error instanceof NotificationDomainError && error.code === "VALIDATION_ERROR");
  }
});
