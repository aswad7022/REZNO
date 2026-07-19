import sharp from "sharp";
import type {
  StorageInspectionOutcome,
  StorageScannerOutcome,
} from "@prisma/client";

import {
  STORAGE_MAX_DECODED_PIXELS,
  sha256Hex,
} from "@/features/storage/domain/policy";
import type { StorageMimeType } from "@/features/storage/domain/purpose-registry";

export type StructuralInspectionResult = Readonly<{
  actualMimeType: StorageMimeType | null;
  checksumSha256: string;
  format: "jpeg" | "png" | "webp" | null;
  height: number | null;
  outcome: StorageInspectionOutcome;
  pages: number | null;
  width: number | null;
}>;

export interface MalwareScanner {
  inspect(input: Readonly<{
    bytes: Uint8Array;
    checksumSha256: string;
  }>): Promise<StorageScannerOutcome>;
}

export class NotConfiguredMalwareScanner implements MalwareScanner {
  async inspect() {
    return "SCANNER_NOT_CONFIGURED" as const;
  }
}

export async function inspectStaticRaster(
  bytes: Uint8Array,
): Promise<StructuralInspectionResult> {
  const checksumSha256 = sha256Hex(bytes);
  const magicMime = detectRasterMagic(bytes);
  if (!magicMime) return invalid("INVALID_TYPE", checksumSha256);
  if (!hasExactRasterBoundary(bytes, magicMime)) {
    return invalid("INVALID_STRUCTURE", checksumSha256);
  }

  try {
    const metadata = await sharp(bytes, {
      animated: true,
      failOn: "warning",
      limitInputPixels: STORAGE_MAX_DECODED_PIXELS,
      sequentialRead: true,
    }).metadata();
    const actualMimeType = formatMime(metadata.format);
    if (!actualMimeType || actualMimeType !== magicMime) {
      return invalid("INVALID_TYPE", checksumSha256);
    }
    const width = metadata.width ?? null;
    const height = metadata.height ?? null;
    const pages = metadata.pages ?? 1;
    if (!width || !height || width < 1 || height < 1) {
      return invalid("INVALID_STRUCTURE", checksumSha256);
    }
    if (pages > 1) {
      return {
        actualMimeType,
        checksumSha256,
        format: metadata.format as "jpeg" | "png" | "webp",
        height,
        outcome: "ANIMATED_NOT_ALLOWED",
        pages,
        width,
      };
    }
    if (width * height > STORAGE_MAX_DECODED_PIXELS) {
      return {
        actualMimeType,
        checksumSha256,
        format: metadata.format as "jpeg" | "png" | "webp",
        height,
        outcome: "DIMENSION_LIMIT_EXCEEDED",
        pages,
        width,
      };
    }
    // Force a bounded decode so truncated/polyglot structures cannot pass metadata-only inspection.
    await sharp(bytes, {
      failOn: "warning",
      limitInputPixels: STORAGE_MAX_DECODED_PIXELS,
      sequentialRead: true,
    }).raw().toBuffer();
    return {
      actualMimeType,
      checksumSha256,
      format: metadata.format as "jpeg" | "png" | "webp",
      height,
      outcome: "VALID",
      pages,
      width,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const outcome = /pixel limit|limitInputPixels|too large/i.test(message)
      ? "DECOMPRESSION_LIMIT_EXCEEDED"
      : "INVALID_STRUCTURE";
    return invalid(outcome, checksumSha256);
  }
}

export function detectRasterMagic(bytes: Uint8Array): StorageMimeType | null {
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.byteLength >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) return "image/png";
  if (
    bytes.byteLength >= 12
    && ascii(bytes, 0, 4) === "RIFF"
    && ascii(bytes, 8, 12) === "WEBP"
  ) return "image/webp";
  return null;
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

function formatMime(format: string | undefined): StorageMimeType | null {
  if (format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  return null;
}

function hasExactRasterBoundary(bytes: Uint8Array, mime: StorageMimeType) {
  if (mime === "image/jpeg") {
    return bytes.byteLength >= 4
      && bytes[bytes.byteLength - 2] === 0xff
      && bytes[bytes.byteLength - 1] === 0xd9;
  }
  if (mime === "image/webp") {
    if (bytes.byteLength < 12) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return view.getUint32(4, true) + 8 === bytes.byteLength;
  }
  let offset = 8;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (offset + 12 <= bytes.byteLength) {
    const chunkLength = view.getUint32(offset, false);
    const next = offset + 12 + chunkLength;
    if (!Number.isSafeInteger(next) || next > bytes.byteLength) return false;
    const chunkType = ascii(bytes, offset + 4, offset + 8);
    if (chunkType === "IEND") return chunkLength === 0 && next === bytes.byteLength;
    offset = next;
  }
  return false;
}

function invalid(
  outcome: Exclude<StorageInspectionOutcome, "VALID">,
  checksumSha256: string,
): StructuralInspectionResult {
  return {
    actualMimeType: null,
    checksumSha256,
    format: null,
    height: null,
    outcome,
    pages: null,
    width: null,
  };
}
