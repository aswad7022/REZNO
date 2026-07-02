import type { BusinessType } from "@prisma/client";

export interface BusinessProfileDetails {
  name: string;
  slug: string;
  businessType: BusinessType;
  businessCategory: string;
  isVerified: boolean;
  legalName: string;
  description: string;
  website: string;
  logoUrl: string;
  coverImageUrl: string;
  businessEmail: string;
  businessPhone: string;
  whatsappPhone: string;
  googleMapsUrl: string;
  bookingPolicy: string;
  galleryUrls: string[];
  faqItems: Array<{ question: string; answer: string }>;
  seoTitle: string;
  seoDescription: string;
  ogImageUrl: string;
  visibility: "PUBLISHED" | "HIDDEN";
  facebookUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
  youtubeUrl: string;
  roleName: string;
  canEdit: boolean;
}

export type BusinessProfileField =
  | "name"
  | "slug"
  | "businessType"
  | "businessCategory"
  | "legalName"
  | "description"
  | "website"
  | "logoUrl"
  | "coverImageUrl"
  | "businessEmail"
  | "businessPhone"
  | "whatsappPhone"
  | "googleMapsUrl"
  | "bookingPolicy"
  | "galleryUrls"
  | "faqItems"
  | "seoTitle"
  | "seoDescription"
  | "ogImageUrl"
  | "visibility"
  | "facebookUrl"
  | "instagramUrl"
  | "tiktokUrl"
  | "youtubeUrl";

export interface BusinessProfileActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<BusinessProfileField, string>>;
}

export const initialBusinessProfileActionState: BusinessProfileActionState = {
  status: "idle",
};
