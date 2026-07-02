import { z } from "zod";

type BranchValidationKey =
  | "branchNameMin"
  | "branchNameMax"
  | "emailInvalid"
  | "phoneInvalid"
  | "timezoneInvalid"
  | "addressMax"
  | "invalidLatitude"
  | "invalidLongitude";

type BranchValidationTranslator = (key: BranchValidationKey) => string;

function emptyToNull(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

export function createBranchSchema(t: BranchValidationTranslator) {
  const optionalAddress = z.preprocess(
    emptyToNull,
    z.string().trim().max(160, t("addressMax")).nullable(),
  );
  const optionalLocationText = z.preprocess(
    emptyToNull,
    z.string().trim().max(240, t("addressMax")).nullable(),
  );
  const optionalLatitude = z.preprocess((value) => {
    if (typeof value === "string" && value.trim() === "") return null;
    return value;
  }, z.coerce.number().min(-90, t("invalidLatitude")).max(90, t("invalidLatitude")).nullable());
  const optionalLongitude = z.preprocess((value) => {
    if (typeof value === "string" && value.trim() === "") return null;
    return value;
  }, z.coerce.number().min(-180, t("invalidLongitude")).max(180, t("invalidLongitude")).nullable());

  return z.object({
    name: z
      .string()
      .trim()
      .min(2, t("branchNameMin"))
      .max(120, t("branchNameMax")),
    phone: z.preprocess(
      emptyToNull,
      z
        .string()
        .trim()
        .max(30)
        .regex(/^\+?[0-9\s()-]{7,30}$/, t("phoneInvalid"))
        .nullable(),
    ),
    email: z.preprocess(
      emptyToNull,
      z.string().trim().email(t("emailInvalid")).max(320).nullable(),
    ),
    timezone: z
      .string()
      .trim()
      .min(1, t("timezoneInvalid"))
      .max(100, t("timezoneInvalid"))
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value }).format();
          return true;
        } catch {
          return false;
        }
      }, t("timezoneInvalid")),
    addressLine1: optionalAddress,
    addressLine2: optionalAddress,
    city: optionalAddress,
    country: optionalAddress,
    latitude: optionalLatitude,
    longitude: optionalLongitude,
    locationLabel: optionalLocationText,
    nearbyLandmark: optionalLocationText,
    locationInstructions: optionalLocationText,
    status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
  }).refine(
    (data) =>
      (data.latitude === null && data.longitude === null) ||
      (data.latitude !== null && data.longitude !== null),
    {
      path: ["latitude"],
      message: t("invalidLatitude"),
    },
  );
}
