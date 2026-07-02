import "server-only";

import type { BusinessVertical } from "@prisma/client";

import type {
  NormalizedSearchQuery,
  SearchableBusinessSnapshot,
} from "@/features/search/types";

export const MAX_SEARCH_QUERY_LENGTH = 100;

const arabicDiacriticsPattern =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;

const verticalAliases: Record<BusinessVertical, readonly string[]> = {
  RESTAURANT: [
    "مطعم",
    "مطاعم",
    "اكل",
    "أكل",
    "food",
    "restaurant",
    "restaurants",
    "بيتزا",
    "بركر",
    "burger",
    "pizza",
  ],
  CAFE: ["كافيه", "كوفي", "قهوة", "cafe", "coffee", "كافي"],
  BARBER: ["حلاق", "حلاقة", "barber", "haircut"],
  BEAUTY: ["صالون", "تجميل", "beauty", "salon"],
  CLINIC: ["عيادة", "طبيب", "clinic", "doctor"],
  DENTIST: ["اسنان", "أسنان", "dentist", "dental"],
  SPA: ["سبا", "مساج", "spa", "massage"],
  GYM: ["جيم", "نادي", "gym", "fitness"],
  CONSULTANT: ["استشارة", "مستشار", "consultant", "consulting"],
  OTHER: ["other"],
};

const locationPrefixes = [
  "قرب",
  "بالقرب من",
  "near",
  "nearby",
  "نزیک",
  "نزیک لە",
] as const;

const stopWords = new Set([
  "قرب",
  "بالقرب",
  "من",
  "في",
  "near",
  "nearby",
  "of",
  "نزیک",
  "له",
  "لە",
]);

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(arabicDiacriticsPattern, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

export function normalizeSearchQuery(
  input: string | null | undefined,
): NormalizedSearchQuery | null {
  const raw = (input ?? "").trim().slice(0, MAX_SEARCH_QUERY_LENGTH);
  const normalized = normalizeSearchText(raw);
  if (!normalized) return null;

  const terms = Array.from(
    new Set([
      normalized,
      ...normalized
        .split(" ")
        .filter((term) => term.length >= 2 && !stopWords.has(term)),
      ...stripLocationPrefixes(normalized),
    ]),
  ).slice(0, 12);

  return {
    raw,
    normalized,
    terms,
    inferredVerticals: inferVerticals(normalized),
  };
}

export function getSearchTermVariants(query: NormalizedSearchQuery): string[] {
  return Array.from(
    new Set([
      query.raw,
      query.normalized,
      ...query.terms,
      ...query.inferredVerticals.flatMap(
        (vertical) => verticalAliases[vertical] ?? [],
      ),
    ]),
  )
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .slice(0, 24);
}

export function scoreSearchResult(
  query: NormalizedSearchQuery | null,
  snapshot: SearchableBusinessSnapshot,
): number {
  if (!query) return 0;

  const businessName = normalizeSearchText(snapshot.name);
  const slug = normalizeSearchText(snapshot.slug);
  const description = normalizeSearchText(snapshot.description ?? "");
  const categoryName = normalizeSearchText(snapshot.categoryName ?? "");
  const serviceNames = snapshot.services.map((service) =>
    normalizeSearchText(service.name),
  );
  const serviceDescriptions = snapshot.services.map((service) =>
    normalizeSearchText(service.description ?? ""),
  );
  const serviceCategories = snapshot.services.map((service) =>
    normalizeSearchText(service.categoryName ?? ""),
  );
  const menuNames = snapshot.menuItems.map((item) =>
    normalizeSearchText(item.name),
  );
  const menuDescriptions = snapshot.menuItems.map((item) =>
    normalizeSearchText(item.description ?? ""),
  );
  const branchTexts = snapshot.branches.flatMap((branch) => [
    normalizeSearchText(branch.name),
    normalizeSearchText(branch.addressLine1 ?? ""),
    normalizeSearchText(branch.addressLine2 ?? ""),
    normalizeSearchText(branch.city ?? ""),
    normalizeSearchText(branch.locationLabel ?? ""),
    normalizeSearchText(branch.nearbyLandmark ?? ""),
    normalizeSearchText(branch.locationInstructions ?? ""),
  ]);

  let score = 0;
  if (businessName === query.normalized) score += 120;
  if (businessName.startsWith(query.normalized)) score += 90;
  if (includesAny(businessName, query.terms)) score += 70;
  if (includesAny(slug, query.terms)) score += 55;
  if (query.inferredVerticals.includes(snapshot.vertical)) score += 75;
  if (includesAny(categoryName, query.terms)) score += 45;
  if (serviceNames.some((name) => name === query.normalized)) score += 80;
  if (serviceNames.some((name) => name.startsWith(query.normalized))) score += 65;
  if (serviceNames.some((name) => includesAny(name, query.terms))) score += 55;
  if (serviceCategories.some((category) => includesAny(category, query.terms))) {
    score += 40;
  }
  if (menuNames.some((name) => name === query.normalized)) score += 75;
  if (menuNames.some((name) => includesAny(name, query.terms))) score += 50;
  if (branchTexts.some((text) => includesAny(text, query.terms))) score += 45;
  if (includesAny(description, query.terms)) score += 25;
  if (serviceDescriptions.some((text) => includesAny(text, query.terms))) {
    score += 22;
  }
  if (menuDescriptions.some((text) => includesAny(text, query.terms))) {
    score += 20;
  }

  return score;
}

function inferVerticals(normalized: string): BusinessVertical[] {
  return Object.entries(verticalAliases).flatMap(([vertical, aliases]) =>
    aliases.some((alias) => normalized.includes(normalizeSearchText(alias)))
      ? [vertical as BusinessVertical]
      : [],
  );
}

function stripLocationPrefixes(value: string): string[] {
  return locationPrefixes.flatMap((prefix) => {
    const normalizedPrefix = normalizeSearchText(prefix);
    if (!value.startsWith(`${normalizedPrefix} `)) return [];
    return [value.slice(normalizedPrefix.length).trim()].filter(Boolean);
  });
}

function includesAny(value: string, terms: readonly string[]): boolean {
  return terms.some((term) => value.includes(term));
}
