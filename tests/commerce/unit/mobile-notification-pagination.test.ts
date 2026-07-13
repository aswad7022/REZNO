import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("mobile notifications expose cursor pagination and preserve snapshots on retryable failures", () => {
  const app = readFileSync(
    resolve(process.cwd(), "apps/mobile/App.tsx"),
    "utf8",
  );
  const api = readFileSync(
    resolve(process.cwd(), "apps/mobile/src/api/commerce.ts"),
    "utf8",
  );

  assert.match(api, /listNotifications: \(cursor\?: string\)/);
  assert.match(app, /listNotifications\(cursor \?\? undefined\)/);
  assert.match(app, /setHasNextPage\(result\.pageInfo\.hasNextPage\)/);
  assert.match(app, /setNextCursor\(result\.pageInfo\.nextCursor\)/);
  assert.match(app, /hasNextPage && nextCursor/);
  assert.match(app, /load\(nextCursor, true\)/);
  assert.match(app, /setRetryRequest\(\{ append, cursor \}\)/);
  assert.match(app, /error\.status === 401[\s\S]*setItems\(\[\]\)/);
});
