-- Seed the minimum platform-owned category required for service creation.
INSERT INTO "Category" ("id", "name", "slug", "createdAt", "updatedAt")
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'General',
  'general',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;
