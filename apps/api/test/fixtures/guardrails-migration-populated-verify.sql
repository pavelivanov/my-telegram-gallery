DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "Tenant"
        WHERE "id" = 'tenant_default'
          AND "albumCount" = 2
          AND "photoCount" = 2
          AND "storageUsedBytes" = 3072
          AND "storageReservedBytes" = 4096
    ) THEN
        RAISE EXCEPTION 'tenant usage counters do not match fixture aggregates';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "Photo"
        WHERE "storedBytes" <> "size"::BIGINT
    ) THEN
        RAISE EXCEPTION 'photo stored byte backfill is not conservative';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "UploadIntent"
        WHERE "id" = 'legacy_intent_pending'
          AND "reservedBytes" = 4096
          AND "reservationReleasedAt" IS NULL
    ) OR NOT EXISTS (
        SELECT 1 FROM "UploadIntent"
        WHERE "id" = 'legacy_intent_confirmed'
          AND "reservedBytes" = 0
          AND "reservationReleasedAt" IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'upload reservation backfill is incorrect';
    END IF;
END $$;
