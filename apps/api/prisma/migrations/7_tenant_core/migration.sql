CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "TenantPlan" AS ENUM ('FREE');
CREATE TYPE "TenantRole" AS ENUM ('OWNER');

CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "plan" "TenantPlan" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantMembership" (
    "tenantId" TEXT NOT NULL,
    "tgUserId" BIGINT NOT NULL,
    "role" "TenantRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("tenantId", "tgUserId")
);

CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
CREATE INDEX "TenantMembership_tgUserId_idx" ON "TenantMembership"("tgUserId");

INSERT INTO "Tenant" (
    "id",
    "slug",
    "name",
    "status",
    "plan",
    "createdAt",
    "updatedAt"
) VALUES (
    'tenant_default',
    'default',
    'Default gallery',
    'ACTIVE',
    'FREE',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

ALTER TABLE "Album" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Photo" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "UploadIntent" ADD COLUMN "tenantId" TEXT;

UPDATE "Album" SET "tenantId" = 'tenant_default';

UPDATE "Photo" AS photo
SET "tenantId" = album."tenantId"
FROM "Album" AS album
WHERE photo."albumId" = album."id";

UPDATE "UploadIntent" AS intent
SET "tenantId" = album."tenantId"
FROM "Album" AS album
WHERE intent."albumId" = album."id";

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "Album" WHERE "tenantId" IS NULL) THEN
        RAISE EXCEPTION 'tenant migration left albums without a tenant';
    END IF;
    IF EXISTS (SELECT 1 FROM "Photo" WHERE "tenantId" IS NULL) THEN
        RAISE EXCEPTION 'tenant migration left photos without a tenant';
    END IF;
    IF EXISTS (SELECT 1 FROM "UploadIntent" WHERE "tenantId" IS NULL) THEN
        RAISE EXCEPTION 'tenant migration left upload intents without a tenant';
    END IF;
END $$;

ALTER TABLE "Album" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Photo" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "UploadIntent" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Photo" DROP CONSTRAINT "Photo_albumId_fkey";
ALTER TABLE "UploadIntent" DROP CONSTRAINT "UploadIntent_albumId_fkey";

DROP INDEX "Album_createdAt_idx";
DROP INDEX "Photo_albumId_position_idx";
DROP INDEX "UploadIntent_status_expiresAt_idx";
DROP INDEX "UploadIntent_albumId_idx";

CREATE UNIQUE INDEX "Album_id_tenantId_key" ON "Album"("id", "tenantId");
CREATE INDEX "Album_tenantId_createdAt_idx" ON "Album"("tenantId", "createdAt");
CREATE INDEX "Photo_tenantId_albumId_position_idx" ON "Photo"("tenantId", "albumId", "position");
CREATE INDEX "UploadIntent_tenantId_status_expiresAt_idx" ON "UploadIntent"("tenantId", "status", "expiresAt");
CREATE INDEX "UploadIntent_tenantId_albumId_idx" ON "UploadIntent"("tenantId", "albumId");

ALTER TABLE "TenantMembership"
ADD CONSTRAINT "TenantMembership_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Album"
ADD CONSTRAINT "Album_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Photo"
ADD CONSTRAINT "Photo_albumId_tenantId_fkey"
FOREIGN KEY ("albumId", "tenantId") REFERENCES "Album"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UploadIntent"
ADD CONSTRAINT "UploadIntent_albumId_tenantId_fkey"
FOREIGN KEY ("albumId", "tenantId") REFERENCES "Album"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
