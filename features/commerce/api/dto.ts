import { Prisma, type CustomerAddress } from "@prisma/client";

import { calculateCommerceTotals, decimalString } from "@/features/commerce/domain/money";
import type { CartApiRecord } from "@/features/commerce/services/cart-service";
import type { CustomerOrderRecord } from "@/features/commerce/services/customer-order-query-service";
import { safePublicImageUrlOrNull } from "@/lib/security/public-image-url";

export function serializeCustomerAddress(address: CustomerAddress) {
  return {
    additionalDetails: address.additionalDetails,
    area: address.area,
    city: address.city,
    createdAt: address.createdAt.toISOString(),
    id: address.id,
    isDefault: address.isDefault,
    landmark: address.landmark,
    latitude: address.latitude?.toString() ?? null,
    longitude: address.longitude?.toString() ?? null,
    phone: address.phone,
    recipientName: address.recipientName,
    street: address.street,
    updatedAt: address.updatedAt.toISOString(),
  };
}

export function serializeCart(cart: CartApiRecord | null) {
  if (!cart) return null;
  const lines = cart.items.map((item) => ({
    compareAtPrice: item.productVariant.compareAtPrice,
    quantity: item.quantity,
    unitPrice: item.productVariant.price,
  }));
  const totals = lines.length ? calculateCommerceTotals(lines, "0") : null;
  const storeAvailable =
    cart.store.status === "ACTIVE" && !cart.store.archivedAt && Boolean(cart.store.publishedAt);
  const items = cart.items.map((item) => {
    const variant = item.productVariant;
    const product = variant.product;
    const operationallyAvailable =
      storeAvailable &&
      variant.status === "ACTIVE" &&
      !variant.archivedAt &&
      product.status === "PUBLISHED" &&
      product.category.status === "ACTIVE" &&
      !product.archivedAt &&
      Boolean(product.publishedAt);
    const available = variant.inventory
      ? variant.inventory.onHand - variant.inventory.reserved
      : 0;
    return {
      cartItemId: item.id,
      compareAtPrice: variant.compareAtPrice ? decimalString(variant.compareAtPrice) : null,
      currency: "IQD" as const,
      inStock: available > 0,
      isAvailable: operationallyAvailable && available >= item.quantity,
      primaryMediaUrl: safePublicImageUrlOrNull(cart.mediaReferences.productPrimaryById[product.id]),
      priceChanged: !item.unitPriceSnapshot.equals(variant.price),
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      quantity: item.quantity,
      unitPrice: decimalString(variant.price),
      variantId: variant.id,
      variantOptionValues: variant.optionValues,
      variantTitle: variant.title,
    };
  });
  return {
    availability: items.every((item) => item.isAvailable),
    currency: "IQD" as const,
    id: cart.id,
    informationalDiscountTotal: totals?.discountTotal ?? "0.000",
    informationalSubtotal: totals?.subtotal ?? "0.000",
    items,
    store: {
      id: cart.store.id,
      logoUrl: safePublicImageUrlOrNull(cart.mediaReferences.storeLogoUrl),
      name: cart.store.name,
      slug: cart.store.slug,
    },
    totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
    updatedAt: cart.updatedAt.toISOString(),
    version: cart.version,
  };
}

type CheckoutReceiptRecord = {
  address: {
    additionalDetails: string;
    area: string;
    city: string;
    landmark: string | null;
    latitude: Prisma.Decimal | null;
    longitude: Prisma.Decimal | null;
    phone: string;
    recipientName: string;
    street: string;
  } | null;
  createdAt: Date;
  currency: string;
  deliveryFee: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  fulfillmentMethod: string;
  fulfillmentStatus: string;
  grandTotal: Prisma.Decimal;
  id: string;
  items: Array<{
    compareAtPrice: Prisma.Decimal | null;
    currency: string;
    imageUrlSnapshot: string | null;
    lineDiscount: Prisma.Decimal;
    lineSubtotal: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    optionValuesSnapshot: unknown;
    productId: string | null;
    productNameSnapshot: string;
    productVariantId: string | null;
    quantity: number;
    unitPrice: Prisma.Decimal;
    variantTitleSnapshot: string;
  }>;
  orderNumber: string;
  payment: { method: string; status: string } | null;
  paymentMethod: string;
  paymentStatus: string;
  reservationExpiresAt: Date;
  status: string;
  storeLogoUrlSnapshot: string | null;
  storeNameSnapshot: string;
  storeSlugSnapshot: string;
  subtotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
};

