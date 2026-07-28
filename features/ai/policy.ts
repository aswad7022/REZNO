import "server-only";

import {
  AI_ALLOWED_GATE_A_USE_CASES,
  AI_FORBIDDEN_ACTIONS,
  AI_GATE_A_DEFAULT_BUDGET,
  AI_GATE_A_POLICY_VERSION,
  AI_GATE_A_PROMPT_VERSION,
  AI_GATE_A_EVAL_VERSION,
  type AiAllowedUseCase,
  type AiAuditMetadata,
  type AiAuthorizationContext,
  type AiBudget,
  type AiForbiddenAction,
  type AiGatewayRefusal,
  type AiGatewayResponse,
  type AiGroundingCitation,
  type AiIntent,
  type AiLocale,
  type AiRefusalCode,
} from "./contracts";

const REFUSAL_MESSAGES: Record<AiRefusalCode, Record<AiLocale, string>> = {
  FEATURE_DISABLED: {
    ar: "REZNO AI غير متاحة بعد.",
    ckb: "REZNO AI هێشتا بەردەست نییە.",
    en: "REZNO AI is not available yet.",
  },
  KILL_SWITCH_ACTIVE: {
    ar: "تم تعطيل REZNO AI مؤقتًا.",
    ckb: "REZNO AI بە شێوەی کاتی ناچالاک کراوە.",
    en: "REZNO AI is temporarily disabled.",
  },
  EXTERNAL_PROVIDER_DISABLED: {
    ar: "لا يوجد مزود ذكاء اصطناعي مفعّل لهذه البوابة.",
    ckb: "هیچ دابینکەری زیرەکی دەستکرد بۆ ئەم دەروازەیە چالاک نییە.",
    en: "No AI provider is enabled for this gate.",
  },
  FORBIDDEN_ACTION: {
    ar: "لا يمكن للذكاء الاصطناعي تنفيذ هذا الإجراء.",
    ckb: "زیرەکی دەستکرد ناتوانێت ئەم کردارە ئەنجام بدات.",
    en: "AI cannot perform that action.",
  },
  UNAUTHORIZED_SCOPE: {
    ar: "لا يمكن عرض بيانات خارج صلاحياتك.",
    ckb: "ناتوانرێت داتای دەرەوەی دەسەڵاتەکانت پیشان بدرێت.",
    en: "Data outside your permissions cannot be shown.",
  },
  UNSUPPORTED_DECISION_DOMAIN: {
    ar: "هذا النوع من القرارات خارج نطاق REZNO AI.",
    ckb: "ئەم جۆرە بڕیارە لە دەرەوەی سنووری REZNO AI ـە.",
    en: "That decision area is outside REZNO AI scope.",
  },
  UNSAFE_INPUT: {
    ar: "لا يمكن معالجة هذا الطلب بأمان.",
    ckb: "ئەم داواکارییە بە سەلامەتی چارەسەر ناکرێت.",
    en: "This request cannot be handled safely.",
  },
  UNGROUNDED_OUTPUT: {
    ar: "لا توجد مصادر REZNO كافية للإجابة بأمان.",
    ckb: "سەرچاوەی پێویستی REZNO نییە بۆ وەڵامێکی سەلامەت.",
    en: "There are not enough REZNO sources to answer safely.",
  },
  PROVIDER_TIMEOUT: {
    ar: "انتهت مهلة خدمة الذكاء الاصطناعي.",
    ckb: "کاتی خزمەتی زیرەکی دەستکرد تەواو بوو.",
    en: "The AI service timed out.",
  },
  PROVIDER_UNAVAILABLE: {
    ar: "خدمة الذكاء الاصطناعي غير متاحة الآن.",
    ckb: "خزمەتی زیرەکی دەستکرد ئێستا بەردەست نییە.",
    en: "The AI service is unavailable right now.",
  },
  MALFORMED_PROVIDER_OUTPUT: {
    ar: "تعذر اعتماد نتيجة الذكاء الاصطناعي.",
    ckb: "ئەنجامی زیرەکی دەستکرد پشتڕاست نەکرایەوە.",
    en: "The AI result could not be trusted.",
  },
};

const FORBIDDEN_PATTERNS: readonly [AiForbiddenAction, RegExp][] = [
  ["CREATE_BOOKING", /(book|reserve|احجز|حجز|بکە|حجز بکە)/i],
  ["CANCEL_BOOKING", /(cancel.*booking|إلغاء.*حجز|هەڵوەشاندنەوە.*حجز)/i],
  ["EXECUTE_PAYMENT", /(pay|capture|refund|ادفع|استرداد|پارە بدە|گەڕاندنەوە)/i],
  ["SEND_MESSAGE", /(send.*message|أرسل.*رسالة|پەیام بنێرە)/i],
  ["ADMIN_PLATFORM_OPERATION", /(admin|platform|runtime|منصة|أدمن|بەڕێوەبردن)/i],
  ["READ_SECRETS", /(secret|token|api key|مفتاح|سر|نهێنی)/i],
];

const INJECTION_PATTERNS = [
  /ignore (all )?(previous|system) instructions/i,
  /تجاهل .*التعليمات/i,
  /فەرامۆش.*ڕێنمایی/i,
  /reveal (the )?(prompt|system|secret)/i,
  /<script\b/i,
] as const;

const PII_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?:\+?\d[\s-]?){8,}/,
] as const;

