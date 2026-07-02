import { z } from "zod";

import { businessVerticals } from "@/features/businesses/config/verticals";

type Translate = (
  key:
    | "businessNameMin"
    | "businessNameMax"
    | "branchNameMin"
    | "branchNameMax"
    | "slugInvalid"
    | "businessVerticalRequired",
) => string;

export const businessOnboardingSchema = (t: Translate) => z.object({
  organizationName: z
    .string()
    .trim()
    .min(2, t("businessNameMin"))
    .max(120, t("businessNameMax")),
  branchName: z
    .string()
    .trim()
    .min(2, t("branchNameMin"))
    .max(120, t("branchNameMax")),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, t("slugInvalid"))
    .min(5, t("slugInvalid"))
    .max(80, t("slugInvalid")),
  vertical: z.enum(businessVerticals, {
    error: t("businessVerticalRequired"),
  }),
});
