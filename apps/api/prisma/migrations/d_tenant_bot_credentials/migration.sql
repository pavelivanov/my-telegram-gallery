-- Tenant-owned bot tokens are encrypted by the application before storage.
-- Public bot identity and Mini App short names remain available for links.
CREATE TABLE "TenantBotCredential" (
    "tenantId" TEXT NOT NULL,
    "telegramBotId" BIGINT NOT NULL,
    "username" TEXT NOT NULL,
    "adminAppShortName" TEXT NOT NULL,
    "galleryAppShortName" TEXT NOT NULL,
    "tokenCiphertext" BYTEA NOT NULL,
    "tokenIv" BYTEA NOT NULL,
    "tokenAuthTag" BYTEA NOT NULL,
    "keyId" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantBotCredential_pkey" PRIMARY KEY ("tenantId"),
    CONSTRAINT "TenantBotCredential_token_shape" CHECK (
        octet_length("tokenCiphertext") > 0 AND
        octet_length("tokenIv") = 12 AND
        octet_length("tokenAuthTag") = 16
    ),
    CONSTRAINT "TenantBotCredential_app_names" CHECK (
        "adminAppShortName" ~ '^[A-Za-z0-9_]{3,64}$' AND
        "galleryAppShortName" ~ '^[A-Za-z0-9_]{3,64}$'
    )
);

CREATE UNIQUE INDEX "TenantBotCredential_telegramBotId_key"
    ON "TenantBotCredential"("telegramBotId");
CREATE INDEX "TenantBotCredential_username_idx"
    ON "TenantBotCredential"("username");

ALTER TABLE "TenantBotCredential"
    ADD CONSTRAINT "TenantBotCredential_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
