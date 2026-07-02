import { z } from "zod";

type Translate = (
  key:
    | "firstNameMin"
    | "firstNameMax"
    | "optionalTextMax"
    | "phoneMax"
    | "phoneInvalid"
    | "imageUrlInvalid",
) => string;

export const createProfileSchema = (t: Translate) => {
  const optionalText = z
    .string()
    .trim()
    .max(100, t("optionalTextMax"))
    .transform((value) => value || null);

  return z.object({
    firstName: z
      .string()
      .trim()
      .min(2, t("firstNameMin"))
      .max(50, t("firstNameMax")),
    lastName: optionalText,
    displayName: optionalText,
    phone: z
      .string()
      .trim()
      .max(30, t("phoneMax"))
      .refine(
        (value) => !value || /^\+?[0-9\s()-]{7,30}$/.test(value),
        t("phoneInvalid"),
      )
      .transform((value) => value || null),
    avatarUrl: z
      .string()
      .trim()
      .transform((value) => value || null)
      .pipe(z.string().url(t("imageUrlInvalid")).nullable()),
  });
};

export type ProfileInput = z.infer<ReturnType<typeof createProfileSchema>>;
