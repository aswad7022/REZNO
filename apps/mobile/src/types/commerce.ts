export type CommerceCurrency = "IQD";

export type CommercePageInfo = {
  hasNextPage: boolean;
  nextCursor: string | null;
};

export type CommerceCollection<T> = {
  data: T[];
  pageInfo: CommercePageInfo;
};

export type CommerceNotification = {
  body: string;
  createdAt: string;
  id: string;
  orderId: string | null;
  priority: "IMPORTANT" | "NORMAL";
  title: string;
};

export type CommerceData<T> = { data: T };

export type CommerceCategory = {
  displayOrder: number;
  id: string;
  name: string;
  slug: string;
};

export type CommerceStore = {
  coverImageUrl: string | null;
  currency: CommerceCurrency;
  delivery: {
    area: string | null;
    city: string | null;
    enabled: boolean;
    estimateMinutes: number | null;
    fee: string;
  };
  description: string | null;
  id: string;
  logoUrl: string | null;
  minimumOrderValue: string;
  name: string;
  pickup: {
    area: string | null;
    city: string | null;
    enabled: boolean;
    instructions: string | null;
  };
  preparationEstimateMinutes: number | null;
  slug: string;
};

export type CommerceProduct = {
  category: CommerceCategory;
  currency: CommerceCurrency;
  description: string | null;
  highestPrice: string | null;
  id: string;
  inStock: boolean;
  lowestPrice: string;
  name: string;
  primaryMediaUrl: string | null;
  productSlug: string;
  slug: string;
  store: CommerceStore;
  storeSlug: string;
};

export type CommerceVariant = {
  compareAtPrice: string | null;
  currency: CommerceCurrency;
  id: string;
  inStock: boolean;
  isDefault: boolean;
  optionValues: unknown;
  price: string;
  title: string;
};

export type CommerceProductDetail = CommerceProduct & {
  media: Array<{
    altText: string | null;
    id: string;
    mediaType: "IMAGE" | "VIDEO";
    sortOrder: number;
    url: string;
  }>;
  variants: CommerceVariant[];
};

export type CommerceCartItem = {
  cartItemId: string;
  compareAtPrice: string | null;
  currency: CommerceCurrency;
  inStock: boolean;
  isAvailable: boolean;
  primaryMediaUrl: string | null;
  priceChanged: boolean;
  productId: string;
  productName: string;
  productSlug: string;
  quantity: number;
  unitPrice: string;
  variantId: string;
  variantOptionValues: unknown;
  variantTitle: string;
};

export type CommerceCart = {
  availability: boolean;
  currency: CommerceCurrency;
  id: string;
  informationalDiscountTotal: string;
  informationalSubtotal: string;
  items: CommerceCartItem[];
  store: { id: string; logoUrl: string | null; name: string; slug: string };
  totalQuantity: number;
  updatedAt: string;
  version: number;
};

export type CommerceAddress = {
  additionalDetails: string;
  area: string;
  city: string;
  createdAt: string;
  id: string;
  isDefault: boolean;
  landmark: string | null;
  latitude: string | null;
  longitude: string | null;
  phone: string;
  recipientName: string;
  street: string;
  updatedAt: string;
};

export type CommerceAddressInput = {
  additionalDetails: string;
  area: string;
  city: string;
  isDefault?: boolean;
  landmark?: string | null;
  phone: string;
  recipientName: string;
  street: string;
};

export type FulfillmentMethod = "CUSTOMER_PICKUP" | "STORE_DELIVERY";

export type CommerceReceiptItem = {
  compareAtPrice: string | null;
  currency: CommerceCurrency;
  imageUrl: string | null;
  lineDiscount: string;
  lineSubtotal: string;
  lineTotal: string;
  optionValues: unknown;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: string;
  variantId: string | null;
  variantTitle: string;
};

export type CommerceReceipt = {
  address: Omit<CommerceAddress, "createdAt" | "id" | "isDefault" | "updatedAt"> | null;
  createdAt: string;
  currency: CommerceCurrency;
  deliveryFee: string;
  discountTotal: string;
  expiresAt: string;
  fulfillmentMethod: FulfillmentMethod;
  fulfillmentStatus: string;
  grandTotal: string;
  id: string;
  items: CommerceReceiptItem[];
  orderNumber: string;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  store: { logoUrl: string | null; name: string; slug: string };
  subtotal: string;
  taxTotal: string;
};

export type CommerceOrderSummary = {
  canCustomerCancel: boolean;
  createdAt: string;
  currency: string;
  expiresAt: string | null;
  fulfillmentMethod: FulfillmentMethod;
  fulfillmentStatus: string;
  grandTotal: string;
  id: string;
  orderNumber: string;
  paymentMethod: string;
  paymentStatus: string;
  primaryItem: {
    imageUrl: string | null;
    productName: string;
    quantity: number;
    variantTitle: string;
  } | null;
  status: string;
  store: { logoUrl: string | null; name: string; slug: string };
  totalItemQuantity: number;
};

export type CommerceOrderDetail = CommerceOrderSummary & {
  address: Omit<CommerceAddress, "createdAt" | "id" | "isDefault" | "updatedAt"> | null;
  customerInstructions: string | null;
  deliveryFee: string;
  discountTotal: string;
  expectedVersion?: string;
  history: Array<{
    actorType: string;
    createdAt: string;
    newFulfillmentStatus: string | null;
    newOrderStatus: string | null;
    newPaymentStatus: string | null;
    previousFulfillmentStatus: string | null;
    previousOrderStatus: string | null;
    previousPaymentStatus: string | null;
    reason: string | null;
  }>;
  items: CommerceReceiptItem[];
  pickup: { address: string | null; instructions: string | null } | null;
  subtotal: string;
  taxTotal: string;
};

export type FavoriteStore = {
  favoritedAt: string;
  favoriteId: string;
  store: CommerceStore;
};

export type FavoriteProduct = {
  favoritedAt: string;
  favoriteId: string;
  product: CommerceProduct;
};
