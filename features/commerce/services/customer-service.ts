import { commerceError } from "@/features/commerce/domain/errors";
import { requireActiveCommerceCustomer } from "@/features/commerce/services/authorization";
import { publicProductWhere, publicStoreWhere } from "@/features/commerce/services/catalog-service";
import { runCommerceSerializable } from "@/features/commerce/services/transaction";
import { prisma } from "@/lib/db/prisma";

export interface CustomerAddressInput {
  additionalDetails: string;
  area: string;
  city: string;
  isDefault?: boolean;
  label?: string | null;
  landmark?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  phone: string;
  recipientName: string;
  street: string;
}

function requiredText(value: string, field: string, max: number) {
  const result = value.trim();
  if (!result || result.length > max) {
    commerceError("VALIDATION_ERROR", `${field} is required and must not exceed ${max} characters.`);
  }
  return result;
}

function optionalText(value: string | null | undefined, max: number) {
  const result = value?.trim();
  if (!result) return null;
  if (result.length > max) commerceError("VALIDATION_ERROR", `Value exceeds ${max} characters.`);
  return result;
}

function validateCoordinates(latitude?: string | null, longitude?: string | null) {
  if (!latitude && !longitude) return { latitude: null, longitude: null };
  if (!latitude || !longitude) {
    commerceError("VALIDATION_ERROR", "Latitude and longitude must be provided together.");
  }
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    commerceError("VALIDATION_ERROR", "Address coordinates are invalid.");
  }
  return { latitude, longitude };
}

export async function createCustomerAddress(customerId: string, input: CustomerAddressInput) {
  const coordinates = validateCoordinates(input.latitude, input.longitude);
  return runCommerceSerializable(async (transaction) => {
    const customer = await requireActiveCommerceCustomer(customerId, transaction);
    const activeAddressCount = await transaction.customerAddress.count({
      where: { customerId: customer.personId, archivedAt: null },
    });
    const makeDefault = input.isDefault === true || activeAddressCount === 0;
    if (makeDefault) {
      await transaction.customerAddress.updateMany({
        where: { customerId: customer.personId, archivedAt: null, isDefault: true },
        data: { isDefault: false },
      });
    }
    return transaction.customerAddress.create({
      data: {
        additionalDetails: requiredText(input.additionalDetails, "additionalDetails", 500),
        area: requiredText(input.area, "area", 160),
        city: requiredText(input.city, "city", 160),
        customerId: customer.personId,
        isDefault: makeDefault,
        label: optionalText(input.label, 80),
        landmark: optionalText(input.landmark, 240),
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        phone: requiredText(input.phone, "phone", 30),
        recipientName: requiredText(input.recipientName, "recipientName", 160),
        street: requiredText(input.street, "street", 240),
      },
    });
  });
}

export async function listCustomerAddresses(customerId: string) {
  await requireActiveCommerceCustomer(customerId);
  return prisma.customerAddress.findMany({
    where: { customerId, archivedAt: null },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }, { id: "asc" }],
  });
}

export async function updateCustomerAddress(
  customerId: string,
  addressId: string,
  input: Partial<CustomerAddressInput>,
) {
  const coordinates = validateCoordinates(input.latitude, input.longitude);
  return runCommerceSerializable(async (transaction) => {
    await requireActiveCommerceCustomer(customerId, transaction);
    const address = await transaction.customerAddress.findFirst({
      where: { id: addressId, customerId, archivedAt: null },
    });
    if (!address) commerceError("NOT_FOUND", "Address was not found.");
    if (input.isDefault === true) {
      await transaction.customerAddress.updateMany({
        where: { customerId, archivedAt: null, isDefault: true, id: { not: address.id } },
        data: { isDefault: false },
      });
    }
    const data = {
      additionalDetails:
        input.additionalDetails === undefined
          ? undefined
          : requiredText(input.additionalDetails, "additionalDetails", 500),
      area: input.area === undefined ? undefined : requiredText(input.area, "area", 160),
      city: input.city === undefined ? undefined : requiredText(input.city, "city", 160),
      isDefault: input.isDefault,
      label: input.label === undefined ? undefined : optionalText(input.label, 80),
      landmark: input.landmark === undefined ? undefined : optionalText(input.landmark, 240),
      latitude:
        input.latitude === undefined && input.longitude === undefined ? undefined : coordinates.latitude,
      longitude:
        input.latitude === undefined && input.longitude === undefined ? undefined : coordinates.longitude,
      phone: input.phone === undefined ? undefined : requiredText(input.phone, "phone", 30),
      recipientName:
        input.recipientName === undefined
          ? undefined
          : requiredText(input.recipientName, "recipientName", 160),
      street: input.street === undefined ? undefined : requiredText(input.street, "street", 240),
    };
    const updated = await transaction.customerAddress.update({ where: { id: address.id }, data });
    if (address.isDefault && input.isDefault === false) {
      await promoteDeterministicDefault(transaction, customerId, address.id);
    }
    return updated;
  });
}

