import { z } from "zod";

import { isSafePublicImageUrl } from "@/lib/security/public-image-url";

type ServiceValidationKey =
  | "serviceNameMin"
  | "serviceNameMax"
  | "descriptionMax"
  | "categoryInvalid"
  | "priceInvalid"
  | "durationInvalid"
  | "branchRequired"
  | "staffModeInvalid"
  | "staffRequired"
  | "urlInvalid";

type ServiceValidationTranslator = (key: ServiceValidationKey) => string;

export function createServiceSchema(t: ServiceValidationTranslator) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(2, t("serviceNameMin"))
      .max(120, t("serviceNameMax")),
    description: z
      .string()
      .trim()
      .max(2000, t("descriptionMax"))
      .transform((value) => value || null),
    imageUrl: z
      .string()
      .trim()
      .refine(
        (value) => !value || isSafePublicImageUrl(value),
        t("urlInvalid"),
      )
      .transform((value) => value || null),
    categoryId: z.string().uuid(t("categoryInvalid")),
    status: z.enum(["ACTIVE", "INACTIVE"]),
    staffSelectionMode: z.enum(
      ["NONE", "OPTIONAL", "REQUIRED"],
      t("staffModeInvalid"),
    ),
    price: z.coerce
      .number()
      .positive(t("priceInvalid"))
      .max(9999999999, t("priceInvalid")),
    durationMinutes: z.coerce
      .number()
      .int(t("durationInvalid"))
      .min(5, t("durationInvalid"))
      .max(1440, t("durationInvalid")),
    pricingType: z.enum(["FIXED", "STARTING_FROM"]),
    branchIds: z
      .array(z.string().uuid())
      .min(1, t("branchRequired"))
      .transform((ids) => [...new Set(ids)]),
    memberIds: z
      .array(z.string().uuid())
      .transform((ids) => [...new Set(ids)]),
  }).superRefine((value, context) => {
    if (value.staffSelectionMode === "REQUIRED" && value.memberIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["memberIds"],
        message: t("staffRequired"),
      });
    }
  });
}
