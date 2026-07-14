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
        RAISE EXCEPTION 'tenant bot migration changed populated tenant state';
    END IF;

    INSERT INTO "TenantBotCredential" (
        "tenantId",
        "telegramBotId",
        "username",
        "adminAppShortName",
        "galleryAppShortName",
        "tokenCiphertext",
        "tokenIv",
        "tokenAuthTag",
        "keyId",
        "verifiedAt",
        "updatedAt"
    ) VALUES (
        'tenant_default',
        700000001,
        'migration_gallery_bot',
        'admin_app',
        'gallery_app',
        decode('01', 'hex'),
        decode(repeat('02', 12), 'hex'),
        decode(repeat('03', 16), 'hex'),
        'migration-key',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    );

    IF NOT EXISTS (
        SELECT 1 FROM "TenantBotCredential"
        WHERE "tenantId" = 'tenant_default'
          AND "telegramBotId" = 700000001
          AND octet_length("tokenIv") = 12
          AND octet_length("tokenAuthTag") = 16
    ) THEN
        RAISE EXCEPTION 'tenant bot credential is not writable';
    END IF;
END $$;
