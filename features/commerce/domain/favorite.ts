import { publicQueryFingerprint } from "@/features/commerce/public/cursor";

export function favoriteFingerprint(customerId: string, collection: "products" | "stores") {
  return publicQueryFingerprint({ collection, customerId, scope: "customer-favorites" });
}
