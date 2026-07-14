import type { MobileAuthMode } from "../auth/form";

export type HomeHeaderActionMode = "icon-only" | "labeled";

export const HOME_HEADER_ACTION_MODE: HomeHeaderActionMode = "icon-only";

export const ACCOUNT_GUEST_AUTH_ACTIONS: readonly MobileAuthMode[] = [
  "signin",
  "signup",
];

export const ACCOUNT_ACTION_LAYOUT = {
  buttonMinHeight: 52,
  buttonWidth: "100%" as const,
  direction: "column" as const,
  gap: 12,
};

export const HOME_HERO_TITLE_MAX_LINES = 2;

export const MESSAGE_PREVIEW_ROW_LAYOUT = {
  metaColumnWidth: 48,
  usesAbsolutePositioning: false,
} as const;

export const KEYBOARD_SAFE_FORM_LAYOUT = {
  androidBehavior: "height" as const,
  ctaInNormalFlow: true,
  usesScrollableContent: true,
} as const;

export const ACCOUNT_NOTIFICATION_ROW_LAYOUT = {
  compactMinHeight: 68,
  defaultMinHeight: 72,
  usesAbsolutePositioning: false,
} as const;

export const HELP_CENTER_ROW_LAYOUT = {
  inlineExpansion: true,
  minimumTouchHeight: 44,
  usesFixedHeight: false,
} as const;

export const PRODUCT_NO_MEDIA_LAYOUT = {
  compactHeight: 136,
  defaultHeight: 176,
  isStructuredCard: true,
} as const;

export const SHARED_TOP_HEADER_LAYOUT = {
  centeredTitle: true,
  titleMaxLines: 2,
  usesAbsolutePositioning: false,
} as const;

const VISUAL_QA_SCREENS = [
  "account",
  "accountHelp",
  "accountNotifications",
  "checkout",
  "customerHome",
  "marketplace",
  "messages",
  "orders",
  "product",
  "serviceDiscovery",
  "signIn",
  "signUp",
] as const;

export type VisualQaScreen = (typeof VISUAL_QA_SCREENS)[number];

export function resolveVisualQaInitialScreen(
  candidate: string | undefined,
  enabled: boolean,
): VisualQaScreen | null {
  if (!enabled) return null;
  return VISUAL_QA_SCREENS.includes(candidate as VisualQaScreen)
    ? (candidate as VisualQaScreen)
    : null;
}

export function resolveVisualQaLocale(candidate: string | undefined) {
  return candidate === "ar" || candidate === "ckb" || candidate === "en"
    ? candidate
    : null;
}

export function getTextWritingDirection(value: string) {
  return /[A-Za-z]/.test(value) ? "ltr" : "rtl";
}

export function homeHeaderActionLabelsAreVisible(
  mode: HomeHeaderActionMode,
) {
  return mode === "labeled";
}
