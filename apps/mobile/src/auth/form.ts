export const MOBILE_AUTH_MIN_PASSWORD_LENGTH = 8;

export type MobileAuthMode = "signin" | "signup";

export type MobileAuthFormValues = {
  email: string;
  name: string;
  password: string;
};

export type MobileAuthValidationCode =
  | "EMAIL_INVALID"
  | "EMAIL_REQUIRED"
  | "NAME_REQUIRED"
  | "PASSWORD_TOO_SHORT";

type MobileAuthValidationResult =
  | {
      code: MobileAuthValidationCode;
      field: "email" | "name" | "password";
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
  };

  if (mode === "signup" && !normalized.name) {
    return { code: "NAME_REQUIRED", field: "name", ok: false };
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
