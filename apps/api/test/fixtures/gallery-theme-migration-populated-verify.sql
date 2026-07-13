DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum
        JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
        WHERE pg_type.typname = 'GalleryTheme'
          AND pg_enum.enumlabel = 'NOCTURNE'
    ) THEN
        RAISE EXCEPTION 'gallery theme migration did not create the preset enum';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "Tenant"
        WHERE "id" = 'tenant_default'
          AND "theme" = 'NOCTURNE'
          AND "albumCount" = 2
          AND "photoCount" = 2
          AND "storageUsedBytes" = 3072
          AND "storageReservedBytes" = 4096
    ) THEN
        RAISE EXCEPTION 'gallery theme migration changed populated tenant state';
    END IF;

    UPDATE "Tenant" SET "theme" = 'PAPER' WHERE "id" = 'tenant_default';
    IF NOT EXISTS (
        SELECT 1 FROM "Tenant"
        WHERE "id" = 'tenant_default' AND "theme" = 'PAPER'
    ) THEN
        RAISE EXCEPTION 'gallery theme preset is not writable';
    END IF;
END $$;
