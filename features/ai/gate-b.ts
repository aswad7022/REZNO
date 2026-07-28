import "server-only";

import type { BusinessVertical } from "@prisma/client";

import {
  AI_GATE_B_EVAL_VERSION,
  AI_GATE_B_POLICY_VERSION,
  AI_GATE_B_PROMPT_VERSION,
  type AiLocale,
} from "./contracts";
import { normalizeAiInput } from "./policy";

export const AI_GATE_B_DEFAULT_MODEL = "gemini-3.6-flash" as const;
export const AI_GATE_B_GEMINI_ORIGIN = "https://generativelanguage.googleapis.com" as const;
export const AI_GATE_B_MAX_INPUT_CHARS = 900;
export const AI_GATE_B_MAX_MARKETPLACE_RESULTS = 6;
export const AI_GATE_B_TIMEOUT_MS = 4_000;
export const AI_GATE_B_MAX_OUTPUT_TOKENS = 700;
export const AI_GATE_B_MAX_RETRIES = 1;

const MAX_SAFE_TEXT_CHARS = 180;

export type AiGateBEnv = Partial<Record<string, string | undefined>>;

export type AiGateBCapability = {
  readonly enabled: boolean;
  readonly reason:
    | "READY"
    | "FEATURE_DISABLED"
    | "KILL_SWITCH_ACTIVE"
    | "GEMINI_DISABLED"
    | "LOCAL_ONLY_DISABLED"
    | "MISSING_GEMINI_KEY"
    | "MISSING_GEMINI_MODEL";
};

export type AiGateBProviderErrorCode =
  | "INVALID_KEY"
  | "PERMISSION_DENIED"
  | "QUOTA_OR_RATE_LIMITED"
  | "TIMEOUT"
  | "MALFORMED_OUTPUT"
  | "SAFETY_BLOCK"
  | "UNAVAILABLE";

export class AiGateBProviderError extends Error {
  readonly code: AiGateBProviderErrorCode;

  constructor(code: AiGateBProviderErrorCode, message: string = code) {
    super(message);
    this.name = "AiGateBProviderError";
    this.code = code;
  }
}

export type AiGateBMarketplaceResult = {
  readonly citationId: string;
  readonly slug: string;
  readonly name: string;
  readonly publicPath: string;
  readonly city: string | null;
  readonly categoryName: string | null;
  readonly vertical: BusinessVertical;
  readonly description: string | null;
  readonly matchingServiceName: string | null;
  readonly startingPrice: string | null;
  readonly averageRating: number | null;
  readonly reviewCount: number;
  readonly serviceCount: number;
  readonly hasMenu: boolean;
  readonly hasTables: boolean;
};

export type AiGateBProviderInput = {
  readonly locale: AiLocale;
  readonly normalizedQuestion: string;
  readonly intent: AiGateBIntent;
  readonly results: readonly AiGateBMarketplaceResult[];
};

export type AiGateBProviderOutput = {
  readonly status: "ANSWER" | "NO_RESULTS" | "REFUSAL";
  readonly answer: string;
  readonly items: readonly {
    readonly citationId: string;
    readonly title: string;
    readonly reason: string;
  }[];
};

export type AiGateBProvider = {
  readonly id: "gemini" | "test-double";
  complete(input: AiGateBProviderInput, signal?: AbortSignal): Promise<AiGateBProviderOutput>;
};

export type AiGateBMarketplaceSearch = (options?: {
  query?: string;
  category?: string;
  city?: string;
  vertical?: BusinessVertical;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  take?: number;
}) => Promise<readonly {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly city: string | null;
  readonly categoryName: string | null;
  readonly matchingServiceName: string | null;
  readonly startingPrice: string | null;
  readonly averageRating: number | null;
  readonly reviewCount: number;
  readonly serviceCount: number;
  readonly vertical: BusinessVertical;
  readonly hasMenu: boolean;
  readonly hasTables: boolean;
}[]>;

