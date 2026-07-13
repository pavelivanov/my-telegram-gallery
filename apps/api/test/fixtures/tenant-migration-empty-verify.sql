DO $$
BEGIN
    IF (SELECT COUNT(*) FROM "Tenant") <> 1 THEN
        RAISE EXCEPTION 'empty migration must create exactly one tenant';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM "Tenant"
        WHERE "id" = 'tenant_default'
          AND "slug" = 'default'
          AND "status" = 'ACTIVE'
          AND "plan" = 'FREE'
    ) THEN
        RAISE EXCEPTION 'empty migration did not create the stable default tenant';
    END IF;
    IF EXISTS (SELECT 1 FROM "TenantMembership") THEN
        RAISE EXCEPTION 'migration must not infer tenant memberships';
    END IF;
END $$;
