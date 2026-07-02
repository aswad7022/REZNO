-- Add branch-level map/location metadata without changing existing address behavior.
ALTER TABLE "Branch"
  ADD COLUMN IF NOT EXISTS "locationLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "nearbyLandmark" TEXT,
  ADD COLUMN IF NOT EXISTS "locationInstructions" TEXT;

CREATE INDEX IF NOT EXISTS "Branch_latitude_longitude_idx" ON "Branch"("latitude", "longitude");