export type AiGateBResponse =
  | {
      readonly ok: true;
      readonly status: "ANSWER";
      readonly answer: string;
      readonly automated: true;
      readonly modelId: string;
      readonly citations: readonly {
        readonly id: string;
        readonly title: string;
        readonly href: string;
        readonly reason: string;
      }[];
      readonly metadata: AiGateBMetadata;
    }
  | {
      readonly ok: false;
      readonly status: "REFUSAL" | "NO_RESULTS" | "UNAVAILABLE" | "RATE_LIMITED" | "TIMEOUT";
      readonly safeMessage: Record<AiLocale, string>;
      readonly automated: true;
      readonly metadata: AiGateBMetadata;
    };

export type AiGateBMetadata = {
  readonly policyVersion: typeof AI_GATE_B_POLICY_VERSION;
  readonly promptVersion: typeof AI_GATE_B_PROMPT_VERSION;
  readonly evalVersion: typeof AI_GATE_B_EVAL_VERSION;
  readonly provider: "gemini" | "none" | "test-double";
  readonly modelId: string | null;
  readonly inputChars: number;
  readonly marketplaceResultCount: number;
  readonly providerRequestCount: number;
  readonly estimatedTokens?: number;
  readonly latencyMs?: number;
};

export type AiGateBIntent = {
  readonly vertical?: BusinessVertical;
  readonly category?: string;
  readonly city?: string;
  readonly query: string;
};

const SAFE_MESSAGES: Record<Exclude<AiGateBResponse["status"], "ANSWER">, Record<AiLocale, string>> = {
  REFUSAL: {
    ar: "لا يمكن معالجة هذا الطلب بأمان. اسأل عن أنشطة أو خدمات عامة داخل REZNO دون بيانات شخصية أو حجوزات أو مدفوعات.",
    ckb: "ئەم داواکارییە بە سەلامەتی چارەسەر ناکرێت. تکایە تەنها لەسەر بازرگانی و خزمەتگوزاری گشتییەکانی REZNO بپرسە.",
    en: "I can’t handle that safely. Ask about public REZNO businesses or services without personal data, bookings, or payments.",
  },
  NO_RESULTS: {
    ar: "لم أجد نتائج عامة كافية في سوق REZNO لهذا الطلب.",
    ckb: "هیچ ئەنجامی گشتیی پێویست لە بازاڕی REZNO بۆ ئەم داواکارییە نەدۆزرایەوە.",
    en: "I couldn’t find enough public REZNO marketplace results for that request.",
  },
  UNAVAILABLE: {
    ar: "المساعد غير متاح الآن. جرّب لاحقًا.",
    ckb: "یاریدەدەر ئێستا بەردەست نییە. دواتر هەوڵبدەوە.",
    en: "The assistant is unavailable right now. Please try again later.",
  },
  RATE_LIMITED: {
    ar: "وصلت خدمة الذكاء الاصطناعي إلى حدها المؤقت. جرّب بعد قليل.",
    ckb: "خزمەتی AI سنووری کاتی گەیشت. کەمێک دواتر هەوڵبدەوە.",
    en: "The AI service reached its temporary limit. Please try again shortly.",
  },
  TIMEOUT: {
    ar: "استغرق المساعد وقتًا طويلًا. جرّب مرة أخرى.",
    ckb: "یاریدەدەر زۆر خایاند. دووبارە هەوڵبدەوە.",
    en: "The assistant took too long. Please try again.",
  },
};

const FORBIDDEN_PRIVATE_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?:\+?\d[\s().-]?){8,}/,
  /\b[A-Z0-9._%+-]+\s*(?:@|\bat\b)\s*[A-Z0-9.-]+\s*(?:\.|\bdot\b)\s*[A-Z]{2,}\b/i,
  /[^\s@]{2,}\s*@\s*[A-Z0-9.-]+\s*(?:\.|\bdot\b)\s*[A-Z]{2,}/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:[A-Za-z0-9_-]{24,}\.){1,2}[A-Za-z0-9_-]{16,}\b/,
  /\b(?:session|cookie|token|secret|api key|apikey|bearer|authorization)\s*[:=]\s*[\w.+/=-]{8,}\b/i,
  /\b(?:booking|reservation|order|payment|refund|invoice)[\s_-]*(?:id|number|ref)?[\s:#=-]*[A-Z0-9-]{6,}\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /\b(?:book|reserve|booking|reservation|order|payment|refund|invoice|admin|staff|session|cookie|token|api key|secret)\b/i,
  /(حجز|حجزي|طلب|دفع|استرداد|فاتورة|أدمن|جلسة|رمز|مفتاح|سر|هاتف|جوال|موبايل|بريد|إيميل|ايميل)/i,
  /(پارەدان|گەڕاندنەوە|داواکاری|حجز|کارمەند|دانیشتن|نهێنی|مۆبایل|ئیمەیڵ)/i,
] as const;

