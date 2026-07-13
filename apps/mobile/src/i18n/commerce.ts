import type { MobileLocale } from "./labels";

export type CommerceCopy = {
  addAddress: string;
  addToCart: string;
  address: string;
  addressDetails: string;
  addressRequired: string;
  addresses: string;
  all: string;
  area: string;
  back: string;
  cancel: string;
  cancelOrder: string;
  cancelReason: string;
  cashOnDelivery: string;
  cart: string;
  cartEmpty: string;
  cartUnavailable: string;
  categories: string;
  checkout: string;
  checkoutHint: string;
  city: string;
  clear: string;
  clearCart: string;
  confirm: string;
  continueShopping: string;
  createAddress: string;
  customerInstructions: string;
  delivery: string;
  deliveryFee: string;
  emptyBody: string;
  emptyTitle: string;
  errorGeneric: string;
  decreaseQuantity: string;
  favoriteProducts: string;
  favoriteStores: string;
  favorites: string;
  fulfillment: string;
  inStock: string;
  increaseQuantity: string;
  keepCart: string;
  landmark: string;
  loadMore: string;
  loading: string;
  market: string;
  minimumOrder: string;
  nameAsc: string;
  newest: string;
  noResults: string;
  noNotifications: string;
  notifications: string;
  notAvailable: string;
  order: string;
  orderCancelled: string;
  orderHistory: string;
  orderItems: string;
  orderNumber: string;
  orders: string;
  outOfStock: string;
  payAtPickup: string;
  payment: string;
  phone: string;
  pickup: string;
  priceAsc: string;
  priceDesc: string;
  product: string;
  products: string;
  quantity: string;
  rateLimited: string;
  receipt: string;
  recipientName: string;
  remove: string;
  replaceCart: string;
  replaceCartBody: string;
  retry: string;
  save: string;
  search: string;
  selectAddress: string;
  selectVariant: string;
  sessionRequired: string;
  setDefault: string;
  status: string;
  store: string;
  stores: string;
  street: string;
  subtotal: string;
  successBody: string;
  successTitle: string;
  total: string;
  unavailableBody: string;
  updateAddress: string;
  variant: string;
  viewOrder: string;
};