export function serializeCheckoutReceipt(order: CheckoutReceiptRecord) {
  return {
    address: order.address
      ? {
          additionalDetails: order.address.additionalDetails,
          area: order.address.area,
          city: order.address.city,
          landmark: order.address.landmark,
          latitude: order.address.latitude?.toString() ?? null,
          longitude: order.address.longitude?.toString() ?? null,
          phone: order.address.phone,
          recipientName: order.address.recipientName,
          street: order.address.street,
        }
      : null,
    createdAt: order.createdAt.toISOString(),
    currency: "IQD" as const,
    deliveryFee: decimalString(order.deliveryFee),
    discountTotal: decimalString(order.discountTotal),
    expiresAt: order.reservationExpiresAt.toISOString(),
    fulfillmentMethod: order.fulfillmentMethod,
    fulfillmentStatus: order.fulfillmentStatus,
    grandTotal: decimalString(order.grandTotal),
    id: order.id,
    items: order.items.map((item) => ({
      compareAtPrice: item.compareAtPrice ? decimalString(item.compareAtPrice) : null,
      currency: "IQD" as const,
      imageUrl: safePublicImageUrlOrNull(item.imageUrlSnapshot),
      lineDiscount: decimalString(item.lineDiscount),
      lineSubtotal: decimalString(item.lineSubtotal),
      lineTotal: decimalString(item.lineTotal),
      optionValues: item.optionValuesSnapshot,
      productId: item.productId,
      productName: item.productNameSnapshot,
      quantity: item.quantity,
      unitPrice: decimalString(item.unitPrice),
      variantId: item.productVariantId,
      variantTitle: item.variantTitleSnapshot,
    })),
    orderNumber: order.orderNumber,
    paymentMethod: order.payment?.method ?? order.paymentMethod,
    paymentStatus: order.payment?.status ?? order.paymentStatus,
    status: order.status,
    store: {
      logoUrl: safePublicImageUrlOrNull(order.storeLogoUrlSnapshot),
      name: order.storeNameSnapshot,
      slug: order.storeSlugSnapshot,
    },
    subtotal: decimalString(order.subtotal),
    taxTotal: decimalString(order.taxTotal),
  };
}

export function serializeMerchantInventory(item: {
  id: string;
  lowStockThreshold?: number | null;
  onHand: number;
  reserved: number;
  updatedAt: Date;
  version?: number;
  variant: {
    archivedAt: Date | null;
    id: string;
    optionValues: unknown;
    sku: string;
    status: string;
    title?: string;
    product: {
      archivedAt: Date | null;
      id: string;
      media?: Array<{ url: string }>;
      name: string;
      status: string;
    };
  };
}) {
  const availableQuantity = item.onHand - item.reserved;
  return {
    availableQuantity,
    inventoryItemId: item.id,
    lowStock: item.lowStockThreshold !== null && item.lowStockThreshold !== undefined
      ? availableQuantity <= item.lowStockThreshold
      : false,
    lowStockThreshold: item.lowStockThreshold ?? null,
    onHandQuantity: item.onHand,
    primaryMediaUrl: safePublicImageUrlOrNull(item.variant.product.media?.[0]?.url),
    product: {
      id: item.variant.product.id,
      name: item.variant.product.name,
      operationallyAvailable:
        item.variant.product.status === "PUBLISHED" && !item.variant.product.archivedAt,
    },
    reservedQuantity: item.reserved,
    updatedAt: item.updatedAt.toISOString(),
    variant: {
      id: item.variant.id,
      operationallyAvailable: item.variant.status === "ACTIVE" && !item.variant.archivedAt,
      optionValues: item.variant.optionValues,
      sku: item.variant.sku,
      title: item.variant.title ?? null,
    },
    version: item.version ?? null,
  };
}