const INJECTION_PATTERNS = [
  /ignore (all )?(previous|system) instructions/i,
  /reveal (the )?(prompt|system|secret|api key)/i,
  /act as (admin|developer|system)/i,
  /tools?\s*:/i,
  /<script\b/i,
  /تجاهل .*التعليمات/i,
  /اكشف .*النظام|اكشف .*السر/i,
  /فەرامۆش.*ڕێنمایی/i,
] as const;

export function getAiGateBCapability(env: AiGateBEnv = process.env): AiGateBCapability {
  if (env.REZNO_AI_KILL_SWITCH === "true") return { enabled: false, reason: "KILL_SWITCH_ACTIVE" };
  if (env.REZNO_AI_ENABLED !== "true") return { enabled: false, reason: "FEATURE_DISABLED" };
  if (env.REZNO_AI_GEMINI_ENABLED !== "true") return { enabled: false, reason: "GEMINI_DISABLED" };
  if (env.REZNO_AI_GATE_B_LOCAL_ONLY !== "true") return { enabled: false, reason: "LOCAL_ONLY_DISABLED" };
  if (!env.GEMINI_API_KEY) return { enabled: false, reason: "MISSING_GEMINI_KEY" };
  if (!env.GEMINI_MODEL) return { enabled: false, reason: "MISSING_GEMINI_MODEL" };
  return { enabled: true, reason: "READY" };
}

export function getAiGateBModel(env: AiGateBEnv = process.env) {
  if (!env.GEMINI_MODEL) throw new AiGateBProviderError("INVALID_KEY", "MISSING_GEMINI_MODEL");
  return env.GEMINI_MODEL;
}

