import { createHash } from "node:crypto";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)]),
    );
  }
  return value instanceof Date ? value.toISOString() : value;
}

export function platformJobCanonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function platformJobHash(value: unknown): string {
  return createHash("sha256").update(platformJobCanonicalJson(value)).digest("hex");
}

export function serializedUtf8Bytes(value: unknown): number {
  return Buffer.byteLength(platformJobCanonicalJson(value), "utf8");
}
