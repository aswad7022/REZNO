import { z } from "zod";

type ValidationKey =
  | "businessNameMin"
  | "businessNameMax"
  | "legalNameMax"
  | "descriptionMax"
  | "emailInvalid"
  | "phoneInvalid"
  | "urlInvalid"
  | "slugInvalid";

type ValidationTranslator = (key: ValidationKey) => string;

function emptyToNull(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

export function createBusinessProfileSchema(t: ValidationTranslator) {
  const optionalUrl = z.preprocess(
    emptyToNull,
    z.string().trim().url(t("urlInvalid")).max(2048).nullable(),
  );

  return z.object({
    name: z
      .string()
      .trim()
      .min(2, t("businessNameMin"))
      .max(120, t("businessNameMax")),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, t("slugInvalid"))
      .min(5, t("slugInvalid"))
      .max(80, t("slugInvalid")),
    businessType: z.enum(["PHYSICAL", "ONLINE", "HYBRID"]),
    businessCategory: z.preprocess(
      emptyToNull,
      z.string().trim().max(120).nullable(),
    ),
    legalName: z.preprocess(
      emptyToNull,
      z.string().trim().max(160, t("legalNameMax")).nullable(),
    ),
    description: z.preprocess(
      emptyToNull,
      z.string().trim().max(2000, t("descriptionMax")).nullable(),
    ),
    businessEmail: z.preprocess(
      emptyToNull,
      z.string().trim().email(t("emailInvalid")).max(320).nullable(),
    ),
    businessPhone: z.preprocess(
      emptyToNull,
      z
        .string()
        .trim()
        .max(30)
        .regex(/^\+?[0-9\s()-]{7,30}$/, t("phoneInvalid"))
        .nullable(),
    ),
    whatsappPhone: z.preprocess(
      emptyToNull,
      z
        .string()
        .trim()
        .max(30)
        .regex(/^\+?[0-9\s()-]{7,30}$/, t("phoneInvalid"))
        .nullable(),
    ),
    bookingPolicy: z.preprocess(
      emptyToNull,
      z.string().trim().max(4000).nullable(),
    ),
    galleryUrls: z
      .string()
      .max(12000)
      .transform((value) =>
        [...new Set(value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))],
      )
      .refine(
        (items) => items.every((item) => z.url().safeParse(item).success),
        t("urlInvalid"),
      ),
    faqItems: z
      .string()
      .max(12000)
      .transform((value) =>
        value
          .split(/\r?\n/)
          .map((line) => line.split("|").map((part) => part.trim()))
          .filter((parts) => parts.length >= 2 && parts[0] && parts[1])
          .map(([question, ...answer]) => ({
            question,
            answer: answer.join(" | "),
          })),
      ),
    seoTitle: z.preprocess(
      emptyToNull,
      z.string().trim().max(70).nullable(),
    ),
    seoDescription: z.preprocess(
      emptyToNull,
      z.string().trim().max(180).nullable(),
    ),
    visibility: z.enum(["PUBLISHED", "HIDDEN"]),
    website: optionalUrl,
    googleMapsUrl: optionalUrl,
    logoUrl: optionalUrl,
    coverImageUrl: optionalUrl,
    ogImageUrl: optionalUrl,
    facebookUrl: optionalUrl,
    instagramUrl: optionalUrl,
    tiktokUrl: optionalUrl,
    youtubeUrl: optionalUrl,
  });
}

export type BusinessProfileInput = z.infer<
  ReturnType<typeof createBusinessProfileSchema>
>;
