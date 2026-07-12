import { assertCartStore, assertCartVersion, mergeCartQuantity } from "@/features/commerce/domain/cart";
import { commerceError } from "@/features/commerce/domain/errors";
import { COMMERCE_CURRENCY } from "@/features/commerce/domain/money";
import { requireActiveCommerceCustomer } from "@/features/commerce/services/authorization";
import { runCommerceSerializable } from "@/features/commerce/services/transaction";
import { prisma } from "@/lib/db/prisma";

export interface AddCartItemInput {
  expectedVersion?: number;
  quantity: number;
  variantId: string;
}

export async function getCustomerCart(customerId: string) {
  await requireActiveCommerceCustomer(customerId);
  return prisma.cart.findFirst({
    where: { customerId, status: "ACTIVE" },
    include: {
      items: {
        include: {
          productVariant: { include: { product: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      store: true,
    },
  });
}

export async function addCartItem(customerId: string, input: AddCartItemInput) {
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 99) {
    commerceError("VALIDATION_ERROR", "Cart quantity must be between 1 and 99.");
  }
  return runCommerceSerializable(async (transaction) => {
    const customer = await requireActiveCommerceCustomer(customerId, transaction);
    const variant = await transaction.productVariant.findFirst({
      where: {
        id: input.variantId,
        currency: COMMERCE_CURRENCY,
        status: "ACTIVE",
        product: { archivedAt: null, publishedAt: { not: null }, status: "PUBLISHED" },
        store: { archivedAt: null, publishedAt: { not: null }, status: "ACTIVE" },
      },
      select: { id: true, price: true, storeId: true },
    });
    if (!variant) commerceError("PRODUCT_UNAVAILABLE", "Variant is not available.");

    let cart = await transaction.cart.findFirst({
      where: { customerId: customer.personId, status: "ACTIVE" },
      include: { items: true },
    });
    if (cart) {
      assertCartStore(cart.storeId, variant.storeId);
      if (input.expectedVersion !== undefined) assertCartVersion(cart.version, input.expectedVersion);
    } else {
      cart = await transaction.cart.create({
        data: {
          currency: COMMERCE_CURRENCY,
          customerId: customer.personId,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          storeId: variant.storeId,
        },
        include: { items: true },
      });
    }

    const existing = cart.items.find((item) => item.productVariantId === variant.id);
    if (existing) {
      await transaction.cartItem.update({
        where: { id: existing.id },
        data: {
          quantity: mergeCartQuantity(existing.quantity, input.quantity),
          unitPriceSnapshot: variant.price,
        },
      });
    } else {
      await transaction.cartItem.create({
        data: {
          cartId: cart.id,
          productVariantId: variant.id,
          quantity: input.quantity,
          unitPriceSnapshot: variant.price,
        },
      });
    }
    await transaction.cart.update({
      where: { id: cart.id },
      data: {
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        version: { increment: 1 },
      },
    });
    return transaction.cart.findUniqueOrThrow({
      where: { id: cart.id },
      include: { items: { orderBy: { createdAt: "asc" } }, store: true },
    });
  });
}

export async function updateCartItemQuantity(
  customerId: string,
  input: { cartItemId: string; expectedVersion: number; quantity: number },
) {
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 99) {
    commerceError("VALIDATION_ERROR", "Cart quantity must be between 1 and 99.");
  }
  return runCommerceSerializable(async (transaction) => {
    await requireActiveCommerceCustomer(customerId, transaction);
    const item = await transaction.cartItem.findFirst({
      where: { id: input.cartItemId, cart: { customerId, status: "ACTIVE" } },
      include: { cart: true, productVariant: true },
    });
    if (!item) commerceError("NOT_FOUND", "Cart item was not found.");
    assertCartVersion(item.cart.version, input.expectedVersion);
    await transaction.cartItem.update({
      where: { id: item.id },
      data: { quantity: input.quantity, unitPriceSnapshot: item.productVariant.price },
    });
    await transaction.cart.update({
      where: { id: item.cartId },
      data: { version: { increment: 1 } },
    });
    return transaction.cart.findUniqueOrThrow({
      where: { id: item.cartId },
      include: { items: true },
    });
  });
}