export const commerceCopy: Record<MobileLocale, CommerceCopy> = {
  ar: {
    addAddress: "إضافة عنوان", addToCart: "أضف إلى السلة", address: "العنوان",
    addressDetails: "تفاصيل إضافية", addressRequired: "اختر عنوان توصيل صالحاً.", addresses: "عناويني",
    all: "الكل", area: "المنطقة", back: "رجوع", cancel: "إلغاء", cancelOrder: "إلغاء الطلب",
    cancelReason: "سبب الإلغاء", cashOnDelivery: "الدفع نقداً عند التوصيل", cart: "السلة", cartEmpty: "سلتك فارغة حالياً.",
    cartUnavailable: "توجد عناصر غير متاحة. حدّث السلة قبل المتابعة.", categories: "التصنيفات",
    checkout: "إتمام الطلب", checkoutHint: "يُنشئ طلباً حقيقياً بعد تأكيد الخادم.", city: "المدينة",
    clear: "مسح", clearCart: "إفراغ السلة", confirm: "تأكيد", continueShopping: "متابعة التسوق",
    createAddress: "حفظ عنوان جديد", customerInstructions: "تعليمات اختيارية للطلب", delivery: "توصيل المتجر",
    deliveryFee: "رسوم التوصيل", decreaseQuantity: "تقليل الكمية", emptyBody: "لا توجد بيانات حقيقية مطابقة حالياً.", emptyTitle: "لا توجد نتائج",
    errorGeneric: "تعذر تحميل البيانات بأمان.", favoriteProducts: "المنتجات المفضلة",
    favoriteStores: "المتاجر المفضلة", favorites: "المفضلة", fulfillment: "طريقة الاستلام",
    inStock: "المتاح فقط", increaseQuantity: "زيادة الكمية", keepCart: "الاحتفاظ بالسلة الحالية", landmark: "علامة مميزة (اختياري)",
    loadMore: "تحميل المزيد", loading: "جارٍ تحميل البيانات الحقيقية...", market: "السوق",
    minimumOrder: "الحد الأدنى للطلب", nameAsc: "الاسم", newest: "الأحدث", noResults: "لا توجد نتائج للبحث.",
    noNotifications: "لا توجد إشعارات حقيقية حالياً.", notifications: "إشعارات الطلبات",
    notAvailable: "غير متاح", order: "الطلب", orderCancelled: "تم إلغاء الطلب.", orderHistory: "سجل الحالة",
    orderItems: "عناصر الطلب", orderNumber: "رقم الطلب", orders: "طلباتي", outOfStock: "نفد المخزون",
    payAtPickup: "الدفع عند الاستلام", payment: "الدفع", phone: "رقم الهاتف", pickup: "استلام من المتجر",
    priceAsc: "السعر: الأقل", priceDesc: "السعر: الأعلى", product: "منتج", products: "المنتجات",
    quantity: "الكمية", rateLimited: "طلبات كثيرة. انتظر قليلاً ثم أعد المحاولة.", receipt: "إيصال الطلب",
    recipientName: "اسم المستلم", remove: "إزالة", replaceCart: "استبدال السلة",
    replaceCartBody: "تحتوي سلتك على منتجات من متجر آخر. استبدالها سيزيل السلة الحالية دفعة واحدة.",
    retry: "إعادة المحاولة", save: "حفظ", search: "ابحث عن منتج أو متجر", selectAddress: "اختر عنواناً",
    selectVariant: "اختر النوع", sessionRequired: "سجّل الدخول للمتابعة في السلة والطلبات والمفضلة.",
    setDefault: "تعيين افتراضي", status: "الحالة", store: "متجر", stores: "المتاجر", street: "الشارع",
    subtotal: "المجموع المبدئي", successBody: "استلم الخادم طلبك الحقيقي بنجاح.", successTitle: "تم إنشاء الطلب",
    total: "الإجمالي", unavailableBody: "قد يكون المتجر أو المنتج مخفياً أو غير متاح.",
    updateAddress: "تحديث العنوان", variant: "النوع", viewOrder: "عرض الطلب",
  },
  ckb: {
    addAddress: "ناونیشان زیاد بکە", addToCart: "زیادکردن بۆ سەبەتە", address: "ناونیشان",
    addressDetails: "وردەکاری زیاتر", addressRequired: "ناونیشانێکی گونجاو هەڵبژێرە.", addresses: "ناونیشانەکانم",
    all: "هەموو", area: "ناوچە", back: "گەڕانەوە", cancel: "هەڵوەشاندنەوە", cancelOrder: "هەڵوەشاندنەوەی داواکاری",
    cancelReason: "هۆکاری هەڵوەشاندنەوە", cashOnDelivery: "پارەدانی نەقدی لە گەیاندن", cart: "سەبەتە", cartEmpty: "سەبەتەکەت بەتاڵە.",
    cartUnavailable: "هەندێک بەرهەم بەردەست نین.", categories: "پۆلەکان", checkout: "تەواوکردنی داواکاری",
    checkoutHint: "دوای پشتڕاستکردنەوەی ڕاژەکار داواکاری ڕاستەقینە دروست دەکات.", city: "شار",
    clear: "پاککردنەوە", clearCart: "بەتاڵکردنی سەبەتە", confirm: "پشتڕاستکردنەوە",
    continueShopping: "بەردەوامبوون لە کڕین", createAddress: "ناونیشانی نوێ پاشەکەوت بکە",
    customerInstructions: "ڕێنمایی ئارەزوومەندانە", delivery: "گەیاندنی فرۆشگا", deliveryFee: "کرێی گەیاندن", decreaseQuantity: "کەمکردنەوەی ژمارە",
    emptyBody: "ئێستا داتای ڕاستەقینەی هاوتا نییە.", emptyTitle: "هیچ ئەنجامێک نییە",
    errorGeneric: "بارکردنی داتا سەرکەوتوو نەبوو.", favoriteProducts: "بەرهەمە دڵخوازەکان",
    favoriteStores: "فرۆشگا دڵخوازەکان", favorites: "دڵخوازەکان", fulfillment: "شێوازی وەرگرتن",
    inStock: "تەنها بەردەست", increaseQuantity: "زیادکردنی ژمارە", keepCart: "سەبەتەی ئێستا بهێڵەوە", landmark: "نیشانەی دیار (ئارەزوومەندانە)",
    loadMore: "زیاتر بار بکە", loading: "داتای ڕاستەقینە بار دەکرێت...", market: "بازاڕ",
    minimumOrder: "کەمترین داواکاری", nameAsc: "ناو", newest: "نوێترین", noResults: "هیچ ئەنجامێک نەدۆزرایەوە.",
    noNotifications: "ئێستا هیچ ئاگادارکردنەوەیەکی ڕاستەقینە نییە.", notifications: "ئاگادارکردنەوەکانی داواکاری",
    notAvailable: "بەردەست نییە", order: "داواکاری", orderCancelled: "داواکاری هەڵوەشێنرایەوە.",
    orderHistory: "مێژووی دۆخ", orderItems: "بەرهەمەکانی داواکاری", orderNumber: "ژمارەی داواکاری",
    orders: "داواکارییەکانم", outOfStock: "کۆگا بەتاڵە", payAtPickup: "پارەدان لە وەرگرتن",
    payment: "پارەدان", phone: "ژمارەی تەلەفۆن", pickup: "وەرگرتن لە فرۆشگا", priceAsc: "نرخی کەمتر",
    priceDesc: "نرخی زیاتر", product: "بەرهەم", products: "بەرهەمەکان", quantity: "ژمارە",
    rateLimited: "داواکاری زۆرە. کەمێک چاوەڕێ بکە.", receipt: "وەسڵی داواکاری", recipientName: "ناوی وەرگر",
    remove: "لابردن", replaceCart: "گۆڕینی سەبەتە", replaceCartBody: "سەبەتەکەت بەرهەمی فرۆشگایەکی تر هەیە.",
    retry: "دووبارە هەوڵبدە", save: "پاشەکەوت", search: "بگەڕێ بۆ بەرهەم یان فرۆشگا",
    selectAddress: "ناونیشان هەڵبژێرە", selectVariant: "جۆر هەڵبژێرە",
    sessionRequired: "بۆ سەبەتە و داواکارییەکان بچۆ ژوورەوە.", setDefault: "بیکە بنەڕەت",
    status: "دۆخ", store: "فرۆشگا", stores: "فرۆشگاکان", street: "شەقام", subtotal: "کۆی سەرەتایی",
    successBody: "ڕاژەکار داواکاری ڕاستەقینەکەت وەرگرت.", successTitle: "داواکاری دروستکرا",
    total: "کۆی گشتی", unavailableBody: "لەوانەیە فرۆشگا یان بەرهەم بەردەست نەبێت.",
    updateAddress: "نوێکردنەوەی ناونیشان", variant: "جۆر", viewOrder: "داواکاری ببینە",
  },
  en: {
    addAddress: "Add address", addToCart: "Add to cart", address: "Address", addressDetails: "Additional details",
    addressRequired: "Select a valid delivery address.", addresses: "My addresses", all: "All", area: "Area",
    back: "Back", cancel: "Cancel", cancelOrder: "Cancel order", cancelReason: "Cancellation reason", cashOnDelivery: "Cash on delivery",
    cart: "Cart", cartEmpty: "Your cart is empty.", cartUnavailable: "Some items are unavailable. Refresh before continuing.",
    categories: "Categories", checkout: "Checkout", checkoutHint: "Creates a real order only after server confirmation.",
    city: "City", clear: "Clear", clearCart: "Clear cart", confirm: "Confirm", continueShopping: "Continue shopping",
    createAddress: "Save new address", customerInstructions: "Optional order instructions", delivery: "Store delivery",
    deliveryFee: "Delivery fee", decreaseQuantity: "Decrease quantity", emptyBody: "There is no matching real data yet.", emptyTitle: "No results",
    errorGeneric: "Could not load data safely.", favoriteProducts: "Favorite products", favoriteStores: "Favorite stores",
    favorites: "Favorites", fulfillment: "Fulfillment", inStock: "In stock only", increaseQuantity: "Increase quantity", keepCart: "Keep current cart",
    landmark: "Landmark (optional)", loadMore: "Load more", loading: "Loading real data...", market: "Market",
    minimumOrder: "Minimum order", nameAsc: "Name", newest: "Newest", noResults: "No search results.",
    noNotifications: "There are no real notifications yet.", notifications: "Order notifications",
    notAvailable: "Unavailable", order: "Order", orderCancelled: "Order cancelled.", orderHistory: "Status history",
    orderItems: "Order items", orderNumber: "Order number", orders: "My orders", outOfStock: "Out of stock",
    payAtPickup: "Pay at pickup", payment: "Payment", phone: "Phone", pickup: "Customer pickup",
    priceAsc: "Price: low", priceDesc: "Price: high", product: "Product", products: "Products", quantity: "Quantity",
    rateLimited: "Too many requests. Wait briefly and retry.", receipt: "Order receipt", recipientName: "Recipient name",
    remove: "Remove", replaceCart: "Replace cart", replaceCartBody: "Your cart contains products from another store. Replacing it removes the current cart atomically.",
    retry: "Retry", save: "Save", search: "Search products or stores", selectAddress: "Select address",
    selectVariant: "Select variant", sessionRequired: "Sign in to use cart, orders, and favorites.",
    setDefault: "Set default", status: "Status", store: "Store", stores: "Stores", street: "Street",
    subtotal: "Informational subtotal", successBody: "The server accepted your real order.", successTitle: "Order created",
    total: "Total", unavailableBody: "The store or product may be hidden or unavailable.", updateAddress: "Update address",
    variant: "Variant", viewOrder: "View order",
  },
};

