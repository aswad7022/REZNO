import type { Prisma } from "@prisma/client";

import { assertCartVersion, mergeCartQuantity } from "@/features/commerce/domain/cart";
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

export const cartApiInclude = {
  items: {
    include: {
      productVariant: {
        include: {
          inventory: true,
          product: { include: { media: { orderBy: { sortOrder: "asc" as const }, take: 1 } } },
        },
      },
    },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  },
  store: true,
} satisfies Prisma.CartInclude;

export type CartApiRecord = Prisma.CartGetPayload<{ include: typeof cartApiInclude }>;

function assertQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    commerceError("VALIDATION_ERROR", "Cart quantity must be between 1 and 99.");
  }
}

async function findPurchasableVariant(
  transaction: Prisma.TransactionClient,
  variantId: string,
) {
  const variant = await transaction.productVariant.findFirst({
    where: {
      id: variantId,
      archivedAt: null,
      currency: COMMERCE_CURRENCY,
      status: "ACTIVE",
      product: {
        archivedAt: null,
        category: { status: "ACTIVE" },
        publishedAt: { not: null },
        status: "PUBLISHED",
      },
      store: { archivedAt: null, publishedAt: { not: null }, status: "ACTIVE" },
    },
    include: { inventory: true, product: true, store: true },
  });
  if (!variant) commerceError("PRODUCT_UNAVAILABLE", "Variant is not available.");
  return variant;
}

function assertAvailable(
  inventory: { onHand: number; reserved: number } | null,
  requestedQuantity: number,
) {
  if (!inventory || inventory.onHand - inventory.reserved < requestedQuantity) {
    commerceError("CART_ITEM_UNAVAILABLE", "The requested quantity is not currently available.");
  }
}

async function loadCart(transaction: Prisma.TransactionClient, cartId: string) {
  return transaction.cart.findUniqueOrThrow({ where: { id: cartId }, include: cartApiInclude });
}

export async function getCustomerCart(customerId: string) {
  await requireActiveCommerceCustomer(customerId);
  return prisma.cart.findFirst({
    where: { customerId, status: "ACTIVE" },
    include: cartApiInclude,
  });
}

