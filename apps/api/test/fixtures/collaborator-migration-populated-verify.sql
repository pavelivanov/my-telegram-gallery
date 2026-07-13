DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum
        JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
        WHERE pg_type.typname = 'TenantRole'
          AND pg_enum.enumlabel = 'ADMIN'
    ) THEN
        RAISE EXCEPTION 'collaborator migration did not add ADMIN role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "TenantMembership" WHERE "role" <> 'OWNER'
    ) THEN
        RAISE EXCEPTION 'collaborator migration changed an existing owner role';
    END IF;
END $$;
