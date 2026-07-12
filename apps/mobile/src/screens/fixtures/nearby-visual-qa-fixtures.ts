export type NearbyVisualQaArtwork = "clinic" | "restaurant" | "salon";

export type PreviewBusinessVertical = "clinic" | "restaurant" | "salon";

export type NearbyVisualQaBusinessId =
  | "preview-nearby-mat3am"
  | "preview-nearby-noura"
  | "preview-nearby-smile";

export type PreviewSelectionOption = {
  avatarInitials?: string;
  duration: string | null;
  id: string;
  label: string;
  price: string | null;
  rating?: number;
  supportingText: string | null;
};

export type PreviewTimeOption = {
  id: string;
  label: string;
};

export type PreviewNoteConfig = {
  label: string;
  placeholder: string;
  safetyText: string;
};

export type PreviewBookingConfig = {
  confirmationBody: string;
  confirmationTitle: string;
  configurationSubtitle: string;
  configurationTitle: string;
  defaultPrimaryId: string;
  defaultSecondaryId: string;
  defaultTimeId: string;
  note: PreviewNoteConfig | null;
  paymentLabel: string;
  primaryReviewLabel: string;
  primaryReviewSuffix: string | null;
  primaryTitle: string;
  reference: string;
  reviewTitle: string;
  secondaryReviewLabel: string;
  secondaryTitle: string;
  times: readonly PreviewTimeOption[];
};

export type NearbyVisualQaFixture = {
  artwork: NearbyVisualQaArtwork;
  about: string;
  address: string;
  badge: string;
  booking: PreviewBookingConfig;
  category: string;
  ctaLabel: string;
  description: string;
  detailOptionsTitle: string;
  distance: string;
  distanceKm: number;
  features: readonly string[];
  hours: string;
  id: NearbyVisualQaBusinessId;
  locationSummary: string;
  markerPosition: {
    x: number;
    y: number;
  };
  name: string;
  primaryOptions: readonly PreviewSelectionOption[];
  rating: number;
  reviewCount: number;
  secondaryOptions: readonly PreviewSelectionOption[];
  status: string;
  vertical: PreviewBusinessVertical;
};

export type NearbyVisualQaUserPosition = {
  x: number;
  y: number;
};

// TEMPORARY VISUAL QA ONLY — disable before production commit
export const SHOW_NEARBY_VISUAL_QA_FIXTURES = true;

const NEARBY_VISUAL_QA_PREVIEW_TOKEN = {};

export function getNearbyVisualQaFixturePreviewToken(): object | null {
  return __DEV__ && SHOW_NEARBY_VISUAL_QA_FIXTURES
    ? NEARBY_VISUAL_QA_PREVIEW_TOKEN
    : null;
}

export function isNearbyVisualQaFixturePreviewEnabled() {
  return getNearbyVisualQaFixturePreviewToken() !== null;
}

