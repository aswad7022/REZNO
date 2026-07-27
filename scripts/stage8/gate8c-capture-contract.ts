import type {
  Gate8cExpectedState,
  Gate8cForbiddenSelectorContract,
  Gate8cForbiddenTextContract,
  Gate8cLocale,
  Gate8cSelectorContract,
  Gate8cStateContract,
  Gate8cTheme,
  Gate8cVisibleTextContract,
} from "./gate8c-visual-evidence";
import type { Gate8cVisualRole } from "./gate8c-visual-fixture";

export interface Gate8cFixtureRoute {
  candidateEmail: string;
  candidateUserId: string;
}

export interface Gate8cCaptureSpec {
  file: string;
  route: string | ((fixture: Gate8cFixtureRoute) => string);
  locale: Gate8cLocale;
  theme: Gate8cTheme;
  role: Gate8cVisualRole;
  expectedState: Gate8cExpectedState;
  width: number;
  height: number;
  families: string[];
  requiredLandmarks: Gate8cSelectorContract[];
  forbiddenStates?: Gate8cForbiddenSelectorContract[];
  requiredVisibleText: Gate8cVisibleTextContract[];
  forbiddenVisibleText: Gate8cForbiddenTextContract[];
  languageExceptions: string[];
  stateContract: Gate8cStateContract;
  openAdminNavigation?: boolean;
  scrollTo?: string;
  loadingNavigation?: {
    from: string;
    to: string;
    linkName: string;
  };
  allowedDocumentStatuses?: number[];
  reviewPrompt: string;
}

export const gate8cFinalForbidden: Gate8cForbiddenSelectorContract[] = [
  {
    selector: '[aria-busy="true"]',
    description: "loading state on a final capture",
  },
  {
    selector: '[data-slot="skeleton"]',
    description: "skeleton on a final capture",
  },
  {
    selector: "nextjs-portal",
    description: "Next.js development overlay",
  },
  {
    selector: "[data-nextjs-dialog-overlay]",
    description: "Next.js error overlay",
  },
  {
    selector: "[data-next-badge-root]",
    description: "Next.js development badge",
  },
];

const adminMain: Gate8cSelectorContract[] = [
  { selector: '[data-business-admin-surface="admin"]' },
  { selector: "main#main-content" },
  { selector: "h1" },
];
const businessMain: Gate8cSelectorContract[] = [
  { selector: '[data-business-admin-surface="business"]' },
  { selector: "main#main-content" },
  { selector: "h1" },
];
const finalState = (selector = "main#main-content"): Gate8cStateContract => ({
  marker: { selector, requireInViewport: true },
});
const visible = (
  language: Gate8cVisibleTextContract["language"],
  text: string,
  selector = "body",
): Gate8cVisibleTextContract => ({
  language,
  requireInViewport: true,
  selector,
  text,
});
const forbidden = (
  language: Gate8cLocale,
  text: string,
  selector = "body",
): Gate8cForbiddenTextContract => ({
  language,
  selector,
  text,
  viewportOnly: true,
});

