import { z } from "zod";

type TeamValidationKey =
  | "emailInvalid"
  | "roleInvalid"
  | "branchSelectionInvalid"
  | "urlInvalid"
  | "slugInvalid";

type TeamValidationTranslator = (key: TeamValidationKey) => string;

export function createTeamMemberSchema(t: TeamValidationTranslator) {
  return z.object({
    email: z.string().trim().email(t("emailInvalid")).max(320),
    systemRole: z.enum(["MANAGER", "RECEPTIONIST", "STAFF"], {
      error: t("roleInvalid"),
    }),
    branchIds: z
      .array(z.string().uuid(t("branchSelectionInvalid")))
      .max(100, t("branchSelectionInvalid"))
      .transform((ids) => [...new Set(ids)]),
    photoUrl: z
      .string()
      .trim()
      .refine(
        (value) => !value || z.url().safeParse(value).success,
        t("urlInvalid"),
      )
      .transform((value) => value || null),
    bio: z
      .string()
      .trim()
      .max(1000)
      .transform((value) => value || null),
    specialties: z
      .string()
      .max(1000)
      .transform((value) =>
        [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))],
      ),
    publicSlug: z
      .string()
      .trim()
      .toLowerCase()
      .max(80)
      .refine(
        (value) => !value || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value),
        t("slugInvalid"),
      )
      .transform((value) => value || null),
    isPublicProfessional: z.preprocess(
      (value) => value === "on" || value === "true" || value === true,
      z.boolean(),
    ),
  });
}

export function createTeamMemberUpdateSchema(t: TeamValidationTranslator) {
  return createTeamMemberSchema(t).omit({ email: true });
}