export function normalizeAiInput(input: string, budget: AiBudget = AI_GATE_A_DEFAULT_BUDGET) {
  return input
    .normalize("NFKC")
    .replace(/\p{C}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, budget.maxInputChars);
}

export function classifyAiIntent(input: string): AiIntent {
  const normalized = normalizeAiInput(input);
  if (INJECTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "UNSAFE_REQUEST";
  }
  if (findForbiddenAction(normalized)) return "UNSUPPORTED_ACTION";
  if (/(compare|قارن|بەراورد)/i.test(normalized)) return "COMPARE_OPTIONS";
  if (/(summary|summarize|لخص|پوختە)/i.test(normalized)) {
    return "SUMMARIZE_PUBLIC_DATA";
  }
  if (/(find|search|near|مطعم|حلاق|عيادة|دۆزینەوە|گەڕان)/i.test(normalized)) {
    return "DISCOVERY";
  }
  return "UNKNOWN";
}

export function findForbiddenAction(input: string): AiForbiddenAction | undefined {
  return FORBIDDEN_PATTERNS.find(([, pattern]) => pattern.test(input))?.[0];
}

export function inputContainsUnsafeContent(input: string) {
  return (
    INJECTION_PATTERNS.some((pattern) => pattern.test(input)) ||
    PII_PATTERNS.some((pattern) => pattern.test(input))
  );
}

export function buildAiAuthorizationContext(input: {
  actorId: string;
  role: AiAuthorizationContext["role"];
  locale: AiLocale;
  organizationId?: string;
  readableResourceScopes?: readonly string[];
}): AiAuthorizationContext {
  return {
    actorId: input.actorId,
    role: input.role,
    locale: input.locale,
    organizationId: input.organizationId,
    allowedUseCases: AI_ALLOWED_GATE_A_USE_CASES,
    forbiddenActions: AI_FORBIDDEN_ACTIONS,
    readableResourceScopes: input.readableResourceScopes ?? ["PUBLIC_BUSINESS", "PUBLIC_CATEGORY"],
  };
}

export function createAiRefusal(input: {
  code: AiRefusalCode;
  intent: AiIntent;
  citations?: readonly AiGroundingCitation[];
}): AiGatewayRefusal {
  return {
    ok: false,
    mode: "LOCAL_DETERMINISTIC",
    intent: input.intent,
    refusalCode: input.code,
    safeMessage: REFUSAL_MESSAGES[input.code],
    citations: input.citations ?? [],
    usedTools: [],
    degraded: true,
    policyVersion: AI_GATE_A_POLICY_VERSION,
    promptVersion: AI_GATE_A_PROMPT_VERSION,
  };
}

export function preflightAiRequest(input: {
  normalizedInput: string;
  requestedUseCase: AiAllowedUseCase;
  authorization: AiAuthorizationContext;
  flags: { enabled: boolean; killSwitch: boolean; externalProviderEnabled: false };
}): AiGatewayRefusal | undefined {
  const intent = classifyAiIntent(input.normalizedInput);
  if (!input.flags.enabled) return createAiRefusal({ code: "FEATURE_DISABLED", intent });
  if (input.flags.killSwitch) return createAiRefusal({ code: "KILL_SWITCH_ACTIVE", intent });
  if (!input.authorization.allowedUseCases.includes(input.requestedUseCase)) {
    return createAiRefusal({ code: "UNAUTHORIZED_SCOPE", intent });
  }
  if (inputContainsUnsafeContent(input.normalizedInput)) {
    return createAiRefusal({ code: "UNSAFE_INPUT", intent });
  }
  if (findForbiddenAction(input.normalizedInput)) {
    return createAiRefusal({ code: "FORBIDDEN_ACTION", intent });
  }
  return undefined;
}

export function validateAiGrounding(response: AiGatewayResponse): AiGatewayResponse {
  if (!response.ok) return response;
  if (response.citations.length === 0) {
    return createAiRefusal({
      code: "UNGROUNDED_OUTPUT",
      intent: response.intent,
    });
  }
  if (response.answer.length > AI_GATE_A_DEFAULT_BUDGET.maxOutputChars) {
    return createAiRefusal({
      code: "MALFORMED_PROVIDER_OUTPUT",
      intent: response.intent,
      citations: response.citations,
    });
  }
  return response;
}

export function toAuditMetadata(input: {
  requestId: string;
  authorization: AiAuthorizationContext;
  requestedUseCase: AiAllowedUseCase;
  normalizedInput: string;
  response: AiGatewayResponse;
}): AiAuditMetadata {
  const outputChars = input.response.ok
    ? input.response.answer.length
    : input.response.safeMessage[input.authorization.locale].length;
  return {
    requestId: input.requestId,
    actorRole: input.authorization.role,
    locale: input.authorization.locale,
    requestedUseCase: input.requestedUseCase,
    mode: input.response.mode,
    policyVersion: AI_GATE_A_POLICY_VERSION,
    promptVersion: AI_GATE_A_PROMPT_VERSION,
    evalVersion: AI_GATE_A_EVAL_VERSION,
    inputChars: input.normalizedInput.length,
    outputChars,
    estimatedTokens: Math.ceil((input.normalizedInput.length + outputChars) / 4),
    estimatedCostUsd: "0.00",
    refusalCode: input.response.ok ? undefined : input.response.refusalCode,
  };
}