export async function archiveCustomerAddress(customerId: string, addressId: string) {
  return runCommerceSerializable(async (transaction) => {
    await requireActiveCommerceCustomer(customerId, transaction);
    const address = await transaction.customerAddress.findFirst({
      where: { id: addressId, customerId, archivedAt: null },
    });
    if (!address) commerceError("NOT_FOUND", "Address was not found.");
    const archived = await transaction.customerAddress.update({
      where: { id: address.id },
      data: { archivedAt: new Date(), isDefault: false },
    });
    if (address.isDefault) await promoteDeterministicDefault(transaction, customerId, address.id);
    return archived;
  });
}

export async function setDefaultCustomerAddress(customerId: string, addressId: string) {
  return runCommerceSerializable(async (transaction) => {
    await requireActiveCommerceCustomer(customerId, transaction);
    const address = await transaction.customerAddress.findFirst({
      where: { id: addressId, customerId, archivedAt: null },
      select: { id: true },
    });
    if (!address) commerceError("NOT_FOUND", "Address was not found.");
    await transaction.customerAddress.updateMany({
      where: { customerId, archivedAt: null, isDefault: true, id: { not: address.id } },
      data: { isDefault: false },
    });
    return transaction.customerAddress.update({
      where: { id: address.id },
      data: { isDefault: true },
    });
  });
}

async function promoteDeterministicDefault(
  transaction: Prisma.TransactionClient,
  customerId: string,
  excludedAddressId: string,
) {
  const replacement = await transaction.customerAddress.findFirst({
    where: { customerId, archivedAt: null, id: { not: excludedAddressId } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (replacement) {
    await transaction.customerAddress.update({
      where: { id: replacement.id },
      data: { isDefault: true },
    });
  }
}

export async function getCustomerAddress(customerId: string, addressId: string) {
  await requireActiveCommerceCustomer(customerId);
  const address = await prisma.customerAddress.findFirst({
    where: { id: addressId, customerId, archivedAt: null },
  });
  if (!address) commerceError("NOT_FOUND", "Address was not found.");
  return address;
}

export async function favoriteStore(customerId: string, storeId: string) {
  await requireActiveCommerceCustomer(customerId);
  const store = await prisma.store.findFirst({ where: { id: storeId, ...publicStoreWhere }, select: { id: true } });
  if (!store) commerceError("STORE_UNAVAILABLE", "Store is not available.");
  return prisma.customerFavoriteStore.upsert({
    where: { customerId_storeId: { customerId, storeId: store.id } },
    create: { customerId, storeId: store.id },
    update: {},
  });
}

export async function unfavoriteStore(customerId: string, storeId: string) {
  await requireActiveCommerceCustomer(customerId);
  await prisma.customerFavoriteStore.deleteMany({ where: { customerId, storeId } });
}

export async function favoriteProduct(customerId: string, productId: string) {
  await requireActiveCommerceCustomer(customerId);
  const product = await prisma.product.findFirst({
    where: { id: productId, ...publicProductWhere },
    select: { id: true },
  });
  if (!product) commerceError("PRODUCT_UNAVAILABLE", "Product is not available.");
  return prisma.customerFavoriteProduct.upsert({
    where: { customerId_productId: { customerId, productId: product.id } },
    create: { customerId, productId: product.id },
    update: {},
  });
}

export async function unfavoriteProduct(customerId: string, productId: string) {
  await requireActiveCommerceCustomer(customerId);
  await prisma.customerFavoriteProduct.deleteMany({ where: { customerId, productId } });
}
import type { Prisma } from "@prisma/client";
