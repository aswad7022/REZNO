import "server-only";

import sharp, { type OutputInfo } from "sharp";
import type { MediaRenditionProfile } from "@prisma/client";

import { mediaRenditionPolicy } from "@/features/media/domain/rendition-registry";
import { STORAGE_MAX_DECODED_PIXELS, sha256Hex } from "@/features/storage/domain/policy";
import { inspectStaticRaster } from "@/features/storage/inspection/image-inspector";

export async function renderMediaRendition(bytes: Uint8Array, profile: MediaRenditionProfile) {
  const source = await inspectStaticRaster(bytes);
  if (source.outcome !== "VALID" || !source.width || !source.height || source.pages !== 1) {
    throw new MediaRenditionProcessingError("UNSAFE_SOURCE");
  }
  const policy = mediaRenditionPolicy(profile);
  let rendered: { data: Buffer; info: OutputInfo };
  try {
    rendered = await sharp(bytes, {
      animated: false,
      failOn: "warning",
      limitInputPixels: STORAGE_MAX_DECODED_PIXELS,
      sequentialRead: true,
    })
      .rotate()
      .resize({
        fit: "inside",
        height: policy.maxHeight,
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: true,
        width: policy.maxWidth,
      })
      .webp({ effort: policy.effort, quality: policy.quality, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new MediaRenditionProcessingError("PROCESSING_FAILED");
  }
  const { data, info } = rendered;
  if (info.format !== "webp"
    || info.width < 1 || info.width > policy.maxWidth
    || info.height < 1 || info.height > policy.maxHeight
    || data.byteLength < 1 || data.byteLength > policy.maxBytes) {
    throw new MediaRenditionProcessingError("OUTPUT_BOUND_EXCEEDED");
  }
  const metadata = await sharp(data, { animated: true, failOn: "warning" }).metadata();
  if (metadata.pages && metadata.pages > 1
    || metadata.exif || metadata.icc || metadata.iptc || metadata.xmp) {
    throw new MediaRenditionProcessingError("OUTPUT_METADATA_PRESENT");
  }
  return {
    bytes: new Uint8Array(data),
    checksumSha256: sha256Hex(data),
    height: info.height,
    mimeType: "image/webp" as const,
    sizeBytes: data.byteLength,
    width: info.width,
  };
}

export class MediaRenditionProcessingError extends Error {
  constructor(readonly safeCode: "UNSAFE_SOURCE" | "PROCESSING_FAILED" | "OUTPUT_BOUND_EXCEEDED" | "OUTPUT_METADATA_PRESENT") {
    super("Media rendition processing failed safely.");
    this.name = "MediaRenditionProcessingError";
  }
}
