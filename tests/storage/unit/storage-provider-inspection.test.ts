import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { detectRasterMagic, inspectStaticRaster } from "../../../features/storage/inspection/image-inspector";
import { DeterministicStorageProvider } from "../../../features/storage/providers/deterministic";
import { sha256Hex } from "../../../features/storage/domain/policy";

const objectKey = "test/internal-storage-test/10000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002";

test("structural inspection validates decoded JPEG, PNG, and WebP", async () => {
  for (const format of ["jpeg", "png", "webp"] as const) {
    const bytes = await sharp({
      create: { background: { alpha: 1, b: 3, g: 2, r: 1 }, channels: 4, height: 3, width: 4 },
    })[format]().toBuffer();
    const result = await inspectStaticRaster(bytes);
    assert.equal(result.outcome, "VALID");
    assert.equal(result.actualMimeType, `image/${format}`);
    assert.equal(result.width, 4);
    assert.equal(result.height, 3);
    assert.equal(result.pages, 1);
    assert.equal(result.checksumSha256, sha256Hex(bytes));
  }
});

test("magic-byte policy rejects SVG, GIF, PDF, ZIP, and arbitrary bytes", async () => {
  for (const value of [
    Buffer.from("<svg><script>alert(1)</script></svg>"),
    Buffer.from("GIF89a", "ascii"),
    Buffer.from("%PDF-1.7", "ascii"),
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from("unknown"),
  ]) {
    assert.equal(detectRasterMagic(value), null);
    assert.equal((await inspectStaticRaster(value)).outcome, "INVALID_TYPE");
  }
});

test("animated WebP is rejected", async () => {
  const frames = Buffer.from([
    255, 0, 0, 255,
    0, 0, 255, 255,
  ]);
  const animated = await sharp(frames, {
    raw: { channels: 4, height: 2, pageHeight: 1, width: 1 },
  }).webp({ delay: [100, 100], loop: 0 }).toBuffer();
  const metadata = await sharp(animated, { animated: true }).metadata();
  assert.equal(metadata.pages, 2);
  assert.equal((await inspectStaticRaster(animated)).outcome, "ANIMATED_NOT_ALLOWED");
});

test("oversized decoded dimensions are bounded before decode", async () => {
  const oversized = await sharp({
    create: { background: "white", channels: 3, height: 6400, width: 6400 },
  }).png().toBuffer();
  assert.equal((await inspectStaticRaster(oversized)).outcome, "DECOMPRESSION_LIMIT_EXCEEDED");
});

test("trailing polyglot payloads are rejected for every supported raster container", async () => {
  for (const format of ["jpeg", "png", "webp"] as const) {
    const raster = await sharp({
      create: { background: "white", channels: 3, height: 1, width: 1 },
    })[format]().toBuffer();
    const polyglot = Buffer.concat([raster, Buffer.from("<script>alert(1)</script>")]);
    assert.equal((await inspectStaticRaster(polyglot)).outcome, "INVALID_STRUCTURE");
  }
});

test("deterministic provider covers success, missing, mismatch, transient, delete retry, and signed targets", async () => {
  const provider = new DeterministicStorageProvider();
  const bytes = await sharp({
    create: { background: "red", channels: 3, height: 1, width: 1 },
  }).png().toBuffer();
  assert.deepEqual(await provider.headObject({ objectKey, provider: provider.kind }), { outcome: "NOT_FOUND" });
  provider.putObject({
    bytes,
    contentType: "image/png",
    deleteOutcomes: ["TRANSIENT_FAILURE", "READY"],
    objectKey,
  });
  const head = await provider.headObject({ objectKey, provider: provider.kind });
  assert.equal(head.outcome, "READY");
  if (head.outcome === "READY") {
    assert.equal(head.sizeBytes, bytes.byteLength);
    assert.equal(head.contentType, "image/png");
    assert.equal(head.checksumSha256, sha256Hex(bytes));
  }
  const expiry = new Date("2026-07-19T12:05:00.000Z");
  const upload = await provider.createUploadTarget({ contentType: "image/png", expiresAt: expiry, objectKey, sizeBytes: bytes.byteLength });
  assert.equal(upload.outcome, "READY");
  if (upload.outcome === "READY") {
    assert.equal(upload.expiresAt, expiry);
    assert.equal(upload.headers["content-length"], String(bytes.byteLength));
    assert.equal(upload.headers["if-none-match"], "*");
    assert.equal(upload.writeOnce, true);
    assert.match(upload.url, /^https:\/\/deterministic-storage\.invalid\/upload\//);
  }
  const download = await provider.createDownloadTarget({ expiresAt: expiry, objectKey, provider: provider.kind, visibility: "INTERNAL" });
  assert.equal(download.outcome, "READY");
  if (download.outcome === "READY") assert.match(download.url, /^https:\/\/deterministic-storage\.invalid\/download\//);
  assert.throws(() => provider.putObject({ bytes, contentType: "image/png", objectKey }));
  assert.deepEqual(await provider.deleteObject({ objectKey, provider: provider.kind }), { outcome: "TRANSIENT_FAILURE" });
  assert.equal(provider.hasObject(objectKey), true);
  assert.deepEqual(await provider.deleteObject({ objectKey, provider: provider.kind }), { outcome: "READY" });
  assert.equal(provider.hasObject(objectKey), false);
});

test("deterministic provider rejects traversal and mismatched provider identity", async () => {
  const provider = new DeterministicStorageProvider();
  assert.throws(() => provider.putObject({ bytes: Buffer.from("x"), contentType: "image/png", objectKey: "test/../../escape" }));
  await assert.rejects(provider.headObject({ objectKey, provider: "NOT_CONFIGURED" }));
});
