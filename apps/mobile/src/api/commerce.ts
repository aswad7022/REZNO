import { mobileApiRequest } from "./client";
import type {
  CommerceAddress,
  CommerceAddressInput,
  CommerceCart,
  CommerceCategory,
  CommerceCollection,
  CommerceData,
  CommerceOrderDetail,
  CommerceOrderSummary,
  CommerceNotification,
  CommerceProduct,
  CommerceProductDetail,
  CommerceReceipt,
  CommerceStore,
  FavoriteProduct,
  FavoriteStore,
  FulfillmentMethod,
} from "../types/commerce";

export type StoreSearch = {
  category?: string;
  cursor?: string;
  fulfillment?: "delivery" | "pickup";
  limit?: number;
  q?: string;
  sort?: "name_asc" | "newest";
};

export type ProductSearch = {
  category?: string;
  cursor?: string;
  inStock?: boolean;
  limit?: number;
  q?: string;
  sort?: "name_asc" | "newest" | "price_asc" | "price_desc";
  store?: string;
};

export const commerceApi = {
  addCartItem: (variantId: string, quantity: number, cartVersion?: number) =>
    authenticated<CommerceCart>("/api/commerce/customer/cart/items", "POST", {
      ...(cartVersion === undefined ? {} : { cartVersion }), quantity, variantId,
    }),
  addFavoriteProduct: (productId: string) =>
    authenticated<{ favoriteId: string; product: CommerceProduct }>(
      "/api/commerce/customer/favorites/products", "POST", { productId },
    ),
  addFavoriteStore: (storeId: string) =>
    authenticated<{ favoriteId: string; store: CommerceStore }>(
      "/api/commerce/customer/favorites/stores", "POST", { storeId },
    ),
  cancelOrder: (orderId: string, expectedVersion: string, reason: string, idempotencyKey: string) =>
    authenticated<CommerceOrderDetail>(
      `/api/commerce/customer/orders/${orderId}/cancel`,
      "POST",
      { expectedVersion, reason },
      { "idempotency-key": idempotencyKey },
    ),
  checkout: (
    input: {
      addressId: string | null;
      cartId: string;
      cartVersion: number;
      customerInstructions: string | null;
      fulfillmentMethod: FulfillmentMethod;
      paymentMethod?: "ONLINE_PROVIDER";
    },
    idempotencyKey: string,
  ) => authenticated<CommerceReceipt>("/api/commerce/customer/checkout", "POST", input, {
    "idempotency-key": idempotencyKey,
  }),
  clearCart: (cartVersion: number) =>
    authenticated<null>("/api/commerce/customer/cart", "DELETE", { cartVersion }),
  createAddress: (input: CommerceAddressInput) =>
    authenticated<CommerceAddress>("/api/commerce/customer/addresses", "POST", input),
  deleteAddress: (addressId: string) =>
    authenticated<{ deleted: true; id: string }>(`/api/commerce/customer/addresses/${addressId}`, "DELETE"),
  getCart: () => authenticated<CommerceCart | null>("/api/commerce/customer/cart", "GET"),
  getOrder: (orderId: string) =>
    authenticated<CommerceOrderDetail>(`/api/commerce/customer/orders/${orderId}`, "GET"),
  getProduct: (storeSlug: string, productSlug: string, signal?: AbortSignal) =>
    publicData<CommerceProductDetail>(
      `/api/commerce/public/stores/${storeSlug}/products/${productSlug}`, undefined, signal,
    ),
  getStore: (storeSlug: string, signal?: AbortSignal) =>
    publicData<CommerceStore>(`/api/commerce/public/stores/${storeSlug}`, undefined, signal),
  listAddresses: () => authenticatedCollection<CommerceAddress>("/api/commerce/customer/addresses"),
  listCategories: (signal?: AbortSignal) =>
    publicCollection<CommerceCategory>("/api/commerce/public/categories", undefined, signal),
  listFavoriteProducts: (cursor?: string) =>
    authenticatedCollection<FavoriteProduct>("/api/commerce/customer/favorites/products", { cursor, limit: 20 }),
  listFavoriteStores: (cursor?: string) =>
    authenticatedCollection<FavoriteStore>("/api/commerce/customer/favorites/stores", { cursor, limit: 20 }),
  listOrders: (cursor?: string) =>
    authenticatedCollection<CommerceOrderSummary>("/api/commerce/customer/orders", { cursor, limit: 20, sort: "newest" }),
  listNotifications: (cursor?: string) =>
    authenticatedCollection<CommerceNotification>("/api/commerce/customer/notifications", { cursor, limit: 20 }),
  listProducts: (query: ProductSearch, signal?: AbortSignal) =>
    publicCollection<CommerceProduct>("/api/commerce/public/products", query, signal),
  listStoreProducts: (storeSlug: string, query: Omit<ProductSearch, "store">, signal?: AbortSignal) =>
    publicCollection<CommerceProduct>(`/api/commerce/public/stores/${storeSlug}/products`, query, signal),
  listStores: (query: StoreSearch, signal?: AbortSignal) =>
    publicCollection<CommerceStore>("/api/commerce/public/stores", query, signal),
  removeCartItem: (cartItemId: string, cartVersion: number) =>
    authenticated<CommerceCart | null>(`/api/commerce/customer/cart/items/${cartItemId}`, "DELETE", { cartVersion }),
  removeFavoriteProduct: (productId: string) =>
    authenticated<{ deleted: true; productId: string }>(
      `/api/commerce/customer/favorites/products/${productId}`, "DELETE",
    ),
  removeFavoriteStore: (storeId: string) =>
    authenticated<{ deleted: true; storeId: string }>(
      `/api/commerce/customer/favorites/stores/${storeId}`, "DELETE",
    ),
  replaceCart: (cartId: string, cartVersion: number, variantId: string, quantity: number) =>
    authenticated<CommerceCart>("/api/commerce/customer/cart/replace", "POST", {
      cartId, cartVersion, quantity, variantId,
    }),
  setDefaultAddress: (addressId: string) =>
    authenticated<CommerceAddress>(`/api/commerce/customer/addresses/${addressId}/default`, "POST"),
  updateAddress: (addressId: string, input: Partial<CommerceAddressInput>) =>
    authenticated<CommerceAddress>(`/api/commerce/customer/addresses/${addressId}`, "PATCH", input),
  updateCartItem: (cartItemId: string, quantity: number, cartVersion: number) =>
    authenticated<CommerceCart>(`/api/commerce/customer/cart/items/${cartItemId}`, "PATCH", {
      cartVersion, quantity,
    }),
};

async function publicData<T>(
  path: string,
  params?: Record<string, boolean | string | number | undefined>,
  signal?: AbortSignal,
) {
  return (await mobileApiRequest<CommerceData<T>>(path, { params, signal })).data;
}

function publicCollection<T>(
  path: string,
  params?: Record<string, boolean | string | number | undefined>,
  signal?: AbortSignal,
) {
  return mobileApiRequest<CommerceCollection<T>>(path, { params, signal });
}

async function authenticated<T>(
  path: string,
  method: "DELETE" | "GET" | "PATCH" | "POST",
  body?: unknown,
  headers?: Record<string, string>,
) {
  return (await mobileApiRequest<CommerceData<T>>(path, {
    authenticated: true, body, headers, method,
  })).data;
}

function authenticatedCollection<T>(
  path: string,
  params?: Record<string, boolean | string | number | undefined>,
) {
  return mobileApiRequest<CommerceCollection<T>>(path, { authenticated: true, params });
}
