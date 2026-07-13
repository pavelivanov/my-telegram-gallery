DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "Tenant"
        WHERE "id" = 'tenant_default'
          AND "publicShareId" IS NULL
          AND "theme" = 'PAPER'
          AND "albumCount" = 2
          AND "photoCount" = 2
          AND "storageUsedBytes" = 3072
          AND "storageReservedBytes" = 4096
    ) THEN
        RAISE EXCEPTION 'public web migration changed populated tenant state';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Report_exactly_one_reporter_identity'
    ) THEN
        RAISE EXCEPTION 'public report identity constraint is missing';
    END IF;

    INSERT INTO "Report" (
        "id",
        "tenantId",
        "reporterFingerprint",
        "reason",
        "updatedAt"
    ) VALUES (
        'public_migration_report',
        'tenant_default',
        repeat('a', 64),
        'OTHER',
        CURRENT_TIMESTAMP
    );

    IF NOT EXISTS (
        SELECT 1 FROM "Report"
        WHERE "id" = 'public_migration_report'
          AND "reporterTgUserId" IS NULL
          AND "reporterFingerprint" = repeat('a', 64)
    ) THEN
        RAISE EXCEPTION 'anonymous public report identity is not writable';
    END IF;
END $$;
