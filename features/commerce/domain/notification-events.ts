import type { LanguageCode } from "@prisma/client";
import type { AppLocale } from "@/i18n/config";

export type CommerceNotificationEvent =
  | "order.created"
  | "order.confirmed"
  | "order.rejected"
  | "order.preparing"
  | "order.ready_for_pickup"
  | "order.out_for_delivery"
  | "order.delivery_failed"
  | "order.delivered"
  | "order.picked_up"
  | "order.cancelled"
  | "order.expired"
  | "order.new"
  | "order.customer_cancelled"
  | "order.admin_cancelled";

type CommerceNotificationLocale = "AR" | "EN" | "KU";

export function notificationLanguageCodeFromUiLocale(locale: AppLocale): LanguageCode {
  if (locale === "ar") return "AR";
  if (locale === "ckb") return "KU";
  return "EN";
}

export function notificationLocaleFromLanguageCode(
  language: LanguageCode | null | undefined,
): CommerceNotificationLocale {
  if (language === "AR") return "AR";
  if (language === "KU") return "KU";
  return "EN";
}

const COPY: Record<CommerceNotificationEvent, Record<CommerceNotificationLocale, {
  body: (orderNumber: string, storeName: string) => string;
  bodyKey: string;
  title: string;
  titleKey: string;
}>> = {
  "order.admin_cancelled": localized(
    "إلغاء إداري للطلب",
    "Order administratively cancelled",
    "داواکاری بە بەڕێوەبەرایەتی هەڵوەشێنرایەوە",
    (number) => `تم إلغاء الطلب ${number} إداريًا بعد مراجعة تشغيلية.`,
    (number) => `Order ${number} was administratively cancelled after an operational review.`,
    (number) => `داواکاری ${number} دوای پێداچوونەوەی کارگێڕی بە بەڕێوەبەرایەتی هەڵوەشێنرایەوە.`,
  ),
  "order.cancelled": localized(
    "تم إلغاء الطلب",
    "Order cancelled",
    "داواکاری هەڵوەشێنرایەوە",
    (number, store) => `تم إلغاء الطلب ${number} من ${store}.`,
    (number, store) => `Order ${number} from ${store} was cancelled.`,
    (number, store) => `داواکاری ${number} لە ${store} هەڵوەشێنرایەوە.`,
  ),
  "order.confirmed": localized(
    "تم تأكيد الطلب",
    "Order confirmed",
    "داواکاری پشتڕاستکرایەوە",
    (number, store) => `أكد ${store} الطلب ${number}.`,
    (number, store) => `${store} confirmed order ${number}.`,
    (number, store) => `${store} داواکاری ${number} پشتڕاستکردەوە.`,
  ),
  "order.created": localized(
    "تم استلام طلبك",
    "Order received",
    "داواکاری وەرگیرا",
    (number, store) => `تم إنشاء الطلب ${number} لدى ${store}.`,
    (number, store) => `Order ${number} was created with ${store}.`,
    (number, store) => `داواکاری ${number} لە ${store} دروستکرا.`,
  ),
  "order.customer_cancelled": localized(
    "ألغى العميل الطلب",
    "Customer cancelled order",
    "کڕیار داواکارییەکەی هەڵوەشاندەوە",
    (number) => `ألغى العميل الطلب ${number}.`,
    (number) => `The customer cancelled order ${number}.`,
    (number) => `کڕیار داواکاری ${number} هەڵوەشاندەوە.`,
  ),
  "order.delivered": localized(
    "تم توصيل الطلب",
    "Order delivered",
    "داواکاری گەیەندرا",
    (number) => `تم توصيل الطلب ${number}.`,
    (number) => `Order ${number} was delivered.`,
    (number) => `داواکاری ${number} گەیەندرا.`,
  ),
  "order.delivery_failed": localized(
    "تعذر تسليم الطلب",
    "Delivery needs attention",
    "گەیاندنی داواکاری سەرکەوتوو نەبوو",
    (number) => `تعذر تسليم الطلب ${number} وسيُعاد التواصل عند المحاولة التالية.`,
    (number) => `Delivery failed for order ${number}; the next attempt will be communicated.`,
    (number) => `گەیاندنی داواکاری ${number} سەرکەوتوو نەبوو؛ هەوڵی داهاتوو ڕادەگەیەنرێت.`,
  ),
  "order.expired": localized(
    "انتهت مهلة الطلب",
    "Order expired",
    "کاتی داواکاری کۆتایی هات",
    (number) => `انتهت مهلة تأكيد الطلب ${number}.`,
    (number) => `The confirmation window for order ${number} expired.`,
    (number) => `کاتی پشتڕاستکردنەوەی داواکاری ${number} کۆتایی هات.`,
  ),
  "order.new": localized(
    "طلب جديد",
    "New order",
    "داواکاری نوێ",
    (number) => `تم استلام الطلب الجديد ${number}.`,
    (number) => `New order ${number} was received.`,
    (number) => `داواکاری نوێی ${number} وەرگیرا.`,
  ),
  "order.out_for_delivery": localized(
    "الطلب في الطريق",
    "Order is on the way",
    "داواکاری لە ڕێگادایە",
    (number) => `الطلب ${number} في طريقه إليك.`,
    (number) => `Order ${number} is on the way.`,
    (number) => `داواکاری ${number} لە ڕێگادایە.`,
  ),
  "order.picked_up": localized(
    "تم استلام الطلب",
    "Order picked up",
    "داواکاری وەرگیرا",
    (number) => `تم استلام الطلب ${number} وإكماله.`,
    (number) => `Order ${number} was picked up and completed.`,
    (number) => `داواکاری ${number} وەرگیرا و تەواو کرا.`,
  ),
  "order.preparing": localized(
    "جارٍ تجهيز الطلب",
    "Order is being prepared",
    "داواکاری ئامادە دەکرێت",
    (number) => `بدأ تجهيز الطلب ${number}.`,
    (number) => `Preparation started for order ${number}.`,
    (number) => `ئامادەکردنی داواکاری ${number} دەستی پێکرد.`,
  ),
  "order.ready_for_pickup": localized(
    "الطلب جاهز للاستلام",
    "Order ready for pickup",
    "داواکاری ئامادەی وەرگرتنە",
    (number) => `الطلب ${number} جاهز للاستلام.`,
    (number) => `Order ${number} is ready for pickup.`,
    (number) => `داواکاری ${number} ئامادەی وەرگرتنە.`,
  ),
  "order.rejected": localized(
    "تعذر قبول الطلب",
    "Order not accepted",
    "داواکاری پەسەند نەکرا",
    (number, store) => `تعذر على ${store} قبول الطلب ${number}.`,
    (number, store) => `${store} could not accept order ${number}.`,
    (number, store) => `${store} نەیتوانی داواکاری ${number} پەسەند بکات.`,
  ),
};

export function commerceNotificationCopy(
  event: CommerceNotificationEvent,
  language: LanguageCode | null | undefined,
  orderNumber: string,
  storeName: string,
) {
  const locale = notificationLocaleFromLanguageCode(language);
  const value = COPY[event][locale];
  return {
    body: value.body(orderNumber, storeName),
    bodyKey: `commerce.${event}.body`,
    title: value.title,
    titleKey: `commerce.${event}.title`,
  };
}

export function commerceNotificationTranslations(event: CommerceNotificationEvent) {
  return COPY[event];
}

function localized(
  arTitle: string,
  enTitle: string,
  kuTitle: string,
  arBody: (orderNumber: string, storeName: string) => string,
  enBody: (orderNumber: string, storeName: string) => string,
  kuBody: (orderNumber: string, storeName: string) => string,
) {
  return {
    AR: { body: arBody, bodyKey: "commerce.order.body", title: arTitle, titleKey: "commerce.order.title" },
    EN: { body: enBody, bodyKey: "commerce.order.body", title: enTitle, titleKey: "commerce.order.title" },
    KU: { body: kuBody, bodyKey: "commerce.order.body", title: kuTitle, titleKey: "commerce.order.title" },
  };
}
