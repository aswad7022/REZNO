export const MOBILE_AUTH_MIN_PASSWORD_LENGTH = 8;

export type MobileAuthMode = "signin" | "signup";

export type MobileAuthFormValues = {
  email: string;
  name: string;
  password: string;
  phone: string;
};

export type MobileAuthValidationCode =
  | "EMAIL_INVALID"
  | "EMAIL_REQUIRED"
  | "NAME_REQUIRED"
  | "PHONE_INVALID"
  | "PHONE_REQUIRED"
  | "PASSWORD_TOO_SHORT";

type MobileAuthValidationResult =
  | {
      code: MobileAuthValidationCode;
      field: "email" | "name" | "password" | "phone";
      ok: false;
    }
  | {
      ok: true;
      values: MobileAuthFormValues;
    };

export function validateMobileAuthForm(
  mode: MobileAuthMode,
  values: MobileAuthFormValues,
): MobileAuthValidationResult {
  const normalized = {
    email: values.email.trim().toLowerCase(),
    name: values.name.trim(),
    password: values.password,
    phone: values.phone.trim(),
  };

  if (mode === "signup" && !normalized.name) {
    return { code: "NAME_REQUIRED", field: "name", ok: false };
  }

  if (mode === "signup") {
    const phone = validateMobilePhone(normalized.phone);
    if (!phone.ok) return phone;
    normalized.phone = phone.value;
  }

  if (!normalized.email) {
    return { code: "EMAIL_REQUIRED", field: "email", ok: false };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
    return { code: "EMAIL_INVALID", field: "email", ok: false };
  }

  if (normalized.password.length < MOBILE_AUTH_MIN_PASSWORD_LENGTH) {
    return { code: "PASSWORD_TOO_SHORT", field: "password", ok: false };
  }

  return { ok: true, values: normalized };
}

export function validateMobilePhone(
  value: string,
):
  | {
      code: "PHONE_INVALID" | "PHONE_REQUIRED";
      field: "phone";
      ok: false;
    }
  | { ok: true; value: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { code: "PHONE_REQUIRED", field: "phone", ok: false };
  }

  if (trimmed.length > 30 || !/^\+?[0-9\s()-]+$/.test(trimmed)) {
    return { code: "PHONE_INVALID", field: "phone", ok: false };
  }

  const normalized = trimmed.replace(/[\s()-]/g, "");
  const digits = normalized.startsWith("+")
    ? normalized.slice(1)
    : normalized;

  if (digits.length < 7 || digits.length > 15) {
    return { code: "PHONE_INVALID", field: "phone", ok: false };
  }

  return { ok: true, value: normalized };
}
