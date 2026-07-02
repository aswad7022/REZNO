import { z } from "zod";

type SettingsValidationKey =
  | "businessVerticalInvalid"
  | "cancellationWindowInvalid"
  | "staffModeInvalid";
type SettingsValidationTranslator = (key: SettingsValidationKey) => string;

export function createBusinessSettingsSchema(t: SettingsValidationTranslator) {
  return z.object({
    bookingEnabled: z.string().optional().transform((value) => value === "on"),
    marketplaceVisible: z
      .string()
      .optional()
      .transform((value) => value === "on"),
    vertical: z.enum(
      [
        "BARBER",
        "BEAUTY",
        "CLINIC",
        "DENTIST",
        "SPA",
        "GYM",
        "CONSULTANT",
        "RESTAURANT",
        "CAFE",
        "OTHER",
      ],
      { error: t("businessVerticalInvalid") },
    ),
    staffSelectionMode: z.enum(["NONE", "OPTIONAL", "REQUIRED"], {
      error: t("staffModeInvalid"),
    }),
    cancellationWindowHours: z.coerce
      .number()
      .int(t("cancellationWindowInvalid"))
      .min(0, t("cancellationWindowInvalid"))
      .max(720, t("cancellationWindowInvalid")),
  });
}
