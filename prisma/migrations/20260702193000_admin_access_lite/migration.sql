-- Admin Access Lite: non-destructive platform admin access table.
CREATE TYPE "AdminAccessRole" AS ENUM ('ADMIN', 'SUPER_ADMIN');
CREATE TYPE "AdminAccessStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

CREATE TABLE "AdminAccess" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "role" "AdminAccessRole" NOT NULL DEFAULT 'ADMIN',
    "status" "AdminAccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "grantedById" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AdminAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminAccess_userId_key" ON "AdminAccess"("userId");
CREATE INDEX "AdminAccess_userId_idx" ON "AdminAccess"("userId");
CREATE INDEX "AdminAccess_status_idx" ON "AdminAccess"("status");
CREATE INDEX "AdminAccess_role_idx" ON "AdminAccess"("role");

ALTER TABLE "AdminAccess" ADD CONSTRAINT "AdminAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminAccess" ADD CONSTRAINT "AdminAccess_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