export function isUnsafeForFreeTier(input: string) {
  const normalized = normalizePrivateDetectionInput(normalizeAiInput(input, { maxInputChars: AI_GATE_B_MAX_INPUT_CHARS, maxOutputChars: 0, timeoutMs: 0, maxRetries: 0, maxEstimatedTokens: 0, maxEstimatedCostUsd: "0.00" }));
  const compact = normalized.replace(/[\s._()[\]{}<>-]+/g, "");
  return looksLikePhoneNumber(normalized)
    || looksLikePhoneNumber(compact)
    || FORBIDDEN_PRIVATE_PATTERNS.some((pattern) => pattern.test(normalized))
    || FORBIDDEN_PRIVATE_PATTERNS.some((pattern) => pattern.test(compact))
    || INJECTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function extractAiGateBIntent(input: string): AiGateBIntent {
  const query = normalizeAiInput(input, {
    maxInputChars: AI_GATE_B_MAX_INPUT_CHARS,
    maxOutputChars: 0,
    timeoutMs: 0,
    maxRetries: 0,
    maxEstimatedTokens: 0,
    maxEstimatedCostUsd: "0.00",
  });
  const lower = query.toLocaleLowerCase();
  const vertical = inferVertical(lower);
  const city = inferCity(query);
  return { vertical, city, query };
}

export async function runAiGateBCustomerDiscovery(input: {
  readonly locale: AiLocale;
  readonly question: string;
  readonly provider: AiGateBProvider;
  readonly marketplaceSearch?: AiGateBMarketplaceSearch;
  readonly env?: AiGateBEnv;
  readonly signal?: AbortSignal;
}): Promise<AiGateBResponse> {
  const env = input.env ?? process.env;
  const startedAt = Date.now();
  const normalizedQuestion = normalizeAiInput(input.question, {
    maxInputChars: AI_GATE_B_MAX_INPUT_CHARS,
    maxOutputChars: 0,
    timeoutMs: 0,
    maxRetries: 0,
    maxEstimatedTokens: 0,
    maxEstimatedCostUsd: "0.00",
  });
  const baseMetadata = (extra: Partial<AiGateBMetadata> = {}): AiGateBMetadata => ({
    policyVersion: AI_GATE_B_POLICY_VERSION,
    promptVersion: AI_GATE_B_PROMPT_VERSION,
    evalVersion: AI_GATE_B_EVAL_VERSION,
    provider: "none",
    modelId: null,
    inputChars: normalizedQuestion.length,
    marketplaceResultCount: 0,
    providerRequestCount: 0,
    latencyMs: Date.now() - startedAt,
    ...extra,
  });
  const capability = getAiGateBCapability(env);
  if (!capability.enabled) {
    return { ok: false, status: "UNAVAILABLE", safeMessage: SAFE_MESSAGES.UNAVAILABLE, automated: true, metadata: baseMetadata() };
  }
  if (normalizedQuestion.length < 3 || isUnsafeForFreeTier(normalizedQuestion)) {
    return { ok: false, status: "REFUSAL", safeMessage: SAFE_MESSAGES.REFUSAL, automated: true, metadata: baseMetadata() };
  }

  const intent = extractAiGateBIntent(normalizedQuestion);
  const marketplaceSearch = input.marketplaceSearch ?? (await import("@/features/marketplace/services/marketplace")).searchMarketplace;
  const publicResults = toAiGateBMarketplaceResults(await marketplaceSearch({
    query: intent.vertical ? undefined : intent.query,
    city: intent.city,
    vertical: intent.vertical,
    take: AI_GATE_B_MAX_MARKETPLACE_RESULTS,
  }));
  if (publicResults.length === 0) {
    return {
      ok: false,
      status: "NO_RESULTS",
      safeMessage: SAFE_MESSAGES.NO_RESULTS,
      automated: true,
      metadata: baseMetadata({ marketplaceResultCount: 0 }),
    };
  }

  try {
    const providerOutput = await input.provider.complete({
      locale: input.locale,
      normalizedQuestion,
      intent,
      results: publicResults,
    }, input.signal);
    return validateAiGateBProviderOutput(providerOutput, {
      locale: input.locale,
      modelId: getAiGateBModel(env),
      results: publicResults,
      metadata: baseMetadata({
        provider: input.provider.id,
        modelId: getAiGateBModel(env),
        marketplaceResultCount: publicResults.length,
        providerRequestCount: 1,
      }),
    });
  } catch (error) {
    const code = error instanceof AiGateBProviderError ? error.code : "UNAVAILABLE";
    const status = code === "QUOTA_OR_RATE_LIMITED"
      ? "RATE_LIMITED"
      : code === "TIMEOUT"
        ? "TIMEOUT"
        : "UNAVAILABLE";
    return {
      ok: false,
      status,
      safeMessage: SAFE_MESSAGES[status],
      automated: true,
      metadata: baseMetadata({
        provider: input.provider.id,
        modelId: getAiGateBModel(env),
        marketplaceResultCount: publicResults.length,
        providerRequestCount: 1,
      }),
    };
  }
}

export function toAiGateBMarketplaceResults(
  businesses: readonly {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
    readonly description: string | null;
    readonly city: string | null;
    readonly categoryName: string | null;
    readonly matchingServiceName: string | null;
    readonly startingPrice: string | null;
    readonly averageRating: number | null;
    readonly reviewCount: number;
    readonly serviceCount: number;
    readonly vertical: BusinessVertical;
    readonly hasMenu: boolean;
    readonly hasTables: boolean;
  }[],
): AiGateBMarketplaceResult[] {
  return businesses.slice(0, AI_GATE_B_MAX_MARKETPLACE_RESULTS).map((business, index) => ({
    citationId: `marketplace_${index + 1}`,
    slug: business.slug,
    name: scrubPublicText(business.name, 96) ?? "REZNO marketplace result",
    publicPath: `/${business.slug}`,
    city: scrubPublicText(business.city, 80),
    categoryName: scrubPublicText(business.categoryName, 80),
    vertical: business.vertical,
    description: scrubPublicText(business.description, MAX_SAFE_TEXT_CHARS),
    matchingServiceName: scrubPublicText(business.matchingServiceName, 96),
    startingPrice: business.startingPrice,
    averageRating: business.averageRating,
    reviewCount: business.reviewCount,
    serviceCount: business.serviceCount,
    hasMenu: business.hasMenu,
    hasTables: business.hasTables,
  }));
}

export function validateAiGateBProviderOutput(
  output: AiGateBProviderOutput,
  context: {
    readonly locale: AiLocale;
    readonly modelId: string;
    readonly results: readonly AiGateBMarketplaceResult[];
    readonly metadata: AiGateBMetadata;
  },
): AiGateBResponse {
  if (!isValidProviderOutputShape(output)) {
    throw new AiGateBProviderError("MALFORMED_OUTPUT");
  }
  if (output.status === "REFUSAL") {
    return { ok: false, status: "REFUSAL", safeMessage: SAFE_MESSAGES.REFUSAL, automated: true, metadata: context.metadata };
  }
  if (output.status === "NO_RESULTS") {
    return { ok: false, status: "NO_RESULTS", safeMessage: SAFE_MESSAGES.NO_RESULTS, automated: true, metadata: context.metadata };
  }
  const byId = new Map(context.results.map((result) => [result.citationId, result]));
  const seenCitationIds = new Set<string>();
  const citations = output.items.map((item) => {
    if (seenCitationIds.has(item.citationId)) throw new AiGateBProviderError("MALFORMED_OUTPUT");
    seenCitationIds.add(item.citationId);
    const source = byId.get(item.citationId);
    if (!source) throw new AiGateBProviderError("MALFORMED_OUTPUT");
    assertProviderFreeTextIsGrounded(output.answer, source);
    assertProviderFreeTextIsGrounded(item.reason, source);
    return {
      id: item.citationId,
      title: source.name,
      href: source.publicPath,
      reason: buildGroundedCitationReason(source),
    };
  });
  if (citations.length === 0 || output.answer.length > 1_200) {
    throw new AiGateBProviderError("MALFORMED_OUTPUT");
  }
  return {
    ok: true,
    status: "ANSWER",
    answer: buildGroundedAnswer(citations.length, context.locale),
    automated: true,
    modelId: context.modelId,
    citations,
    metadata: context.metadata,
  };
}

export function mapGeminiErrorToGateB(error: unknown): AiGateBProviderError {
  if (error instanceof AiGateBProviderError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : Number.NaN;
  if (/abort|timeout|deadline/i.test(message)) return new AiGateBProviderError("TIMEOUT");
  if (status === 400 && /api.?key|key/i.test(message)) return new AiGateBProviderError("INVALID_KEY");
  if (status === 401 || status === 403) return new AiGateBProviderError("PERMISSION_DENIED");
  if (status === 429) return new AiGateBProviderError("QUOTA_OR_RATE_LIMITED");
  if (status >= 500) return new AiGateBProviderError("UNAVAILABLE");
  if (/safety|blocked/i.test(message)) return new AiGateBProviderError("SAFETY_BLOCK");
  return new AiGateBProviderError("UNAVAILABLE");
}

function isValidProviderOutputShape(output: AiGateBProviderOutput) {
  return output
    && Object.keys(output).sort().join(",") === "answer,items,status"
    && ["ANSWER", "NO_RESULTS", "REFUSAL"].includes(output.status)
    && typeof output.answer === "string"
    && Array.isArray(output.items)
    && output.items.length <= 4
    && output.items.every((item) =>
      item
      && Object.keys(item).sort().join(",") === "citationId,reason,title"
      && typeof item.citationId === "string"
      && typeof item.title === "string"
      && typeof item.reason === "string",
    );
}

function scrubPublicText(value: string | null | undefined, maxChars: number) {
  if (!value) return null;
  const normalized = normalizePrivateDetectionInput(value).replace(/\s+/g, " ").trim();
  if (!normalized || isUnsafeForFreeTier(normalized)) return null;
  return normalized.slice(0, maxChars);
}

function normalizePrivateDetectionInput(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) <= 0x0669 ? digit.charCodeAt(0) - 0x0660 : digit.charCodeAt(0) - 0x06F0))
    .replace(/\p{C}/gu, " ")
    .replace(/[‐‑‒–—―−]/gu, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikePhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 16) return false;
  return /(?:\+?\d[\s().-]?){8,}/.test(value) || /^\+?\d{8,16}$/.test(value);
}

