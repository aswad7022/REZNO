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

export const FULL_SCREEN_BACKGROUND_LAYOUT = {
  bottomNavigationOutsideScroll: true,
  decorativeLayerPointerEvents: "none" as const,
  overscrollMatchesRoot: true,
  rootFillsViewport: true,
  scrollBackground: "transparent" as const,
} as const;

export const ACCOUNT_VISUAL_LAYOUT = {
  avatarSize: 52,
  bodyMaximum: 17,
  sectionTitleMaximum: 22,
  titleMaximum: 26,
} as const;

export const HOME_HERO_TITLE_MAX_LINES = 2;

export const MESSAGE_PREVIEW_ROW_LAYOUT = {
  avatarSize: 44,
  businessNameMaximum: 18,
  metaColumnWidth: 48,
  previewMaximum: 16,
  preservesLatinWritingDirection: true,
  unreadBadgeSize: 24,
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
  expectedMaxHeight: 84,
  footerUsesInformationCard: true,
  switchWidth: 44,
  textColumnFlex: 1,
  textColumnMinWidth: 0,
  usesAbsolutePositioning: false,
} as const;

export const NOTIFICATIONS_LANDING_LAYOUT = {
  pageTitleMaximum: 26,
  sectionOrder: [
    "orderNotifications",
    "notificationCenter",
    "messages",
  ] as const,
  usesMarketingHero: false,
} as const;

export const NOTIFICATION_CARD_LAYOUT = {
  bodyMaximum: 16,
  gap: 12,
  iconSize: 40,
  padding: 14,
  timestampMaximum: 14,
  titleMaximum: 18,
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
  "notificationCenter",
  "notificationsLanding",
  "orders",
  "product",
  "serviceDiscovery",
  "signIn",
  "signUp",
  "conversationPreview",
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
