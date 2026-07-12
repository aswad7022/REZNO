export interface PublicCategoryDto {
  displayOrder: number;
  id: string;
  name: string;
  slug: string;
}

export interface PublicStoreSummaryDto {
  coverImageUrl: string | null;
  currency: "IQD";
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
}

export interface PublicProductSummaryDto {
  category: PublicCategoryDto;
  currency: "IQD";
  description: string | null;
  highestPrice: string | null;
  id: string;
  inStock: boolean;
  lowestPrice: string;
  name: string;
  primaryMediaUrl: string | null;
  productSlug: string;
  slug: string;
  store: PublicStoreSummaryDto;
  storeSlug: string;
}

export interface PublicProductDetailDto extends PublicProductSummaryDto {
  media: Array<{
    altText: string | null;
    id: string;
    mediaType: "IMAGE" | "VIDEO";
    sortOrder: number;
    url: string;
  }>;
  variants: Array<{
    compareAtPrice: string | null;
    currency: "IQD";
    id: string;
    inStock: boolean;
    isDefault: boolean;
    optionValues: unknown;
    price: string;
    title: string;
  }>;
}

export interface PublicPageInfo {
  hasNextPage: boolean;
  nextCursor: string | null;
}