export const gate8cCaptureSpecs: Gate8cCaptureSpec[] = [
  {
    file: "admin-access-form-desktop-ar-light.png",
    route: (fixture) =>
      `/admin/access?mode=add&q=${encodeURIComponent(
        fixture.candidateEmail,
      )}&userId=${fixture.candidateUserId}#grant-admin`,
    locale: "ar",
    theme: "light",
    role: "root-super-admin",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["form", "permission"],
    requiredLandmarks: [
      ...adminMain,
      { selector: "#grant-admin", requireInViewport: true },
      { selector: 'input[name="userId"]', requireInViewport: true },
      {
        selector: 'input[name="permissions"]',
        minCount: 1,
        requireInViewport: true,
      },
    ],
    requiredVisibleText: [
      visible("ar", "إضافة أدمن جديد"),
      visible("ar", "منح وصول أدمن"),
    ],
    forbiddenVisibleText: [forbidden("en", "Add new admin")],
    languageExceptions: [
      "Root Super Admin",
      "REZNO_ADMIN_EMAILS",
      "permission enum identifiers",
    ],
    stateContract: finalState("#grant-admin"),
    scrollTo: "#grant-admin",
    reviewPrompt:
      "Verify the Arabic grant form, permission controls, and final non-loading state.",
  },
  {
    file: "admin-businesses-filters-desktop-ar-light.png",
    route: "/admin/businesses",
    locale: "ar",
    theme: "light",
    role: "root-super-admin",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["table", "form"],
    requiredLandmarks: [
      ...adminMain,
      { selector: "form" },
      { selector: 'input[name="q"]' },
    ],
    requiredVisibleText: [visible("ar", "الأنشطة"), visible("ar", "تصفية")],
    forbiddenVisibleText: [forbidden("en", "Businesses")],
    languageExceptions: ["business vertical and status enum identifiers"],
    stateContract: finalState(),
    reviewPrompt:
      "Verify Arabic business filters and deterministic fixture organization content.",
  },
  {
    file: "admin-commerce-dense-desktop-ar-light.png",
    route: "/admin/commerce",
    locale: "ar",
    theme: "light",
    role: "root-super-admin",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["commerce", "dense-data", "table"],
    requiredLandmarks: [
      ...adminMain,
      { selector: 'a[href="/admin/commerce/stores"]' },
      { selector: 'a[href="/admin/commerce/orders"]' },
    ],
    requiredVisibleText: [
      visible("ar", "عمليات إدارة التجارة"),
      visible("ar", "المتاجر"),
    ],
    forbiddenVisibleText: [forbidden("en", "Commerce operations")],
    languageExceptions: [],
    stateContract: finalState(),
    reviewPrompt:
      "Verify the Arabic commerce cards are complete and viewport-contained.",
  },
  {
    file: "admin-communications-empty-desktop-ar-light.png",
    route: "/admin/communications",
    locale: "ar",
    theme: "light",
    role: "communications-viewer",
    expectedState: "empty",
    width: 1440,
    height: 1000,
    families: ["communications", "empty"],
    requiredLandmarks: [
      ...adminMain,
      {
        selector: '[data-stage4-communications-state="empty"]',
        requireInViewport: true,
      },
    ],
    forbiddenStates: [
      ...gate8cFinalForbidden,
      {
        selector: '[data-stage4-communications-state="campaign"]',
        description: "campaign result in the declared empty state",
        viewportOnly: true,
      },
      {
        selector: '[data-stage4-communications-create-form="true"]',
        description: "campaign creation form in the empty-state viewport",
        viewportOnly: true,
      },
    ],
    requiredVisibleText: [
      visible("ar", "سجل الحملات"),
      visible("ar", "لا توجد حملات بعد."),
    ],
    forbiddenVisibleText: [forbidden("en", "No campaigns yet.")],
    languageExceptions: [],
    stateContract: {
      marker: {
        selector: '[data-stage4-communications-state="empty"]',
        requireInViewport: true,
      },
      forbiddenInViewport: [
        {
          selector: '[data-stage4-communications-state="campaign"]',
          description: "campaign result",
        },
        {
          selector: '[data-stage4-communications-create-form="true"]',
          description: "campaign creation form",
        },
        {
          selector: '[aria-busy="true"]',
          description: "loading state",
        },
      ],
    },
    scrollTo: '[data-stage4-communications-state="empty"]',
    reviewPrompt:
      "Verify the Arabic campaign history empty state is visibly centered and no create form is in the viewport.",
  },
  {
    file: "admin-not-found-error-compact-en-dark.png",
    route: "/admin/gate8c-intentional-not-found",
    locale: "en",
    theme: "dark",
    role: "root-super-admin",
    expectedState: "error",
    width: 390,
    height: 844,
    families: ["error"],
    requiredLandmarks: [
      { selector: "main", requireInViewport: true },
      { selector: "h1", requireInViewport: true },
      { selector: "text=404", requireInViewport: true },
    ],
    requiredVisibleText: [
      visible("en", "Page not found"),
      visible("en", "Back to home"),
    ],
    forbiddenVisibleText: [forbidden("ar", "الصفحة غير موجودة")],
    languageExceptions: ["404"],
    stateContract: finalState("h1"),
    allowedDocumentStatuses: [404],
    reviewPrompt:
      "Verify the English production 404 state has no development or error overlay.",
  },
  {
    file: "admin-loading-desktop-en-dark.png",
    route: "/admin/platform-jobs",
    locale: "en",
    theme: "dark",
    role: "root-super-admin",
    expectedState: "loading",
    width: 1280,
    height: 720,
    families: ["loading"],
    requiredLandmarks: [
      { selector: '[data-business-admin-surface="admin"]' },
      { selector: "main#main-content" },
      {
        selector: '[aria-busy="true"]',
        requireInViewport: true,
      },
      {
        selector: '[data-slot="skeleton"]',
        minCount: 1,
        requireInViewport: true,
      },
    ],
    forbiddenStates: gate8cFinalForbidden.filter(
      ({ selector }) =>
        selector !== '[aria-busy="true"]' &&
        selector !== '[data-slot="skeleton"]',
    ),
    requiredVisibleText: [
      visible("en", "Platform jobs"),
      visible("en", "Overview"),
    ],
    forbiddenVisibleText: [forbidden("ar", "مهام المنصة")],
    languageExceptions: [],
    stateContract: {
      marker: {
        selector: '[aria-busy="true"]',
        requireInViewport: true,
      },
    },
    loadingNavigation: {
      from: "/admin",
      to: "/admin/platform-jobs",
      linkName: "Platform jobs",
    },
    reviewPrompt:
      "Verify the intentional English production loading boundary and skeleton.",
  },
  {
    file: "admin-navigation-dialog-compact-ar-dark.png",
    route: "/admin",
    locale: "ar",
    theme: "dark",
    role: "root-super-admin",
    expectedState: "dialog-open",
    width: 390,
    height: 844,
    families: ["dialog"],
    requiredLandmarks: [
      ...adminMain,
      { selector: '[role="dialog"]', requireInViewport: true },
      { selector: 'nav[aria-label="التنقل في لوحة الإدارة"]' },
    ],
    requiredVisibleText: [
      visible("ar", "مساحات الإدارة"),
      visible("ar", "نظرة عامة"),
    ],
    forbiddenVisibleText: [forbidden("en", "Admin workspaces")],
    languageExceptions: [],
    stateContract: finalState('[role="dialog"]'),
    openAdminNavigation: true,
    reviewPrompt:
      "Verify the Arabic compact navigation dialog opens from the RTL start side.",
  },
  {
    file: "admin-navigation-dialog-compact-en-dark.png",
    route: "/admin",
    locale: "en",
    theme: "dark",
    role: "root-super-admin",
    expectedState: "dialog-open",
    width: 390,
    height: 844,
    families: ["dialog"],
    requiredLandmarks: [
      ...adminMain,
      { selector: '[role="dialog"]', requireInViewport: true },
      { selector: 'nav[aria-label="Admin dashboard navigation"]' },
    ],
    requiredVisibleText: [
      visible("en", "Admin workspaces"),
      visible("en", "Overview"),
    ],
    forbiddenVisibleText: [forbidden("ar", "مساحات الإدارة")],
    languageExceptions: [],
    stateContract: finalState('[role="dialog"]'),
    openAdminNavigation: true,
    reviewPrompt:
      "Verify the English compact navigation dialog opens from the LTR start side.",
  },
  {
    file: "admin-overview-compact-ar-dark.png",
    route: "/admin",
    locale: "ar",
    theme: "dark",
    role: "root-super-admin",
    expectedState: "final",
    width: 390,
    height: 844,
    families: ["dense-data"],
    requiredLandmarks: [
      ...adminMain,
      { selector: 'button[aria-label="فتح قائمة الإدارة"]' },
    ],
    requiredVisibleText: [
      visible("ar", "مركز تحكم المنصة"),
      visible("ar", "إجمالي الأنشطة"),
    ],
    forbiddenVisibleText: [forbidden("en", "Platform control center")],
    languageExceptions: ["REZNO", "database and runtime enum values"],
    stateContract: finalState(),
    reviewPrompt:
      "Verify the Arabic compact overview title, metrics, RTL width, and actions.",
  },
  {
    file: "admin-overview-compact-en-dark.png",
    route: "/admin",
    locale: "en",
    theme: "dark",
    role: "root-super-admin",
    expectedState: "final",
    width: 390,
    height: 844,
    families: ["dense-data"],
    requiredLandmarks: [
      ...adminMain,
      { selector: 'button[aria-label="Open admin menu"]' },
    ],
    requiredVisibleText: [
      visible("en", "Platform control center"),
      visible("en", "Total businesses"),
    ],
    forbiddenVisibleText: [forbidden("ar", "مركز تحكم المنصة")],
    languageExceptions: ["REZNO", "database and runtime enum values"],
    stateContract: finalState(),
    reviewPrompt:
      "Verify the English compact overview uses the available width without collapse.",
  },
  {
    file: "admin-overview-desktop-ar-light.png",
    route: "/admin",
    locale: "ar",
    theme: "light",
    role: "root-super-admin",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["dense-data"],
    requiredLandmarks: [
      ...adminMain,
      { selector: 'nav[aria-label="التنقل في لوحة الإدارة"]' },
    ],
    requiredVisibleText: [
      visible("ar", "مركز تحكم المنصة"),
      visible("ar", "أحدث الأنشطة"),
    ],
    forbiddenVisibleText: [forbidden("en", "Platform control center")],
    languageExceptions: ["REZNO", "database and runtime enum values"],
    stateContract: finalState(),
    reviewPrompt:
      "Verify the Arabic desktop overview is complete and RTL-aligned.",
  },
  {
    file: "admin-overview-desktop-en-light.png",
    route: "/admin",
    locale: "en",
    theme: "light",
    role: "root-super-admin",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["dense-data"],
    requiredLandmarks: [
      ...adminMain,
      { selector: 'nav[aria-label="Admin dashboard navigation"]' },
    ],
    requiredVisibleText: [
      visible("en", "Platform control center"),
      visible("en", "Recent businesses"),
    ],
    forbiddenVisibleText: [forbidden("ar", "مركز تحكم المنصة")],
    languageExceptions: ["REZNO", "database and runtime enum values"],
    stateContract: finalState(),
    reviewPrompt:
      "Verify the English desktop overview title, metrics, and LTR layout.",
  },
  {
    file: "admin-permission-denied-compact-en-dark.png",
    route: "/admin",
    locale: "en",
    theme: "dark",
    role: "authenticated-non-admin",
    expectedState: "permission-denied",
    width: 390,
    height: 844,
    families: ["permission", "error"],
    requiredLandmarks: [
      { selector: "h1", requireInViewport: true },
      { selector: "text=403", requireInViewport: true },
      { selector: 'a[href="/"]', requireInViewport: true },
    ],
    requiredVisibleText: [
      visible("en", "Access unavailable"),
      visible("en", "cannot access this area"),
    ],
    forbiddenVisibleText: [forbidden("ar", "غير مصرح")],
    languageExceptions: ["403"],
    stateContract: finalState("h1"),
    allowedDocumentStatuses: [403],
    reviewPrompt:
      "Verify the English localized 403 state contains no protected Admin content.",
  },
  {
    file: "admin-platform-jobs-truth-desktop-ar-light.png",
    route: "/admin/platform-jobs",
    locale: "ar",
    theme: "light",
    role: "root-super-admin",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["platform", "dense-data"],
    requiredLandmarks: [...adminMain, { selector: '[role="status"]' }],
    requiredVisibleText: [
      visible("ar", "مهام المنصة"),
      visible("ar", "وقت تشغيل المرحلة السادسة غير مفعّل"),
    ],
    forbiddenVisibleText: [
      forbidden("en", "Stage 6 runtime is not activated"),
    ],
    languageExceptions: [
      "PostgreSQL",
      "job type/status/source enum identifiers",
      "runtime architecture values",
    ],
    stateContract: finalState('[role="status"]'),
    reviewPrompt:
      "Verify Arabic Platform Jobs truth copy and the explicit inactive runtime state.",
  },
  {
    file: "business-notification-preferences-table-desktop-en-light.png",
    route: "/business/notifications",
    locale: "en",
    theme: "light",
    role: "business-owner",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["communications", "form", "table"],
    requiredLandmarks: [
      ...businessMain,
      { selector: "table", requireInViewport: true },
    ],
    requiredVisibleText: [
      visible("en", "Outbound channel preferences"),
      visible("en", "Category"),
    ],
    forbiddenVisibleText: [forbidden("ar", "تفضيلات قنوات الإرسال")],
    languageExceptions: [
      "EMAIL, SMS, PUSH and communication category enum identifiers",
    ],
    stateContract: finalState("table"),
    scrollTo: "table",
    reviewPrompt:
      "Verify the English outbound preference table is readable and locally scrollable.",
  },
  {
    file: "admin-platform-operations-desktop-ar-light.png",
    route: "/admin/platform-operations",
    locale: "ar",
    theme: "light",
    role: "root-super-admin",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["platform"],
    requiredLandmarks: [...adminMain, { selector: '[role="status"]' }],
    requiredVisibleText: [
      visible("ar", "عمليات المنصة"),
      visible("ar", "وقت تشغيل المرحلة السادسة غير مفعّل"),
    ],
    forbiddenVisibleText: [forbidden("en", "Platform operations")],
    languageExceptions: [
      "provider/runtime enum identifiers",
      "health metric identifiers",
    ],
    stateContract: finalState('[role="status"]'),
    reviewPrompt:
      "Verify Arabic Platform Operations explicitly presents inactive runtime truth.",
  },
  {
    file: "admin-platform-operations-desktop-en-dark.png",
    route: "/admin/platform-operations",
    locale: "en",
    theme: "dark",
    role: "root-super-admin",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["platform", "dense-data"],
    requiredLandmarks: [...adminMain, { selector: '[role="status"]' }],
    requiredVisibleText: [
      visible("en", "Platform operations"),
      visible("en", "Stage 6 runtime is not activated"),
    ],
    forbiddenVisibleText: [forbidden("ar", "عمليات المنصة")],
    languageExceptions: [
      "provider/runtime enum identifiers",
      "health metric identifiers",
    ],
    stateContract: finalState('[role="status"]'),
    reviewPrompt:
      "Verify English Platform Operations does not imply deployment connectivity.",
  },
  {
    file: "admin-restaurants-empty-desktop-en-dark.png",
    route: "/admin/restaurants",
    locale: "en",
    theme: "dark",
    role: "root-super-admin",
    expectedState: "empty",
    width: 1440,
    height: 1000,
    families: ["restaurant", "empty"],
    requiredLandmarks: [
      ...adminMain,
      {
        selector: '[data-admin-restaurants-state="empty"]',
        requireInViewport: true,
      },
    ],
    requiredVisibleText: [
      visible("en", "Restaurants and cafés"),
      visible("en", "No restaurants or cafés are registered"),
    ],
    forbiddenVisibleText: [forbidden("ar", "لا توجد مطاعم أو مقاهٍ مسجلة")],
    languageExceptions: [],
    stateContract: finalState('[data-admin-restaurants-state="empty"]'),
    reviewPrompt:
      "Verify the final English restaurant empty state and absence of loading artifacts.",
  },
  {
    file: "business-bookings-calendar-compact-ar-dark.png",
    route: "/business/bookings?view=upcoming",
    locale: "ar",
    theme: "dark",
    role: "business-owner",
    expectedState: "final",
    width: 390,
    height: 844,
    families: ["bookings"],
    requiredLandmarks: [
      ...businessMain,
      { selector: 'form input[name="date"]' },
      {
        selector: 'a[href*="/business/bookings/"]',
        minCount: 1,
        requireInViewport: true,
      },
    ],
    requiredVisibleText: [
      visible("ar", "الحجوزات القادمة"),
      visible("ar", "مؤكد"),
      visible("technical", "Visual Fixture Customer"),
      visible("technical", "Visual Fixture Service"),
    ],
    forbiddenVisibleText: [forbidden("en", "Business bookings")],
    languageExceptions: [
      "explicit synthetic fixture names",
      "booking status enum identifier",
    ],
    stateContract: finalState('a[href*="/business/bookings/"]'),
    scrollTo: 'a[href*="/business/bookings/"]',
    reviewPrompt:
      "Verify the Arabic compact booking card is not clipped, repeated, or stitched and contact data is absent.",
  },
  {
    file: "business-dashboard-compact-ckb-dark.png",
    route: "/business",
    locale: "ckb",
    theme: "dark",
    role: "business-owner",
    expectedState: "final",
    width: 390,
    height: 844,
    families: ["dense-data"],
    requiredLandmarks: [...businessMain],
    requiredVisibleText: [
      visible("ckb", "بەخێربێیتەوە"),
      visible("ckb", "پوختەی کردارەکانی بازرگانی"),
    ],
    forbiddenVisibleText: [forbidden("en", "Welcome back")],
    languageExceptions: ["explicit synthetic fixture names"],
    stateContract: finalState(),
    reviewPrompt:
      "Verify the Kurdish compact Business dashboard uses the full RTL viewport.",
  },
  {
    file: "business-dashboard-desktop-ckb-dark.png",
    route: "/business",
    locale: "ckb",
    theme: "dark",
    role: "business-owner",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["dense-data"],
    requiredLandmarks: [...businessMain],
    requiredVisibleText: [
      visible("ckb", "بەخێربێیتەوە"),
      visible("ckb", "نزیکترین حجزەکان"),
    ],
    forbiddenVisibleText: [forbidden("en", "Nearest bookings")],
    languageExceptions: ["explicit synthetic fixture names"],
    stateContract: finalState(),
    reviewPrompt:
      "Verify the Kurdish dark desktop Business dashboard and localized content.",
  },
  {
    file: "business-dashboard-desktop-ckb-light.png",
    route: "/business",
    locale: "ckb",
    theme: "light",
    role: "business-owner",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["dense-data"],
    requiredLandmarks: [...businessMain],
    requiredVisibleText: [
      visible("ckb", "بەخێربێیتەوە"),
      visible("ckb", "نزیکترین حجزەکان"),
    ],
    forbiddenVisibleText: [forbidden("en", "Nearest bookings")],
    languageExceptions: ["explicit synthetic fixture names"],
    stateContract: finalState(),
    reviewPrompt:
      "Verify the Kurdish light desktop Business dashboard and semantic contrast.",
  },
  {
    file: "business-services-form-compact-ar-dark.png",
    route: "/business/services",
    locale: "ar",
    theme: "dark",
    role: "business-owner",
    expectedState: "final",
    width: 390,
    height: 844,
    families: ["form"],
    requiredLandmarks: [
      ...businessMain,
      { selector: "form" },
      {
        selector: 'input[name="name"]',
        requireInViewport: true,
      },
    ],
    requiredVisibleText: [
      visible("ar", "إضافة خدمة"),
      visible("ar", "اسم الخدمة"),
    ],
    forbiddenVisibleText: [forbidden("en", "Add service")],
    languageExceptions: [],
    stateContract: finalState('input[name="name"]'),
    scrollTo: 'input[name="name"]',
    reviewPrompt:
      "Verify the Arabic compact service form is usable and viewport-contained.",
  },
  {
    file: "business-services-form-compact-ckb-dark.png",
    route: "/business/services",
    locale: "ckb",
    theme: "dark",
    role: "business-owner",
    expectedState: "final",
    width: 390,
    height: 844,
    families: ["form"],
    requiredLandmarks: [
      ...businessMain,
      { selector: "form" },
      {
        selector: 'input[name="name"]',
        requireInViewport: true,
      },
    ],
    requiredVisibleText: [
      visible("ckb", "زیادکردنی خزمەتگوزاری"),
      visible("ckb", "ناوی خزمەتگوزاری"),
    ],
    forbiddenVisibleText: [forbidden("en", "Add service")],
    languageExceptions: [],
    stateContract: finalState('input[name="name"]'),
    scrollTo: 'input[name="name"]',
    reviewPrompt:
      "Verify the Kurdish compact service form is usable and viewport-contained.",
  },
];

export function assertGate8cCaptureContract() {
  if (gate8cCaptureSpecs.length !== 24) {
    throw new Error("Gate 8C capture contract must contain exactly 24 cases.");
  }
  const files = new Set<string>();
  for (const spec of gate8cCaptureSpecs) {
    if (files.has(spec.file)) throw new Error(`Duplicate capture: ${spec.file}`);
    files.add(spec.file);
    if (spec.requiredVisibleText.length < 2) {
      throw new Error(`${spec.file} lacks precise visible-language evidence.`);
    }
    if (
      spec.requiredVisibleText.some(
        (entry) => entry.language !== spec.locale && entry.language !== "technical",
      )
    ) {
      throw new Error(`${spec.file} has a mismatched visible-language contract.`);
    }
    if (spec.forbiddenVisibleText.length < 1) {
      throw new Error(`${spec.file} lacks a foreign-language negative contract.`);
    }
  }
}
