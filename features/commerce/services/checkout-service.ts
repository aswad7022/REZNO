import { randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { normalizeCommerceText } from "@/features/commerce/domain/catalog";
import { assertCartVersion } from "@/features/commerce/domain/cart";
import { commerceError } from "@/features/commerce/domain/errors";
import {
  hashCheckoutRequest,
  resolveIdempotency,
} from "@/features/commerce/domain/idempotency";
import {
  assertCommercePersistenceAmount,
  calculateCommerceTotals,
  COMMERCE_CURRENCY,
  type CommerceOrderTotals,
} from "@/features/commerce/domain/money";
import {
  reservationExpiresAt,
  stockMovementKey,
} from "@/features/commerce/domain/inventory";
import { requireActiveCommerceCustomer } from "@/features/commerce/services/authorization";
import { notifyCheckoutCreated } from "@/features/commerce/services/commerce-notification-service";
import {
  lockInventoryItems,
  runCommerceSerializable,
} from "@/features/commerce/services/transaction";
import { prisma } from "@/lib/db/prisma";
import { safePublicImageUrlOrNull } from "@/lib/security/public-image-url";

export interface CreatePendingOrderInput {
  addressId?: string | null;
  cartId: string;
  cartVersion: number;
  customerId: string;
  customerInstructions?: string | null;
  fulfillmentMethod: "STORE_DELIVERY" | "CUSTOMER_PICKUP";
  idempotencyKey: string;
  now?: Date;
}

const orderInclude = {
  address: true,
  history: { orderBy: { createdAt: "asc" as const } },
  items: true,
  payment: true,
  reservations: true,
} satisfies Prisma.OrderInclude;

function orderNumber() {
  return `RZ-${randomBytes(9).toString("hex").toUpperCase()}`;
}

function boundedInstructions(value: string | null | undefined) {
  const result = value?.trim().replace(/\s+/g, " ");
  if (!result) return null;
  if (result.length > 1000) {
    commerceError("VALIDATION_ERROR", "Customer instructions are too long.");
  }
  return result;
}

async function replayExistingOrder(customerId: string, key: string, requestHash: string) {
  const existing = await prisma.checkoutIdempotency.findUnique({
    where: { customerId_key: { customerId, key } },
  });
  const decision = resolveIdempotency(existing, requestHash);
  if (decision === "REPLAY" && existing?.orderId) {
    return prisma.order.findFirstOrThrow({
      where: { id: existing.orderId, customerId },
      include: orderInclude,
    });
  }
  if (decision === "IN_PROGRESS") {
    commerceError("CONFLICT", "Checkout is already processing.");
  }
  commerceError("CONFLICT", "Checkout could not be replayed safely.");
}

export async function createPendingOrder(input: CreatePendingOrderInput) {
  const instructions = boundedInstructions(input.customerInstructions);
  const requestHash = hashCheckoutRequest({
    addressId: input.addressId ?? null,
    cartId: input.cartId,
    cartVersion: input.cartVersion,
    fulfillmentMethod: input.fulfillmentMethod,
    instructions,
  });
  const now = input.now ?? new Date();

  try {
    return await runCommerceSerializable(async (transaction) => {
      const customer = await requireActiveCommerceCustomer(input.customerId, transaction);
      const existingIdempotency = await transaction.checkoutIdempotency.findUnique({
        where: { customerId_key: { customerId: customer.personId, key: input.idempotencyKey } },
      });
      const idempotencyDecision = resolveIdempotency(existingIdempotency, requestHash);
      if (idempotencyDecision === "REPLAY" && existingIdempotency?.orderId) {
        return transaction.order.findFirstOrThrow({
          where: { id: existingIdempotency.orderId, customerId: customer.personId },
          include: orderInclude,
        });
      }
      if (idempotencyDecision === "IN_PROGRESS") {
        commerceError("CONFLICT", "Checkout is already processing.");
      }

      const cart = await transaction.cart.findFirst({
        where: { id: input.cartId, customerId: customer.personId, status: "ACTIVE" },
        include: {
          items: {
            include: {
              productVariant: {
                include: {
                  inventory: true,
                  product: {
                    include: {
                      category: { select: { status: true } },
                      media: { orderBy: { sortOrder: "asc" }, take: 1 },
                    },
                  },
                },
              },
            },
            orderBy: { productVariantId: "asc" },
          },
          store: {
            include: {
              organization: {
                select: { deletedAt: true, isActive: true, status: true },
              },
            },
          },
        },
      });
      if (!cart) commerceError("NOT_FOUND", "Active Cart was not found.");
      assertCartVersion(cart.version, input.cartVersion);
      if (cart.items.length === 0) commerceError("VALIDATION_ERROR", "Cart is empty.");
      if (
        cart.store.status !== "ACTIVE" ||
        cart.store.archivedAt ||
        !cart.store.publishedAt ||
        cart.store.organization.deletedAt !== null ||
        !cart.store.organization.isActive ||
        cart.store.organization.status !== "ACTIVE"
      ) {
        commerceError("STORE_UNAVAILABLE", "Store is not available for Checkout.");
      }
      if (cart.store.currency !== COMMERCE_CURRENCY || cart.currency !== COMMERCE_CURRENCY) {
        commerceError("VALIDATION_ERROR", "Checkout currency must be IQD.");
      }

      let address: Awaited<ReturnType<typeof transaction.customerAddress.findFirst>> = null;
      let paymentMethod: "CASH_ON_DELIVERY" | "PAY_AT_PICKUP";
      if (input.fulfillmentMethod === "STORE_DELIVERY") {
        if (!cart.store.deliveryEnabled) {
          commerceError("INVALID_FULFILLMENT_METHOD", "Store delivery is not available.");
        }
        if (!input.addressId) {
          commerceError("ADDRESS_REQUIRED", "A customer address is required for Store delivery.");
        }
        address = await transaction.customerAddress.findFirst({
          where: { id: input.addressId, customerId: customer.personId, archivedAt: null },
        });
        if (!address) commerceError("ADDRESS_OWNERSHIP_REQUIRED", "Delivery address was not found.");
        if (
          normalizeCommerceText(address.city) !== normalizeCommerceText(cart.store.deliveryCity ?? "") ||
          normalizeCommerceText(address.area) !== normalizeCommerceText(cart.store.deliveryArea ?? "")
        ) {
          commerceError("ADDRESS_NOT_ALLOWED", "Address is outside the Store delivery area.");
        }
        paymentMethod = "CASH_ON_DELIVERY";
      } else {
        if (input.addressId) {
          commerceError("ADDRESS_NOT_ALLOWED", "Pickup Checkout must not include an address.");
        }
        if (!cart.store.pickupEnabled) {
          commerceError("INVALID_FULFILLMENT_METHOD", "Customer pickup is not available.");
        }
        paymentMethod = "PAY_AT_PICKUP";
      }

      const totalInput = cart.items.map((item) => {
        const variant = item.productVariant;
        if (
          variant.storeId !== cart.storeId ||
          variant.status !== "ACTIVE" ||
          variant.product.storeId !== cart.storeId ||
          variant.product.status !== "PUBLISHED" ||
          variant.product.category.status !== "ACTIVE" ||
          !variant.product.publishedAt ||
          variant.product.archivedAt ||
          variant.currency !== COMMERCE_CURRENCY
        ) {
          commerceError("PRODUCT_UNAVAILABLE", "A Cart Product is no longer available.");
        }
        if (!variant.inventory) commerceError("INSUFFICIENT_STOCK", "Inventory is unavailable.");
        return {
          compareAtPrice: variant.compareAtPrice,
          quantity: item.quantity,
          unitPrice: variant.price,
        };
      });
      const totals = calculateCommerceTotals(
        totalInput,
        input.fulfillmentMethod === "STORE_DELIVERY" ? cart.store.deliveryFee : "0",
      );
      assertCheckoutPersistenceCapacity(totals);
      const merchandiseTotal = new Prisma.Decimal(totals.subtotal).minus(totals.discountTotal);
      if (merchandiseTotal.lessThan(cart.store.minimumOrderValue)) {
        commerceError("MINIMUM_ORDER_NOT_MET", "Cart does not meet the Store minimum order value.");
      }

      const inventoryIds = cart.items.map((item) => item.productVariant.inventory!.id);
      await lockInventoryItems(transaction, inventoryIds);
      const lockedInventory = await transaction.inventoryItem.findMany({
        where: { id: { in: inventoryIds } },
      });
      const inventoryById = new Map(lockedInventory.map((item) => [item.id, item]));
      for (const item of cart.items) {
        const inventory = inventoryById.get(item.productVariant.inventory!.id);
        if (!inventory || inventory.onHand - inventory.reserved < item.quantity) {
          commerceError("INSUFFICIENT_STOCK", "A Cart Product does not have enough stock.");
        }
      }

      const idempotency = existingIdempotency
        ? await transaction.checkoutIdempotency.update({
            where: { id: existingIdempotency.id },
            data: { status: "PROCESSING" },
          })
        : await transaction.checkoutIdempotency.create({
            data: {
              customerId: customer.personId,
              expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
              key: input.idempotencyKey,
              requestHash,
            },
          });

      const orderId = randomUUID();
      const expiresAt = reservationExpiresAt(now);
      const orderItemData = cart.items.map((item, index) => {
        const variant = item.productVariant;
        const line = totals.lines[index];
        return {
          compareAtPrice: line.compareAtPrice,
          currency: COMMERCE_CURRENCY,
          id: randomUUID(),
          imageUrlSnapshot: safePublicImageUrlOrNull(variant.product.media[0]?.url),
          lineDiscount: line.lineDiscount,
          lineSubtotal: line.lineSubtotal,
          lineTotal: line.lineTotal,
          optionValuesSnapshot: variant.optionValues as Prisma.InputJsonValue,
          productId: variant.productId,
          productNameSnapshot: variant.product.name,
          productVariantId: variant.id,
          quantity: item.quantity,
          skuSnapshot: variant.sku,
          unitPrice: line.unitPrice,
          variantTitleSnapshot: variant.title,
        };
      });
      const customerRecord = await transaction.person.findUniqueOrThrow({
        where: { id: customer.personId },
        select: { displayName: true, firstName: true, lastName: true, phone: true },
      });
      const customerName =
        customerRecord.displayName ??
        [customerRecord.firstName, customerRecord.lastName].filter(Boolean).join(" ");
      const customerPhone = address?.phone ?? customerRecord.phone;
      if (!customerPhone) commerceError("VALIDATION_ERROR", "A customer phone number is required.");

      await transaction.order.create({
        data: {
          address: address
            ? {
                create: {
                  additionalDetails: address.additionalDetails,
                  area: address.area,
                  city: address.city,
                  landmark: address.landmark,
                  latitude: address.latitude,
                  longitude: address.longitude,
                  phone: address.phone,
                  recipientName: address.recipientName,
                  street: address.street,
                },
              }
            : undefined,
          currency: COMMERCE_CURRENCY,
          customerId: customer.personId,
          customerInstructions: instructions,
          customerNameSnapshot: customerName,
          customerPhoneSnapshot: customerPhone,
          deliveryEstimateMinutes: cart.store.deliveryEstimateMinutes,
          deliveryFee: totals.deliveryFee,
          discountTotal: totals.discountTotal,
          fulfillmentMethod: input.fulfillmentMethod,
          grandTotal: totals.grandTotal,
          history: {
            create: {
              actorId: customer.personId,
              actorType: "CUSTOMER",
              idempotencyKey: `order:${orderId}:created`,
              newOrderStatus: "PENDING",
            },
          },
          id: orderId,
          items: { create: orderItemData },
          orderNumber: orderNumber(),
          payment: {
            create: {
              amount: totals.grandTotal,
              currency: COMMERCE_CURRENCY,
              method: paymentMethod,
            },
          },
          paymentMethod,
          pickupAddressSnapshot:
            input.fulfillmentMethod === "CUSTOMER_PICKUP"
              ? [cart.store.pickupStreet, cart.store.pickupArea, cart.store.pickupCity]
                  .filter(Boolean)
                  .join(", ")
              : null,
          pickupInstructionsSnapshot: cart.store.pickupInstructions,
          preparationEstimateMinutes: cart.store.preparationEstimateMinutes,
          reservationExpiresAt: expiresAt,
          storeId: cart.storeId,
          storeLogoUrlSnapshot: safePublicImageUrlOrNull(cart.store.logoUrl),
          storeNameSnapshot: cart.store.name,
          storePhoneSnapshot: cart.store.supportPhone,
          storeSlugSnapshot: cart.store.slug,
          subtotal: totals.subtotal,
          taxTotal: totals.taxTotal,
        },
      });

      for (const [index, item] of cart.items.entries()) {
        const inventory = inventoryById.get(item.productVariant.inventory!.id)!;
        const orderItem = orderItemData[index];
        const reservationId = randomUUID();
        const resultingReserved = inventory.reserved + item.quantity;
        await transaction.inventoryItem.update({
          where: { id: inventory.id },
          data: { reserved: resultingReserved, version: { increment: 1 } },
        });
        await transaction.inventoryReservation.create({
          data: {
            deterministicKey: `order:${orderId}:variant:${item.productVariant.id}`,
            expiresAt,
            id: reservationId,
            inventoryItemId: inventory.id,
            orderId,
            orderItemId: orderItem.id,
            productVariantId: item.productVariant.id,
            quantity: item.quantity,
          },
        });
        await transaction.stockMovement.create({
          data: {
            actorId: customer.personId,
            actorType: "CUSTOMER",
            idempotencyKey: stockMovementKey({
              action: "reserve",
              orderId,
              reservationId,
              variantId: item.productVariant.id,
            }),
            inventoryItemId: inventory.id,
            onHandDelta: 0,
            orderId,
            quantity: item.quantity,
            reservationId,
            reservedDelta: item.quantity,
            resultingOnHand: inventory.onHand,
            resultingReserved,
            type: "RESERVE",
          },
        });
      }

      await transaction.cart.update({
        where: { id: cart.id },
        data: { status: "CONVERTED", version: { increment: 1 } },
      });
      await transaction.checkoutIdempotency.update({
        where: { id: idempotency.id },
        data: {
          orderId,
          responseData: { orderId },
          status: "COMPLETED",
        },
      });
      await notifyCheckoutCreated(transaction, orderId);
      return transaction.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return replayExistingOrder(input.customerId, input.idempotencyKey, requestHash);
    }
    throw error;
  }
}

function assertCheckoutPersistenceCapacity(totals: CommerceOrderTotals) {
  for (const [field, value] of [
    ["order.subtotal", totals.subtotal],
    ["order.deliveryFee", totals.deliveryFee],
    ["order.discountTotal", totals.discountTotal],
    ["order.taxTotal", totals.taxTotal],
    ["order.grandTotal", totals.grandTotal],
    ["payment.amount", totals.grandTotal],
  ] as const) {
    assertCommercePersistenceAmount(value, field);
  }
  for (const [index, line] of totals.lines.entries()) {
    for (const [field, value] of [
      ["compareAtPrice", line.compareAtPrice],
      ["lineDiscount", line.lineDiscount],
      ["lineSubtotal", line.lineSubtotal],
      ["lineTotal", line.lineTotal],
      ["unitPrice", line.unitPrice],
    ] as const) {
      if (value !== null) {
        assertCommercePersistenceAmount(value, `order.items[${index}].${field}`);
      }
    }
  }
}
