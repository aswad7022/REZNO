import { mobileApiGet } from "./client";
import type { MobileMarketplaceResponse } from "../types/marketplace";

export type MobileMarketplaceQuery = {
  q?: string;
  category?: string;
  city?: string;
  vertical?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  limit?: number;
};

export function fetchMobileMarketplace(query?: MobileMarketplaceQuery) {
  return mobileApiGet<MobileMarketplaceResponse>(
    "/api/mobile/marketplace",
    query,
  );
}