export function formatCommerceMoney(value: string, currency: string, locale: MobileLocale) {
  const [whole = "0", fraction = ""] = value.split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const digits = sign ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, locale === "en" ? "," : "٬");
  const meaningfulFraction = fraction.replace(/0+$/, "");
  const amount = `${sign}${grouped}${meaningfulFraction ? `.${meaningfulFraction}` : ""}`;
  return locale === "en" ? `${amount} ${currency}` : `${amount} د.ع`;
}

export function formatCommerceDate(value: string, locale: MobileLocale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale === "ckb" ? "ckb-IQ" : locale === "ar" ? "ar-IQ" : "en-IQ", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const STATUS_LABELS: Record<MobileLocale, Record<string, string>> = {
  ar: {
    CANCELLED: "ملغى", COMPLETED: "مكتمل", CONFIRMED: "مؤكد", CUSTOMER_PICKUP: "استلام من المتجر",
    DELIVERED: "تم التوصيل", EXPIRED: "منتهي", OUT_FOR_DELIVERY: "قيد التوصيل", PAID: "مدفوع",
    PAY_AT_PICKUP: "الدفع عند الاستلام", PENDING: "قيد التأكيد", PICKED_UP: "تم الاستلام",
    PREPARING: "قيد التجهيز", READY_FOR_PICKUP: "جاهز للاستلام", REJECTED: "مرفوض",
    STORE_DELIVERY: "توصيل المتجر", UNFULFILLED: "بانتظار التجهيز", UNPAID: "غير مدفوع", VOIDED: "ملغى",
  },
  ckb: {
    CANCELLED: "هەڵوەشێنراوە", COMPLETED: "تەواو", CONFIRMED: "پشتڕاستکراوە", CUSTOMER_PICKUP: "وەرگرتن لە فرۆشگا",
    DELIVERED: "گەیەندرا", EXPIRED: "کاتی بەسەرچوو", OUT_FOR_DELIVERY: "لە ڕێگادایە", PAID: "پارەدراوە",
    PAY_AT_PICKUP: "پارەدان لە وەرگرتن", PENDING: "چاوەڕوانی پشتڕاستکردنەوە", PICKED_UP: "وەرگیرا",
    PREPARING: "ئامادە دەکرێت", READY_FOR_PICKUP: "ئامادەی وەرگرتنە", REJECTED: "ڕەتکراوە",
    STORE_DELIVERY: "گەیاندنی فرۆشگا", UNFULFILLED: "چاوەڕوانی ئامادەکردن", UNPAID: "پارە نەدراوە", VOIDED: "هەڵوەشێنراوە",
  },
  en: {
    CANCELLED: "Cancelled", COMPLETED: "Completed", CONFIRMED: "Confirmed", CUSTOMER_PICKUP: "Customer pickup",
    DELIVERED: "Delivered", EXPIRED: "Expired", OUT_FOR_DELIVERY: "Out for delivery", PAID: "Paid",
    PAY_AT_PICKUP: "Pay at pickup", PENDING: "Pending confirmation", PICKED_UP: "Picked up",
    PREPARING: "Preparing", READY_FOR_PICKUP: "Ready for pickup", REJECTED: "Rejected",
    STORE_DELIVERY: "Store delivery", UNFULFILLED: "Awaiting preparation", UNPAID: "Unpaid", VOIDED: "Voided",
  },
};

export function commerceStatusLabel(value: string, locale: MobileLocale) {
  return STATUS_LABELS[locale][value] ?? value.replaceAll("_", " ").toLocaleLowerCase();
}

export function commercePaymentMethodLabel(value: string, copy: CommerceCopy) {
  if (value === "CASH_ON_DELIVERY") return copy.cashOnDelivery;
  if (value === "PAY_AT_PICKUP") return copy.payAtPickup;
  return value.replaceAll("_", " ").toLocaleLowerCase();
}