export const NEARBY_VISUAL_QA_FIXTURES: readonly NearbyVisualQaFixture[] = [
  {
    artwork: "salon",
    about:
      "مساحة عناية رجالية هادئة تجمع القص والتصفيف والعناية اليومية ضمن تجربة حجز واضحة.",
    address: "بغداد، المنصور",
    badge: "مفتوح الآن",
    booking: {
      confirmationBody:
        "تم حفظ تأكيد محلي لهذه المعاينة فقط، ولم يتم إنشاء حجز حقيقي.",
      confirmationTitle: "تم تأكيد موعدك",
      configurationSubtitle: "اختر الخدمة والموظف المناسب قبل تحديد الموعد.",
      configurationTitle: "تفاصيل موعد الصالون",
      defaultPrimaryId: "salon-haircut",
      defaultSecondaryId: "salon-staff-any",
      defaultTimeId: "salon-time-1530",
      note: null,
      paymentLabel: "الدفع في المكان",
      primaryReviewLabel: "الخدمة",
      primaryReviewSuffix: null,
      primaryTitle: "اختر الخدمة",
      reference: "RZ-SALON-1024",
      reviewTitle: "راجع تفاصيل الموعد",
      secondaryReviewLabel: "الموظف",
      secondaryTitle: "اختر الموظف",
      times: [
        { id: "salon-time-1000", label: "10:00 ص" },
        { id: "salon-time-1130", label: "11:30 ص" },
        { id: "salon-time-1300", label: "1:00 م" },
        { id: "salon-time-1530", label: "3:30 م" },
        { id: "salon-time-1700", label: "5:00 م" },
        { id: "salon-time-1930", label: "7:30 م" },
      ],
    },
    category: "صالون وتجميل",
    ctaLabel: "احجز موعداً",
    description:
      "خدمات قص وتصفيف وعناية مختارة في قلب المنصور، ضمن مواعيد مرنة وتجربة هادئة.",
    detailOptionsTitle: "الخدمات المتاحة",
    distance: "0.6 كم",
    distanceKm: 0.6,
    features: ["حجز مسبق", "عناية رجالية", "مواعيد مرنة"],
    hours: "10:00 ص – 10:00 م",
    id: "preview-nearby-noura",
    locationSummary: "المنصور · قريب من شارع الأميرات",
    markerPosition: { x: 0.27, y: 0.32 },
    name: "Noura Beauty Lounge",
    primaryOptions: [
      {
        duration: "30 دقيقة",
        id: "salon-haircut",
        label: "قص شعر رجالي",
        price: "25,000 د.ع",
        supportingText: null,
      },
      {
        duration: "45 دقيقة",
        id: "salon-style",
        label: "حلاقة وتصفيف",
        price: "35,000 د.ع",
        supportingText: null,
      },
      {
        duration: "60 دقيقة",
        id: "salon-facial",
        label: "تنظيف بشرة",
        price: "45,000 د.ع",
        supportingText: null,
      },
      {
        duration: "30 دقيقة",
        id: "salon-beard",
        label: "عناية ولحية",
        price: "20,000 د.ع",
        supportingText: null,
      },
    ],
    rating: 4.9,
    reviewCount: 128,
    secondaryOptions: [
      {
        avatarInitials: "أح",
        duration: null,
        id: "salon-staff-ahmed",
        label: "أحمد",
        price: null,
        rating: 4.9,
        supportingText: "حلاق محترف",
      },
      {
        avatarInitials: "مص",
        duration: null,
        id: "salon-staff-mustafa",
        label: "مصطفى",
        price: null,
        rating: 4.8,
        supportingText: "حلاق محترف",
      },
      {
        avatarInitials: "عل",
        duration: null,
        id: "salon-staff-ali",
        label: "علي",
        price: null,
        rating: 4.7,
        supportingText: "حلاق محترف",
      },
      {
        duration: null,
        id: "salon-staff-any",
        label: "أي موظف متاح",
        price: null,
        supportingText: "أقرب موعد مناسب",
      },
    ],
    status: "مفتوح الآن",
    vertical: "salon",
  },
  {
    artwork: "restaurant",
    about:
      "مطعم عراقي معاصر يقدّم تجربة عشاء هادئة وخيارات جلسات تناسب العائلات والمجموعات.",
    address: "بغداد، الجادرية",
    badge: "حجز سريع",
    booking: {
      confirmationBody:
        "تم إعداد تأكيد محلي للطاولة في وضع المعاينة، دون إرسال حجز إلى المطعم.",
      confirmationTitle: "تم حجز طاولتك",
      configurationSubtitle: "حدد عدد الضيوف ونوع الجلسة المفضلة.",
      configurationTitle: "تفاصيل حجز الطاولة",
      defaultPrimaryId: "restaurant-guests-4",
      defaultSecondaryId: "restaurant-seating-family",
      defaultTimeId: "restaurant-time-2030",
      note: {
        label: "ملاحظة اختيارية",
        placeholder: "أضف ملاحظة للمطعم...",
        safetyText: "تبقى الملاحظة على هذا الجهاز داخل المعاينة ولا تُرسل.",
      },
      paymentLabel: "رسوم الحجز: مجاناً",
      primaryReviewLabel: "عدد الضيوف",
      primaryReviewSuffix: "أشخاص",
      primaryTitle: "عدد الضيوف",
      reference: "RZ-TABLE-2048",
      reviewTitle: "راجع تفاصيل الطاولة",
      secondaryReviewLabel: "نوع الجلسة",
      secondaryTitle: "تفضيل الجلسة",
      times: [
        { id: "restaurant-time-1300", label: "1:00 م" },
        { id: "restaurant-time-1430", label: "2:30 م" },
        { id: "restaurant-time-1700", label: "5:00 م" },
        { id: "restaurant-time-1900", label: "7:00 م" },
        { id: "restaurant-time-2030", label: "8:30 م" },
        { id: "restaurant-time-2200", label: "10:00 م" },
      ],
    },
    category: "مطعم وحلويات",
    ctaLabel: "احجز طاولة",
    description:
      "أجواء دافئة وقائمة مختارة مع تأكيد سريع للطاولات في الجادرية.",
    detailOptionsTitle: "معلومات الحجز",
    distance: "2.4 كم",
    distanceKm: 2.4,
    features: [
      "جلسات داخلية",
      "قسم عائلي",
      "مواقف سيارات",
      "مناسب للمجموعات",
      "تأكيد فوري",
    ],
    hours: "12:00 م – 12:00 ص",
    id: "preview-nearby-mat3am",
    locationSummary: "الجادرية · قرب مجمع المطاعم",
    markerPosition: { x: 0.72, y: 0.3 },
    name: "Mat3am Gold",
    primaryOptions: ["1", "2", "3", "4", "5", "6+"].map((label) => ({
      duration: null,
      id: `restaurant-guests-${label.replace("+", "plus")}`,
      label,
      price: null,
      supportingText: "ضيف",
    })),
    rating: 4.8,
    reviewCount: 96,
    secondaryOptions: [
      {
        duration: null,
        id: "restaurant-seating-none",
        label: "بدون تفضيل",
        price: null,
        supportingText: null,
      },
      {
        duration: null,
        id: "restaurant-seating-indoor",
        label: "داخلي",
        price: null,
        supportingText: null,
      },
      {
        duration: null,
        id: "restaurant-seating-family",
        label: "عائلي",
        price: null,
        supportingText: null,
      },
      {
        duration: null,
        id: "restaurant-seating-window",
        label: "قرب النافذة",
        price: null,
        supportingText: null,
      },
    ],
    status: "حجز سريع",
    vertical: "restaurant",
  },
  {
    artwork: "clinic",
    about:
      "عيادة أسنان حديثة للحجوزات والاستشارات الأولية، مع عرض واضح لمدة الموعد وتكلفته.",
    address: "بغداد، الكرادة",
    badge: "متخصصون",
    booking: {
      confirmationBody:
        "تم إنشاء تأكيد محلي للمعاينة فقط، ولا يمثل موعداً طبياً حقيقياً.",
      confirmationTitle: "تم تأكيد موعد العيادة",
      configurationSubtitle: "اختر نوع الموعد والطبيب قبل تحديد الوقت.",
      configurationTitle: "تفاصيل موعد العيادة",
      defaultPrimaryId: "clinic-consultation",
      defaultSecondaryId: "clinic-doctor-any",
      defaultTimeId: "clinic-time-1100",
      note: {
        label: "سبب الزيارة — اختياري",
        placeholder: "اكتب سبب الزيارة باختصار...",
        safetyText:
          "لا تُدخل تاريخاً طبياً. هذا الحقل للمعاينة ولا يقدم تشخيصاً أو نصيحة طبية.",
      },
      paymentLabel: "الدفع في العيادة",
      primaryReviewLabel: "نوع الموعد",
      primaryReviewSuffix: null,
      primaryTitle: "نوع الموعد",
      reference: "RZ-CLINIC-3072",
      reviewTitle: "راجع تفاصيل الموعد",
      secondaryReviewLabel: "الطبيب",
      secondaryTitle: "اختر الطبيب",
      times: [
        { id: "clinic-time-0930", label: "9:30 ص" },
        { id: "clinic-time-1100", label: "11:00 ص" },
        { id: "clinic-time-1230", label: "12:30 م" },
        { id: "clinic-time-1400", label: "2:00 م" },
        { id: "clinic-time-1630", label: "4:30 م" },
        { id: "clinic-time-1800", label: "6:00 م" },
      ],
    },
    category: "عيادة أسنان",
    ctaLabel: "احجز موعداً",
    description:
      "استشارات ومواعيد أسنان منظمة في الكرادة ضمن واجهة حجز تجريبية واضحة.",
    detailOptionsTitle: "أنواع المواعيد",
    distance: "3.1 كم",
    distanceKm: 3.1,
    features: ["مواعيد اليوم", "استشارة أولية", "فريق متخصص"],
    hours: "9:00 ص – 8:00 م",
    id: "preview-nearby-smile",
    locationSummary: "الكرادة · قرب ساحة التحريات",
    markerPosition: { x: 0.61, y: 0.72 },
    name: "Smile Studio Clinic",
    primaryOptions: [
      {
        duration: "30 دقيقة",
        id: "clinic-consultation",
        label: "استشارة أسنان",
        price: "15,000 د.ع",
        supportingText: null,
      },
      {
        duration: "45 دقيقة",
        id: "clinic-cleaning",
        label: "تنظيف الأسنان",
        price: "40,000 د.ع",
        supportingText: null,
      },
      {
        duration: "60 دقيقة",
        id: "clinic-whitening",
        label: "تبييض الأسنان",
        price: "120,000 د.ع",
        supportingText: null,
      },
      {
        duration: "20 دقيقة",
        id: "clinic-initial",
        label: "فحص أولي",
        price: "10,000 د.ع",
        supportingText: null,
      },
    ],
    rating: 4.7,
    reviewCount: 74,
    secondaryOptions: [
      {
        avatarInitials: "سأ",
        duration: null,
        id: "clinic-doctor-sara",
        label: "د. سارة أحمد",
        price: null,
        rating: 4.9,
        supportingText: "طبيبة أسنان",
      },
      {
        avatarInitials: "عخ",
        duration: null,
        id: "clinic-doctor-omar",
        label: "د. عمر خالد",
        price: null,
        rating: 4.8,
        supportingText: "طبيب أسنان",
      },
      {
        duration: null,
        id: "clinic-doctor-any",
        label: "أول طبيب متاح",
        price: null,
        supportingText: "أقرب موعد مناسب",
      },
    ],
    status: "متاح اليوم",
    vertical: "clinic",
  },
];

export const NEARBY_VISUAL_QA_USER_POSITION: NearbyVisualQaUserPosition = {
  x: 0.49,
  y: 0.55,
};