export function serializeCustomerOrderSummary(order: CustomerOrderRecord) {
  const primaryItem = order.items[0];
  return {
    canCustomerCancel: canCustomerCancel(order),
    createdAt: order.createdAt.toISOString(),
    currency: order.currency,
    expiresAt: order.status === "PENDING" ? order.reservationExpiresAt.toISOString() : null,
    fulfillmentMethod: order.fulfillmentMethod,
    fulfillmentStatus: order.fulfillmentStatus,
    grandTotal: decimalString(order.grandTotal),
    id: order.id,
    orderNumber: order.orderNumber,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    primaryItem: primaryItem
      ? {
          imageUrl: safePublicImageUrlOrNull(primaryItem.imageUrlSnapshot),
          productName: primaryItem.productNameSnapshot,
          quantity: primaryItem.quantity,
          variantTitle: primaryItem.variantTitleSnapshot,
        }
      : null,
    status: order.status,
    store: {
      logoUrl: safePublicImageUrlOrNull(order.storeLogoUrlSnapshot),
      name: order.storeNameSnapshot,
      slug: order.storeSlugSnapshot,
    },
    totalItemQuantity: order.items.reduce((total, item) => total + item.quantity, 0),
  };
}

export function serializeCustomerOrderDetail(order: CustomerOrderRecord) {
  return {
    ...serializeCustomerOrderSummary(order),
    ...(canCustomerCancel(order) ? { expectedVersion: order.updatedAt.toISOString() } : {}),
    address: order.address
      ? {
          additionalDetails: order.address.additionalDetails,
          area: order.address.area,
          city: order.address.city,
          landmark: order.address.landmark,
          latitude: order.address.latitude?.toString() ?? null,
          longitude: order.address.longitude?.toString() ?? null,
          phone: order.address.phone,
          recipientName: order.address.recipientName,
          street: order.address.street,
        }
      : null,
    customerInstructions: order.customerInstructions,
    deliveryFee: decimalString(order.deliveryFee),
    discountTotal: decimalString(order.discountTotal),
    history: order.history.map((item) => ({
      actorType: item.actorType,
      createdAt: item.createdAt.toISOString(),
      newFulfillmentStatus: item.newFulfillmentStatus,
      newOrderStatus: item.newOrderStatus,
      newPaymentStatus: item.newPaymentStatus,
      previousFulfillmentStatus: item.previousFulfillmentStatus,
      previousOrderStatus: item.previousOrderStatus,
      previousPaymentStatus: item.previousPaymentStatus,
      reason: customerVisibleHistoryReason(item.actorType, item.reason),
    })),
    items: order.items.map((item) => ({
      compareAtPrice: item.compareAtPrice ? decimalString(item.compareAtPrice) : null,
      currency: item.currency,
      imageUrl: safePublicImageUrlOrNull(item.imageUrlSnapshot),
      lineDiscount: decimalString(item.lineDiscount),
      lineSubtotal: decimalString(item.lineSubtotal),
      lineTotal: decimalString(item.lineTotal),
      optionValues: item.optionValuesSnapshot,
      productName: item.productNameSnapshot,
      quantity: item.quantity,
      unitPrice: decimalString(item.unitPrice),
      variantTitle: item.variantTitleSnapshot,
    })),
    pickup: order.fulfillmentMethod === "CUSTOMER_PICKUP"
      ? {
          address: order.pickupAddressSnapshot,
          instructions: order.pickupInstructionsSnapshot,
        }
      : null,
    subtotal: decimalString(order.subtotal),
    taxTotal: decimalString(order.taxTotal),
  };
}

export function canCustomerCancel(order: {
  fulfillmentStatus: string;
  paymentStatus: string;
  status: string;
}) {
  return order.paymentStatus !== "PAID" && (
    order.status === "PENDING" ||
    (order.status === "CONFIRMED" && order.fulfillmentStatus === "UNFULFILLED")
  );
}

function customerVisibleHistoryReason(actorType: string, reason: string | null) {
  if (!reason) return null;
  if (actorType === "CUSTOMER") return reason;
  if (actorType === "SYSTEM" && reason === "PENDING_RESERVATION_EXPIRED") {
    return "PENDING_RESERVATION_EXPIRED";
  }
  return null;
}
