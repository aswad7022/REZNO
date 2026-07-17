import type { LanguageCode } from "@prisma/client";

export type StoreNotificationEvent =
  | "store.submitted"
  | "store.approved"
  | "store.rejected"
  | "store.suspended"
  | "store.reactivated";

const COPY: Record<StoreNotificationEvent, Record<"AR" | "EN" | "KU", { body: string; title: string }>> = {
  "store.submitted": {
    AR: { title: "متجر بانتظار المراجعة", body: "تم إرسال متجر جديد لمراجعة فريق المنصة." },
    EN: { title: "Store awaiting review", body: "A Store was submitted for platform review." },
    KU: { title: "فرۆشگا چاوەڕێی پێداچوونەوەیە", body: "فرۆشگایەک بۆ پێداچوونەوەی پلاتفۆرم نێردرا." },
  },
  "store.approved": {
    AR: { title: "تم اعتماد المتجر", body: "أصبح متجرك نشطًا ومتاحًا في السوق." },
    EN: { title: "Store approved", body: "Your Store is active and available in the Marketplace." },
    KU: { title: "فرۆشگا پەسەندکرا", body: "فرۆشگاکەت چالاکە و لە بازاڕدا بەردەستە." },
  },
  "store.rejected": {
    AR: { title: "يحتاج المتجر إلى تعديلات", body: "راجع ملاحظات المتجر وصحح البيانات ثم أعد الإرسال." },
    EN: { title: "Store changes required", body: "Review the Store feedback, correct the details and resubmit." },
    KU: { title: "فرۆشگا پێویستی بە گۆڕانکاری هەیە", body: "تێبینییەکان بپشکنە و دووبارە بینێرەوە." },
  },
  "store.suspended": {
    AR: { title: "تم تعليق المتجر", body: "المتجر غير ظاهر حاليًا للعملاء. راجع حالة المتجر." },
    EN: { title: "Store suspended", body: "The Store is currently hidden from customers. Review its status." },
    KU: { title: "فرۆشگا ڕاگیرا", body: "فرۆشگا لە کڕیاران شاردراوەتەوە. دۆخەکەی بپشکنە." },
  },
  "store.reactivated": {
    AR: { title: "تمت إعادة تفعيل المتجر", body: "عاد المتجر إلى الظهور للعملاء." },
    EN: { title: "Store reactivated", body: "The Store is visible to customers again." },
    KU: { title: "فرۆشگا دووبارە چالاککرایەوە", body: "فرۆشگا دووبارە بۆ کڕیاران دیارە." },
  },
};

export function storeNotificationCopy(event: StoreNotificationEvent, language: LanguageCode) {
  return COPY[event][language === "AR" ? "AR" : language === "KU" ? "KU" : "EN"];
}

export function storeNotificationEventKey(input: {
  event: StoreNotificationEvent;
  recipientPersonId: string;
  resultVersion: Date;
  storeId: string;
}) {
  return `commerce:store:${input.storeId}:${input.event}:${input.resultVersion.toISOString()}:${input.recipientPersonId}`;
}
