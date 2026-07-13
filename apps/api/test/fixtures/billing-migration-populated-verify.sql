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
        RAISE EXCEPTION 'billing migration changed tenant usage state';
    END IF;
    IF EXISTS (SELECT 1 FROM "BillingCheckout")
       OR EXISTS (SELECT 1 FROM "Subscription")
       OR EXISTS (SELECT 1 FROM "BillingPayment")
       OR EXISTS (SELECT 1 FROM "TelegramUpdate") THEN
        RAISE EXCEPTION 'billing migration must not infer payment state';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'PAYMENT_REFUNDED'
          AND enumtypid = '"OperatorAuditAction"'::regtype
    ) THEN
        RAISE EXCEPTION 'refund audit action is missing';
    END IF;
END $$;
