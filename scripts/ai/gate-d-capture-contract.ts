export type AiGateDLocale = "ar" | "ckb" | "en";
export type AiGateDTheme = "dark" | "light";
export type AiGateDExpectedState =
  | "disabled"
  | "loading"
  | "success"
  | "refusal"
  | "no-results"
  | "timeout"
  | "rate-limited"
  | "unavailable";

export type AiGateDCaptureSpec = {
  readonly file: string;
  readonly locale: AiGateDLocale;
  readonly direction: "ltr" | "rtl";
  readonly theme: AiGateDTheme;
  readonly width: number;
  readonly height: number;
  readonly viewport: "compact" | "desktop";
  readonly expectedState: AiGateDExpectedState;
  readonly aiEnabled: boolean;
  readonly question: string;
  readonly requiredText: readonly string[];
  readonly forbiddenText: readonly string[];
};

export const aiGateDCaptureSpecs: readonly AiGateDCaptureSpec[] = [
  {
    aiEnabled: false,
    direction: "ltr",
    expectedState: "disabled",
    file: "desktop-en-light-disabled.png",
    forbiddenText: ["Ask assistant", "Checking public REZNO results"],
    height: 900,
    locale: "en",
    question: "",
    requiredText: ["REZNO AI", "AI is not enabled yet"],
    theme: "light",
    viewport: "desktop",
    width: 1365,
  },
  {
    aiEnabled: true,
    direction: "ltr",
    expectedState: "success",
    file: "desktop-en-light-success-citations.png",
    forbiddenText: ["The assistant is unavailable", "I can’t handle that safely"],
    height: 900,
    locale: "en",
    question: "Find a family restaurant in Erbil",
    requiredText: ["Grounded REZNO result ready", "Sources", "Gate D Family Restaurant"],
    theme: "light",
    viewport: "desktop",
    width: 1365,
  },
  {
    aiEnabled: true,
    direction: "rtl",
    expectedState: "refusal",
    file: "compact-ar-dark-refusal.png",
    forbiddenText: ["Gate D Family Restaurant", "Checking public REZNO results"],
    height: 844,
    locale: "ar",
    question: "ابحث عن مطعم لهذا البريد dana [at] example [dot] com",
    requiredText: ["رفض المساعد", "لا يمكن معالجة هذا الطلب بأمان"],
    theme: "dark",
    viewport: "compact",
    width: 390,
  },
  {
    aiEnabled: true,
    direction: "rtl",
    expectedState: "no-results",
    file: "compact-ckb-light-no-results.png",
    forbiddenText: ["Gate D Family Restaurant", "یاریدەدەر ئێستا بەردەست نییە"],
    height: 844,
    locale: "ckb",
    question: "هیچ ئەنجامێکی گشتی بۆ ئەم شارە نییە",
    requiredText: ["هیچ ئەنجامێکی گشتیی بازاڕی REZNO", "هیچ ئەنجامی گشتیی پێویست"],
    theme: "light",
    viewport: "compact",
    width: 390,
  },
  {
    aiEnabled: true,
    direction: "ltr",
    expectedState: "loading",
    file: "compact-en-dark-loading.png",
    forbiddenText: ["Grounded REZNO result ready", "The assistant is unavailable"],
    height: 844,
    locale: "en",
    question: "Find a family restaurant in Erbil",
    requiredText: ["Checking public REZNO results", "Cancel"],
    theme: "dark",
    viewport: "compact",
    width: 390,
  },
  {
    aiEnabled: true,
    direction: "rtl",
    expectedState: "timeout",
    file: "desktop-ar-light-timeout.png",
    forbiddenText: ["Gate D Family Restaurant", "المصادر"],
    height: 900,
    locale: "ar",
    question: "ابحث عن مطعم عائلي في أربيل",
    requiredText: ["استغرق المساعد وقتًا طويلًا", "إعادة المحاولة"],
    theme: "light",
    viewport: "desktop",
    width: 1365,
  },
  {
    aiEnabled: true,
    direction: "ltr",
    expectedState: "rate-limited",
    file: "desktop-en-dark-rate-limited.png",
    forbiddenText: ["Gate D Family Restaurant", "Sources"],
    height: 900,
    locale: "en",
    question: "Find a restaurant with reviews",
    requiredText: ["temporary limit", "Retry"],
    theme: "dark",
    viewport: "desktop",
    width: 1365,
  },
  {
    aiEnabled: true,
    direction: "rtl",
    expectedState: "unavailable",
    file: "compact-ckb-dark-unavailable.png",
    forbiddenText: ["Gate D Family Restaurant", "ئەنجامی پشتڕاستکراوی REZNO"],
    height: 844,
    locale: "ckb",
    question: "چێشتخانەی خێزانی بدۆزەوە",
    requiredText: ["یاریدەدەر ئێستا بەردەست نییە", "دووبارە هەوڵبدە"],
    theme: "dark",
    viewport: "compact",
    width: 390,
  },
] as const;

export function assertAiGateDCaptureContract() {
  if (aiGateDCaptureSpecs.length !== 8) {
    throw new Error("Gate D visual evidence must cover the eight required AI UX states.");
  }
  const states = new Set(aiGateDCaptureSpecs.map((spec) => spec.expectedState));
  for (const state of ["disabled", "loading", "success", "refusal", "no-results", "timeout", "rate-limited", "unavailable"] as const) {
    if (!states.has(state)) throw new Error(`Gate D visual evidence is missing ${state}.`);
  }
  const locales = new Set(aiGateDCaptureSpecs.map((spec) => spec.locale));
  for (const locale of ["ar", "ckb", "en"] as const) {
    if (!locales.has(locale)) throw new Error(`Gate D visual evidence is missing locale ${locale}.`);
  }
  const viewports = new Set(aiGateDCaptureSpecs.map((spec) => spec.viewport));
  if (!viewports.has("compact") || !viewports.has("desktop")) {
    throw new Error("Gate D visual evidence must include compact and desktop viewports.");
  }
}
