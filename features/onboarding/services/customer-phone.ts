export type CustomerPhoneValidationCode =
  | "PHONE_INVALID"
  | "PHONE_REQUIRED";

export type CustomerPhoneValidationResult =
  | { code: CustomerPhoneValidationCode; ok: false }
  | { ok: true; value: string };

export function validateCustomerPhone(
  value: unknown,
): CustomerPhoneValidationResult {
  if (typeof value !== "string" || !value.trim()) {
    return { code: "PHONE_REQUIRED", ok: false };
  }

  const trimmed = value.trim();
  if (trimmed.length > 30 || !/^\+?[0-9\s()-]+$/.test(trimmed)) {
    return { code: "PHONE_INVALID", ok: false };
  }

  const normalized = trimmed.replace(/[\s()-]/g, "");
  const digits = normalized.startsWith("+")
    ? normalized.slice(1)
    : normalized;

  if (digits.length < 7 || digits.length > 15) {
    return { code: "PHONE_INVALID", ok: false };
  }

  return { ok: true, value: normalized };
}
