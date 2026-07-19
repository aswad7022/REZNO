import assert from "node:assert/strict";
import test from "node:test";

import { decodeStorageCursor, encodeStorageCursor, storageCursorFilter, storageCursorScope } from "../../../features/storage/domain/cursor";
import { setStorageCursorSigningSecretForTests } from "../../../features/storage/domain/cursor-signing";
import { StorageDomainError } from "../../../features/storage/domain/errors";

const secret = "storage-gate-5a-cursor-secret-with-high-entropy-2026-07-19-!@#";
const timestamp = "2026-07-19T12:00:00.123456Z";
const id = "10000000-0000-4000-8000-000000000001";

test("storage cursors authenticate exact microseconds and bind scope/filter/page size/domain", () => {
  setStorageCursorSigningSecretForTests(secret);
  const filter = storageCursorFilter({ purpose: null, state: "READY" });
  const scope = storageCursorScope({ kind: "customer", personId: id });
  const cursor = encodeStorageCursor("ASSET", {
    filter,
    id,
    pageSize: 20,
    scope,
    snapshot: timestamp,
    sortValue: timestamp,
  });
  const decoded = decodeStorageCursor("ASSET", cursor, { filter, pageSize: 20, scope }, timestamp);
  assert.equal(decoded.sortValue, timestamp);
  assert.equal(decoded.snapshot, timestamp);
  for (const operation of [
    () => decodeStorageCursor("SESSION", cursor, { filter, pageSize: 20, scope }, timestamp),
    () => decodeStorageCursor("ASSET", cursor, { filter, pageSize: 21, scope }, timestamp),
    () => decodeStorageCursor("ASSET", cursor, { filter: storageCursorFilter({ state: "REJECTED" }), pageSize: 20, scope }, timestamp),
    () => decodeStorageCursor("ASSET", cursor, { filter, pageSize: 20, scope: storageCursorScope({ kind: "customer", personId: "20000000-0000-4000-8000-000000000002" }) }, timestamp),
    () => decodeStorageCursor("ASSET", `${cursor.slice(0, -1)}A`, { filter, pageSize: 20, scope }, timestamp),
  ]) assert.throws(operation, (error) => error instanceof StorageDomainError && error.code === "INVALID_CURSOR");
  setStorageCursorSigningSecretForTests(undefined);
});

test("storage cursor rejects non-canonical timestamps and future snapshots", () => {
  setStorageCursorSigningSecretForTests(secret);
  const filter = storageCursorFilter(null);
  const scope = storageCursorScope({ kind: "admin" });
  assert.throws(() => encodeStorageCursor("SESSION", {
    filter,
    id,
    pageSize: 10,
    scope,
    snapshot: "2026-07-19T12:00:00.123Z",
    sortValue: timestamp,
  }), StorageDomainError);
  const future = "2026-07-19T12:00:01.000000Z";
  const cursor = encodeStorageCursor("SESSION", { filter, id, pageSize: 10, scope, snapshot: future, sortValue: future });
  assert.throws(() => decodeStorageCursor("SESSION", cursor, { filter, pageSize: 10, scope }, timestamp), StorageDomainError);
  setStorageCursorSigningSecretForTests(undefined);
});