function assertProviderFreeTextIsGrounded(value: string, source: AiGateBMarketplaceResult) {
  const text = scrubPublicText(value, 1_200);
  if (text === null) throw new AiGateBProviderError("MALFORMED_OUTPUT");
  if (/https?:\/\/|www\./i.test(text)) throw new AiGateBProviderError("MALFORMED_OUTPUT");
  const moneyClaims = text.match(/(?:[$€£]\s*\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d+)?\s*(?:usd|iqd|دولار|دينار)\b)/gi) ?? [];
  for (const claim of moneyClaims) {
    const normalizedClaim = claim.replace(/[^\d.]/g, "");
    if (source.startingPrice === null || Math.abs(Number(normalizedClaim) - Number(source.startingPrice)) > 0.001) {
      throw new AiGateBProviderError("MALFORMED_OUTPUT");
    }
  }
  const ratingClaims = text.match(/\b[0-5](?:\.\d)?\s*(?:\/\s*5|stars?|نجوم|ئەستێرە)?\b/gi) ?? [];
  for (const claim of ratingClaims) {
    if (!/\/\s*5|stars?|نجوم|ئەستێرە/i.test(claim)) continue;
    const rating = Number(claim.match(/[0-5](?:\.\d)?/)?.[0]);
    if (source.averageRating === null || Math.abs(rating - source.averageRating) > 0.001) {
      throw new AiGateBProviderError("MALFORMED_OUTPUT");
    }
  }
}

