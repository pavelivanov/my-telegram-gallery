ALTER TYPE "TenantPlan" ADD VALUE 'PRO';

ALTER TABLE "Tenant"
    ADD COLUMN "storageUsedBytes" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "storageReservedBytes" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "albumCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "photoCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Photo"
    ADD COLUMN "storedBytes" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "UploadIntent"
    ADD COLUMN "reservedBytes" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "reservationReleasedAt" TIMESTAMP(3);

UPDATE "Photo"
SET "storedBytes" = GREATEST("size"::BIGINT, 0);

UPDATE "UploadIntent"
SET
    "reservedBytes" = CASE
        WHEN "status" IN ('PENDING', 'UPLOADED') AND "expiresAt" > CURRENT_TIMESTAMP
            THEN GREATEST("expectedSize"::BIGINT, 0)
        ELSE 0
    END,
    "reservationReleasedAt" = CASE
        WHEN "status" IN ('PENDING', 'UPLOADED') AND "expiresAt" > CURRENT_TIMESTAMP
            THEN NULL
        ELSE COALESCE("updatedAt", CURRENT_TIMESTAMP)
    END;

UPDATE "Tenant" tenant
SET
    "albumCount" = counts."albumCount",
    "photoCount" = counts."photoCount",
    "storageUsedBytes" = counts."storageUsedBytes",
    "storageReservedBytes" = counts."storageReservedBytes"
FROM (
    SELECT
        tenant_source."id",
        (SELECT COUNT(*)::INTEGER FROM "Album" album WHERE album."tenantId" = tenant_source."id") AS "albumCount",
        (SELECT COUNT(*)::INTEGER FROM "Photo" photo WHERE photo."tenantId" = tenant_source."id") AS "photoCount",
        COALESCE((SELECT SUM(photo."storedBytes") FROM "Photo" photo WHERE photo."tenantId" = tenant_source."id"), 0) AS "storageUsedBytes",
        COALESCE((SELECT SUM(intent."reservedBytes") FROM "UploadIntent" intent WHERE intent."tenantId" = tenant_source."id"), 0) AS "storageReservedBytes"
    FROM "Tenant" tenant_source
) counts
WHERE tenant."id" = counts."id";

ALTER TABLE "Tenant"
    ADD CONSTRAINT "Tenant_storageUsedBytes_nonnegative" CHECK ("storageUsedBytes" >= 0),
    ADD CONSTRAINT "Tenant_storageReservedBytes_nonnegative" CHECK ("storageReservedBytes" >= 0),
    ADD CONSTRAINT "Tenant_albumCount_nonnegative" CHECK ("albumCount" >= 0),
    ADD CONSTRAINT "Tenant_photoCount_nonnegative" CHECK ("photoCount" >= 0);

ALTER TABLE "Photo"
    ADD CONSTRAINT "Photo_storedBytes_nonnegative" CHECK ("storedBytes" >= 0);

ALTER TABLE "UploadIntent"
    ADD CONSTRAINT "UploadIntent_reservedBytes_nonnegative" CHECK ("reservedBytes" >= 0);

CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'ILLEGAL_CONTENT', 'HARASSMENT', 'COPYRIGHT', 'OTHER');
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');
CREATE TYPE "OperatorAuditAction" AS ENUM ('TENANT_SUSPENDED', 'TENANT_UNSUSPENDED', 'REPORT_RESOLVED', 'REPORT_DISMISSED');

CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reporterTgUserId" BIGINT NOT NULL,
    "albumId" TEXT,
    "photoId" TEXT,
    "reason" "ReportReason" NOT NULL,
    "detail" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "staffNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperatorAudit" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" "OperatorAuditAction" NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportId" TEXT,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperatorAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Report_tenantId_status_createdAt_idx" ON "Report"("tenantId", "status", "createdAt");
CREATE INDEX "Report_reporterTgUserId_createdAt_idx" ON "Report"("reporterTgUserId", "createdAt");
CREATE UNIQUE INDEX "Report_one_open_per_reporter_target" ON "Report"(
    "reporterTgUserId",
    "tenantId",
    COALESCE("albumId", ''),
    COALESCE("photoId", '')
) WHERE "status" = 'OPEN';
CREATE INDEX "OperatorAudit_tenantId_createdAt_idx" ON "OperatorAudit"("tenantId", "createdAt");
CREATE INDEX "OperatorAudit_reportId_createdAt_idx" ON "OperatorAudit"("reportId", "createdAt");
CREATE UNIQUE INDEX "Photo_id_tenantId_key" ON "Photo"("id", "tenantId");

ALTER TABLE "Report" ADD CONSTRAINT "Report_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_albumId_tenantId_fkey"
    FOREIGN KEY ("albumId", "tenantId") REFERENCES "Album"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_photoId_tenantId_fkey"
    FOREIGN KEY ("photoId", "tenantId") REFERENCES "Photo"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperatorAudit" ADD CONSTRAINT "OperatorAudit_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperatorAudit" ADD CONSTRAINT "OperatorAudit_reportId_fkey"
    FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
