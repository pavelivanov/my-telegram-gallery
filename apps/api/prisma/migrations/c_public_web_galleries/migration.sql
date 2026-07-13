-- Public browser access is opt-in through a revocable opaque identifier.
ALTER TABLE "Tenant" ADD COLUMN "publicShareId" TEXT;
CREATE UNIQUE INDEX "Tenant_publicShareId_key" ON "Tenant"("publicShareId");

-- Browser reports retain no raw IP address. The application stores only a
-- keyed fingerprint, while Telegram reports keep their numeric user identity.
ALTER TABLE "Report" ALTER COLUMN "reporterTgUserId" DROP NOT NULL;
ALTER TABLE "Report" ADD COLUMN "reporterFingerprint" TEXT;
ALTER TABLE "Report" ADD CONSTRAINT "Report_exactly_one_reporter_identity" CHECK (
    (("reporterTgUserId" IS NOT NULL)::INTEGER +
     ("reporterFingerprint" IS NOT NULL)::INTEGER) = 1
);
ALTER TABLE "Report" ADD CONSTRAINT "Report_fingerprint_format" CHECK (
    "reporterFingerprint" IS NULL OR
    "reporterFingerprint" ~ '^[0-9a-f]{64}$'
);
CREATE INDEX "Report_reporterFingerprint_createdAt_idx"
    ON "Report"("reporterFingerprint", "createdAt");
CREATE UNIQUE INDEX "Report_one_open_per_fingerprint_target" ON "Report"(
    "reporterFingerprint",
    "tenantId",
    COALESCE("albumId", ''),
    COALESCE("photoId", '')
) WHERE "status" = 'OPEN' AND "reporterFingerprint" IS NOT NULL;
