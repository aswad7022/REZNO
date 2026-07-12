import type { LanguageCode } from "@prisma/client";
import type { AppLocale } from "@/i18n/config";

export type CommerceNotificationEvent =
  | "order.created"
  | "order.confirmed"
  | "order.rejected"
  | "order.preparing"
  | "order.ready_for_pickup"
  | "order.out_for_delivery"
  | "order.delivered"
  | "order.cancelled"
  | "order.expired"
  | "order.new"
  | "order.customer_cancelled";

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