export async function addCartItem(customerId: string, input: AddCartItemInput) {
  assertQuantity(input.quantity);
  return runCommerceSerializable(async (transaction) => {
    const customer = await requireActiveCommerceCustomer(customerId, transaction);
    const variant = await findPurchasableVariant(transaction, input.variantId);
    let cart = await transaction.cart.findFirst({
      where: { customerId: customer.personId, status: "ACTIVE" },
      include: { items: true, store: true },
    });
    if (cart) {
      if (cart.storeId !== variant.storeId) {
        commerceError("CONFLICT", "The Cart belongs to another Store.", {
          kind: "CART_STORE_CONFLICT",
          cartVersion: cart.version,
          currentStore: { id: cart.store.id, name: cart.store.name, slug: cart.store.slug },
          incomingStore: { id: variant.store.id, name: variant.store.name, slug: variant.store.slug },
        });
      }
      if (input.expectedVersion === undefined) {
        commerceError("CART_VERSION_CONFLICT", "The active Cart version is required.");
      }
      assertCartVersion(cart.version, input.expectedVersion);
    } else {
      cart = await transaction.cart.create({
        data: {
          currency: COMMERCE_CURRENCY,
          customerId: customer.personId,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          storeId: variant.storeId,
        },
        include: { items: true, store: true },
      });
    }
    const existing = cart.items.find((item) => item.productVariantId === variant.id);
    const nextQuantity = existing
      ? mergeCartQuantity(existing.quantity, input.quantity)
      : input.quantity;
    assertAvailable(variant.inventory, nextQuantity);
    if (existing) {
      await transaction.cartItem.update({
        where: { id: existing.id },
        data: { quantity: nextQuantity, unitPriceSnapshot: variant.price },
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
    return loadCart(transaction, cart.id);
  });
}

export async function updateCartItemQuantity(
  customerId: string,
  input: { cartItemId: string; expectedVersion: number; quantity: number },
) {
  assertQuantity(input.quantity);
  return runCommerceSerializable(async (transaction) => {
    await requireActiveCommerceCustomer(customerId, transaction);
    const item = await transaction.cartItem.findFirst({
      where: { id: input.cartItemId, cart: { customerId, status: "ACTIVE" } },
      include: { cart: true, productVariant: { include: { inventory: true, product: true, store: true } } },
    });
    if (!item) commerceError("NOT_FOUND", "Cart item was not found.");
    assertCartVersion(item.cart.version, input.expectedVersion);
    const variant = await findPurchasableVariant(transaction, item.productVariantId);
    assertAvailable(variant.inventory, input.quantity);
    await transaction.cartItem.update({
      where: { id: item.id },
      data: { quantity: input.quantity, unitPriceSnapshot: variant.price },
    });
    await transaction.cart.update({ where: { id: item.cartId }, data: { version: { increment: 1 } } });
    return loadCart(transaction, item.cartId);
  });
}

export async function removeCartItem(
  customerId: string,
  input: { cartItemId: string; expectedVersion: number },
) {
  return runCommerceSerializable(async (transaction) => {
    await requireActiveCommerceCustomer(customerId, transaction);
    const item = await transaction.cartItem.findFirst({
      where: { id: input.cartItemId, cart: { customerId } },
      include: { cart: { include: { items: { select: { id: true } } } } },
    });
    if (!item || item.cart.status !== "ACTIVE") commerceError("NOT_FOUND", "Cart item was not found.");
    assertCartVersion(item.cart.version, input.expectedVersion);
    await transaction.cartItem.delete({ where: { id: item.id } });
    const finalItem = item.cart.items.length === 1;
    await transaction.cart.update({
      where: { id: item.cartId },
      data: { status: finalItem ? "ABANDONED" : undefined, version: { increment: 1 } },
    });
    return finalItem ? null : loadCart(transaction, item.cartId);
  });
}

export async function clearCustomerCart(customerId: string, expectedVersion: number) {
  return runCommerceSerializable(async (transaction) => {
    await requireActiveCommerceCustomer(customerId, transaction);
    const cart = await transaction.cart.findFirst({ where: { customerId, status: "ACTIVE" } });
    if (!cart) return null;
    assertCartVersion(cart.version, expectedVersion);
    await transaction.cart.update({
      where: { id: cart.id },
      data: { status: "ABANDONED", version: { increment: 1 } },
    });
    return null;
  });
}

export async function replaceCustomerCart(
  customerId: string,
  input: { cartId: string; expectedVersion: number; quantity: number; variantId: string },
) {
  assertQuantity(input.quantity);
  return runCommerceSerializable(async (transaction) => {
    await requireActiveCommerceCustomer(customerId, transaction);
    const current = await transaction.cart.findFirst({
      where: { id: input.cartId, customerId },
    });
    if (!current) commerceError("NOT_FOUND", "Cart was not found.");
    assertCartVersion(current.version, input.expectedVersion);
    if (current.status !== "ACTIVE") {
      commerceError("CART_VERSION_CONFLICT", "The Cart is no longer active.");
    }
    const variant = await findPurchasableVariant(transaction, input.variantId);
    if (current.storeId === variant.storeId) {
      commerceError("VALIDATION_ERROR", "Cart replacement requires a different Store.");
    }
    assertAvailable(variant.inventory, input.quantity);
    await transaction.cart.update({
      where: { id: current.id },
      data: { status: "ABANDONED", version: { increment: 1 } },
    });
    const replacement = await transaction.cart.create({
      data: {
        currency: COMMERCE_CURRENCY,
        customerId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        storeId: variant.storeId,
        version: 1,
        items: {
          create: {
            productVariantId: variant.id,
            quantity: input.quantity,
            unitPriceSnapshot: variant.price,
          },
        },
      },
    });
    return loadCart(transaction, replacement.id);
  });
}