function buildGroundedAnswer(count: number, locale: AiLocale) {
  if (locale === "ar") return `وجدت ${count} نتيجة عامة موثوقة من سوق REZNO. افتح المصادر أدناه للتفاصيل المؤكدة.`;
  if (locale === "ckb") return `${count} ئەنجامی گشتیی پشتڕاستکراوە لە بازاڕی REZNO دۆزرایەوە. بۆ وردەکارییە پشتڕاستکراوەکان سەرچاوەکان بکەرەوە.`;
  return `I found ${count} grounded public REZNO marketplace result${count === 1 ? "" : "s"}. Open the sources below for verified details.`;
}

function buildGroundedCitationReason(source: AiGateBMarketplaceResult) {
  const parts = [
    source.categoryName,
    source.city ? `in ${source.city}` : null,
    source.matchingServiceName ? `service: ${source.matchingServiceName}` : null,
    source.startingPrice ? `starting price ${source.startingPrice}` : null,
    source.averageRating !== null ? `rating ${source.averageRating.toFixed(1)}/5` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Public REZNO marketplace source.";
}

function inferVertical(text: string): BusinessVertical | undefined {
  if (/(restaurant|مطعم|چێشتخانە|خواردن)/i.test(text)) return "RESTAURANT";
  if (/(cafe|coffee|كاف|قهوة|کافێ)/i.test(text)) return "CAFE";
  if (/(barber|حلاق|حلاقة|قژ)/i.test(text)) return "BARBER";
  if (/(beauty|salon|تجميل|صالون)/i.test(text)) return "BEAUTY";
  if (/(clinic|عيادة|کلینیک)/i.test(text)) return "CLINIC";
  if (/(dentist|أسنان|ددان)/i.test(text)) return "DENTIST";
  if (/(gym|رياض|وەرزش)/i.test(text)) return "GYM";
  return undefined;
}

function inferCity(text: string) {
  const match = /\b(?:in|near|في|لە)\s+([\p{L}\s]{2,40})/iu.exec(text);
  return match?.[1]?.trim().slice(0, 40);
}
