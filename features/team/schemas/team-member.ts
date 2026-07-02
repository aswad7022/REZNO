import { z } from "zod";

type TeamValidationKey =
  | "emailInvalid"
  | "roleInvalid"
  | "branchSelectionInvalid"
  | "urlInvalid";

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
  });
}

export function createTeamMemberUpdateSchema(t: TeamValidationTranslator) {
  return createTeamMemberSchema(t).omit({ email: true });
}
