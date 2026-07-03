import type {
  BusinessType,
  BusinessVertical,
  StaffSelectionMode,
} from "@prisma/client";

export interface MarketplaceOffering {
  id: string;
  serviceName: string;
  description: string | null;
  imageUrl: string | null;
  categoryName: string;
  branchName: string;
  price: string;
  durationMinutes: number;
  staffSelectionMode: StaffSelectionMode;
  assignedEmployees: string[];
}

export interface MarketplaceBusiness {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  city: string | null;
  categoryName: string | null;
  matchingServiceName: string | null;
  matchingServicePrice: string | null;
  serviceCount: number;
  startingPrice: string | null;
  vertical: BusinessVertical;
  hasMenu: boolean;
  hasTables: boolean;
  averageRating: number | null;
  reviewCount: number;
  distanceKm: number | null;
  branchLatitude: number | null;
  branchLongitude: number | null;
  branchLocationLabel: string | null;
  branchNearbyLandmark: string | null;
}

export interface PublicBusinessProfile extends MarketplaceBusiness {
  businessType: BusinessType;
  website: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  whatsappPhone: string | null;
  googleMapsUrl: string | null;
  bookingPolicy: string | null;
  galleryUrls: string[];
  faqItems: Array<{ question: string; answer: string }>;
  facebookUrl: string | null;
  instagramUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
  menuCategories: Array<{
    id: string;
    name: string;
    description: string | null;
    items: Array<{
      id: string;
      name: string;
      description: string | null;
      price: string;
      currency: string;
      imageUrl: string | null;
      isAvailable: boolean;
      preparationMinutes: number | null;
    }>;
  }>;
  seatingAreas: string[];
  recentReviews: Array<{
    id: string;
    rating: number;
    comment: string;
    customerName: string;
  }>;
  branches: Array<{
    id: string;
    name: string;
    city: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    locationLabel: string | null;
    nearbyLandmark: string | null;
    locationInstructions: string | null;
    workingHours: Array<{
      dayOfWeek: number;
      openTime: string;
      closeTime: string;
    }>;
    specialClosures: Array<{
      id: string;
      startsAt: Date;
      endsAt: Date;
      reason: string | null;
    }>;
    offerings: MarketplaceOffering[];
  }>;
  team: Array<{
    id: string;
    name: string;
    photoUrl: string | null;
    bio: string | null;
    specialties: string[];
  }>;
}
