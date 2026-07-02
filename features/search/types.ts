import type { BusinessVertical } from "@prisma/client";

export interface NormalizedSearchQuery {
  raw: string;
  normalized: string;
  terms: string[];
  inferredVerticals: BusinessVertical[];
}

export interface SearchableBusinessSnapshot {
  name: string;
  slug: string;
  description: string | null;
  categoryName: string | null;
  vertical: BusinessVertical;
  branches: Array<{
    name: string;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    locationLabel: string | null;
    nearbyLandmark: string | null;
    locationInstructions: string | null;
  }>;
  services: Array<{
    name: string;
    description: string | null;
    categoryName: string | null;
  }>;
  menuItems: Array<{
    name: string;
    description: string | null;
  }>;
}
