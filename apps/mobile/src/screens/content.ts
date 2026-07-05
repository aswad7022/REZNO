import type { MobileLocale } from "../i18n/labels";
import type { MobileTabId } from "../navigation/tabs";

type ScreenAction = {
  disabled?: boolean;
  kind?: "primary" | "secondary";
  label: string;
};

type ScreenContent = {
  actions: ScreenAction[];
  description: string;
  eyebrow: string;
  title: string;
};

type ContentParams = {
  apiBaseUrl: string;
  locale: MobileLocale;
  tabId: MobileTabId;
};

const content: Record<MobileLocale, Record<MobileTabId, ScreenContent>> = {
  ar: {
    account: {
      actions: [
        { disabled: true, label: "ربط تسجيل الدخول لاحقاً" },
        { kind: "secondary", label: "عرض إعدادات الحساب" },
      ],
      description:
        "منطقة آمنة لحالة الحساب، اللغة، وروابط لوحة التحكم بعد اعتماد تكامل المصادقة للموبايل.",
      eyebrow: "الحساب",
      title: "حساب واحد لكل أدوارك",
    },
    bookings: {
      actions: [
        { disabled: true, label: "عرض الحجوزات الحقيقية لاحقاً" },
        { kind: "secondary", label: "فتح تفاصيل الحجز" },
      ],
      description:
        "مكان حجوزات العميل القادمة والسابقة. الربط الحقيقي سيستخدم واجهات REZNO الآمنة بدلاً من بيانات تجريبية.",
      eyebrow: "الحجوزات",
      title: "حجوزاتك في مكان واحد",
    },
    business: {
      actions: [
        { disabled: true, label: "فتح لوحة الأعمال لاحقاً" },
        { kind: "secondary", label: "إضافة نشاط تجاري" },
      ],
      description:
        "تبويب الأعمال سيحترم صلاحيات المستخدم. من لا يملك نشاطاً يرى مسار إضافة نشاط بدلاً من بيانات أعمال محمية.",
      eyebrow: "الأعمال",
      title: "إدارة النشاط بدون تبديل حساب",
    },
    customerHome: {
      actions: [
        { disabled: true, label: "تسجيل الدخول لاحقاً" },
        { kind: "secondary", label: "استكشاف السوق" },
      ],
      description:
        "الرئيسية تجمع الحجوزات، الرسائل، المفضلة، وروابط الأعمال داخل تجربة موبايل أصلية.",
      eyebrow: "الرئيسية",
      title: "مرحباً بك في REZNO",
    },
    marketplace: {
      actions: [
        { disabled: true, label: "بحث فعلي لاحقاً" },
        { kind: "secondary", label: "عرض التصنيفات" },
      ],
      description:
        "أساس شاشة الاكتشاف يدعم السوق، التصنيفات، والبحث القريب لاحقاً بدون تحويل التطبيق إلى WebView.",
      eyebrow: "السوق",
      title: "اكتشف الأعمال والخدمات",
    },
    messages: {
      actions: [
        { disabled: true, label: "ربط الرسائل لاحقاً" },
        { kind: "secondary", label: "عرض المحادثات" },
      ],
      description:
        "مركز الرسائل محفوظ كتجربة أصلية، مع انتظار ربط واجهات الرسائل الآمنة في سبرنت مستقل.",
      eyebrow: "الرسائل",
      title: "تواصل مع الأعمال والعملاء",
    },
  },
  en: {
    account: {
      actions: [
        { disabled: true, label: "Connect sign-in later" },
        { kind: "secondary", label: "View account settings" },
      ],
      description:
        "A safe area for account state, language, and dashboard links after mobile authentication integration is approved.",
      eyebrow: "Account",
      title: "One account for every role",
    },
    bookings: {
      actions: [
        { disabled: true, label: "Load real bookings later" },
        { kind: "secondary", label: "Open booking details" },
      ],
      description:
        "The customer booking hub for upcoming and past bookings. Real data will come from approved REZNO APIs, not mock server changes.",
      eyebrow: "Bookings",
      title: "Your bookings in one place",
    },
    business: {
      actions: [
        { disabled: true, label: "Open business dashboard later" },
        { kind: "secondary", label: "Add a business" },
      ],
      description:
        "The business tab will respect user access. Users without a business see an add-business path, not protected business data.",
      eyebrow: "Business",
      title: "Manage work without switching accounts",
    },
    customerHome: {
      actions: [
        { disabled: true, label: "Sign in later" },
        { kind: "secondary", label: "Explore marketplace" },
      ],
      description:
        "The home screen brings bookings, messages, favorites, and business entry into a native mobile experience.",
      eyebrow: "Home",
      title: "Welcome to REZNO",
    },
    marketplace: {
      actions: [
        { disabled: true, label: "Real search later" },
        { kind: "secondary", label: "View categories" },
      ],
      description:
        "The discovery foundation is ready for marketplace, categories, and near-me flows without turning the app into a WebView.",
      eyebrow: "Marketplace",
      title: "Discover businesses and services",
    },
    messages: {
      actions: [
        { disabled: true, label: "Connect messages later" },
        { kind: "secondary", label: "View conversations" },
      ],
      description:
        "Messaging is reserved as a native experience while secure message APIs stay untouched for a separate integration sprint.",
      eyebrow: "Messages",
      title: "Talk with businesses and customers",
    },
  },
  ckb: {
    account: {
      actions: [
        { disabled: true, label: "چوونەژوورەوە دواتر پەیوەست بکە" },
        { kind: "secondary", label: "ڕێکخستنەکانی هەژمار ببینە" },
      ],
      description:
        "شوێنێکی سەلامەت بۆ دۆخی هەژمار، زمان، و بەستەرەکانی داشبۆرد دوای ڕەزامەندی تکامولی مۆبایل.",
      eyebrow: "هەژمار",
      title: "یەک هەژمار بۆ هەموو ڕۆڵەکان",
    },
    bookings: {
      actions: [
        { disabled: true, label: "حجزە ڕاستەقینەکان دواتر پیشان بدە" },
        { kind: "secondary", label: "وردەکاری حجز بکەرەوە" },
      ],
      description:
        "ناوەندی حجزەکانی کڕیار بۆ داهاتوو و ڕابردوو. داتای ڕاستەقینە لە API ـە ڕەزامەندکراوەکانی REZNO وەردەگیرێت.",
      eyebrow: "حجزەکان",
      title: "حجزەکانت لە یەک شوێن",
    },
    business: {
      actions: [
        { disabled: true, label: "داشبۆردی کار دواتر بکەرەوە" },
        { kind: "secondary", label: "کارێک زیاد بکە" },
      ],
      description:
        "تابی کار ڕێگەپێدانەکانی بەکارهێنەر ڕێز دەگرێت. ئەوانەی کار نییەیان ڕێڕەوی زیادکردنی کار دەبینن.",
      eyebrow: "کارەکان",
      title: "کارەکان بەبێ گۆڕینی هەژمار بەڕێوەببە",
    },
    customerHome: {
      actions: [
        { disabled: true, label: "چوونەژوورەوە دواتر" },
        { kind: "secondary", label: "بازاڕ بگەڕێ" },
      ],
      description:
        "شاشەی سەرەکی حجزەکان، نامەکان، دڵخوازەکان، و چوونە ناو کارەکان لە ئەزموونێکی مۆبایلی ڕاستەقینە کۆدەکاتەوە.",
      eyebrow: "سەرەکی",
      title: "بەخێربێیت بۆ REZNO",
    },
    marketplace: {
      actions: [
        { disabled: true, label: "گەڕانی ڕاستەقینە دواتر" },
        { kind: "secondary", label: "پۆلەکان ببینە" },
      ],
      description:
        "بناغەی دۆزینەوە ئامادەیە بۆ بازاڕ، پۆلەکان، و نزیکە من، بەبێ ئەوەی ئەپ ببێتە WebView.",
      eyebrow: "بازاڕ",
      title: "کار و خزمەتگوزاری بدۆزەرەوە",
    },
    messages: {
      actions: [
        { disabled: true, label: "نامەکان دواتر پەیوەست بکە" },
        { kind: "secondary", label: "گفتوگۆکان ببینە" },
      ],
      description:
        "نامەکان وەک ئەزموونێکی مۆبایلی ڕاستەقینە پارێزراون تا API ـە سەلامەتەکان لە سبرنتێکی جیاواز پەیوەست بکرێن.",
      eyebrow: "نامەکان",
      title: "لەگەڵ کارەکان و کڕیاران بدوێ",
    },
  },
};

export function getScreenContent(params: ContentParams): ScreenContent {
  return content[params.locale][params.tabId];
}
