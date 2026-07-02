-- AlterTable
ALTER TABLE "BusinessProfile"
ADD COLUMN "whatsappPhone" TEXT,
ADD COLUMN "googleMapsUrl" TEXT,
ADD COLUMN "bookingPolicy" TEXT,
ADD COLUMN "faqItems" JSONB,
ADD COLUMN "galleryUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "seoTitle" TEXT,
ADD COLUMN "seoDescription" TEXT,
ADD COLUMN "ogImageUrl" TEXT;

-- AlterTable
ALTER TABLE "OrganizationMember"
ADD COLUMN "photoUrl" TEXT,
ADD COLUMN "bio" TEXT,
ADD COLUMN "specialties" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
