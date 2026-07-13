DO $$
BEGIN
    IF (SELECT COUNT(*) FROM "Album" WHERE "tenantId" = 'tenant_default') <> 2 THEN
        RAISE EXCEPTION 'legacy albums were not assigned to the default tenant';
    END IF;
    IF (SELECT COUNT(*) FROM "Photo" WHERE "tenantId" = 'tenant_default') <> 2 THEN
        RAISE EXCEPTION 'legacy photos were not assigned to the default tenant';
    END IF;
    IF (SELECT COUNT(*) FROM "UploadIntent" WHERE "tenantId" = 'tenant_default') <> 2 THEN
        RAISE EXCEPTION 'legacy upload intents were not assigned to the default tenant';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM "Photo"
        WHERE "id" = 'legacy_photo_variants'
          AND "thumbKey" = 'photos/legacy/thumb.webp'
          AND "previewKey" = 'photos/legacy/preview.webp'
    ) THEN
        RAISE EXCEPTION 'photo variants changed during tenant backfill';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "UploadIntent"
        WHERE "id" = 'legacy_intent_pending' AND "status" = 'PENDING'
    ) OR NOT EXISTS (
        SELECT 1 FROM "UploadIntent"
        WHERE "id" = 'legacy_intent_confirmed'
          AND "status" = 'CONFIRMED'
          AND "photoId" = 'legacy_photo_variants'
    ) THEN
        RAISE EXCEPTION 'upload intent state changed during tenant backfill';
    END IF;
    IF EXISTS (SELECT 1 FROM "TenantMembership") THEN
        RAISE EXCEPTION 'migration must not infer tenant memberships';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Photo_albumId_tenantId_fkey'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'UploadIntent_albumId_tenantId_fkey'
    ) THEN
        RAISE EXCEPTION 'composite tenant constraints are missing';
    END IF;
END $$;
