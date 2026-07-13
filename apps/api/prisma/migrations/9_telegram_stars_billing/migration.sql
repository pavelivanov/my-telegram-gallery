-- Telegram Stars billing is opt-in at runtime. The schema is safe to deploy
-- before a price, webhook, or production bot is configured.
CREATE TYPE "BillingCheckoutStatus" AS ENUM (
  'PENDING',
  'PRECHECKOUT_APPROVED',
  'PAID',
  'EXPIRED',
  'REJECTED'
);

CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'GRACE', 'EXPIRED');

CREATE TYPE "BillingRefundStatus" AS ENUM (
  'NONE',
  'PENDING',
  'REFUNDED',
  'FAILED'
);

CREATE TYPE "TelegramUpdateStatus" AS ENUM (
  'PROCESSING',
  'PROCESSED',
  'REJECTED',
  'RETRYABLE'
);

ALTER TYPE "OperatorAuditAction" ADD VALUE 'PAYMENT_REFUNDED';

CREATE TABLE "BillingCheckout" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "payerTgUserId" BIGINT NOT NULL,
  "plan" "TenantPlan" NOT NULL,
  "expectedStars" INTEGER NOT NULL,
  "status" "BillingCheckoutStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "preCheckoutQueryId" TEXT,
  "preCheckoutApprovedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingCheckout_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingCheckout_expectedStars_check"
    CHECK ("expectedStars" BETWEEN 1 AND 10000)
);

CREATE TABLE "Subscription" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "payerTgUserId" BIGINT NOT NULL,
  "plan" "TenantPlan" NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "telegramPaymentChargeId" TEXT,
  "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
  "graceEndsAt" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "lastPaymentAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramUpdate" (
  "id" TEXT NOT NULL,
  "updateId" BIGINT,
  "type" TEXT NOT NULL,
  "status" "TelegramUpdateStatus" NOT NULL DEFAULT 'PROCESSING',
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "errorSummary" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramUpdate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TelegramUpdate_attempts_check" CHECK ("attempts" > 0)
);

CREATE TABLE "BillingPayment" (
  "id" TEXT NOT NULL,
  "telegramPaymentChargeId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "checkoutId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "telegramUpdateId" TEXT,
  "payerTgUserId" BIGINT NOT NULL,
  "plan" "TenantPlan" NOT NULL,
  "amountStars" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "isRecurring" BOOLEAN NOT NULL,
  "isFirstRecurring" BOOLEAN NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "refundStatus" "BillingRefundStatus" NOT NULL DEFAULT 'NONE',
  "refundReason" TEXT,
  "refundErrorSummary" TEXT,
  "refundedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingPayment_amountStars_check"
    CHECK ("amountStars" BETWEEN 1 AND 10000),
  CONSTRAINT "BillingPayment_currency_check" CHECK ("currency" = 'XTR')
);

CREATE UNIQUE INDEX "Subscription_tenantId_key" ON "Subscription"("tenantId");
CREATE UNIQUE INDEX "BillingCheckout_preCheckoutQueryId_key"
  ON "BillingCheckout"("preCheckoutQueryId");
CREATE UNIQUE INDEX "Subscription_telegramPaymentChargeId_key"
  ON "Subscription"("telegramPaymentChargeId");
CREATE UNIQUE INDEX "TelegramUpdate_updateId_key" ON "TelegramUpdate"("updateId");
CREATE UNIQUE INDEX "BillingPayment_telegramPaymentChargeId_key"
  ON "BillingPayment"("telegramPaymentChargeId");
CREATE UNIQUE INDEX "BillingPayment_telegramUpdateId_key"
  ON "BillingPayment"("telegramUpdateId");

CREATE INDEX "BillingCheckout_tenantId_status_expiresAt_idx"
  ON "BillingCheckout"("tenantId", "status", "expiresAt");
CREATE INDEX "BillingCheckout_payerTgUserId_createdAt_idx"
  ON "BillingCheckout"("payerTgUserId", "createdAt");
CREATE INDEX "Subscription_status_currentPeriodEnd_idx"
  ON "Subscription"("status", "currentPeriodEnd");
CREATE INDEX "Subscription_payerTgUserId_idx"
  ON "Subscription"("payerTgUserId");
CREATE INDEX "TelegramUpdate_status_updatedAt_idx"
  ON "TelegramUpdate"("status", "updatedAt");
CREATE INDEX "BillingPayment_tenantId_paidAt_idx"
  ON "BillingPayment"("tenantId", "paidAt");
CREATE INDEX "BillingPayment_checkoutId_idx" ON "BillingPayment"("checkoutId");
CREATE INDEX "BillingPayment_subscriptionId_periodEnd_idx"
  ON "BillingPayment"("subscriptionId", "periodEnd");

ALTER TABLE "BillingCheckout"
  ADD CONSTRAINT "BillingCheckout_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BillingPayment"
  ADD CONSTRAINT "BillingPayment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BillingPayment"
  ADD CONSTRAINT "BillingPayment_checkoutId_fkey"
  FOREIGN KEY ("checkoutId") REFERENCES "BillingCheckout"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BillingPayment"
  ADD CONSTRAINT "BillingPayment_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BillingPayment"
  ADD CONSTRAINT "BillingPayment_telegramUpdateId_fkey"
  FOREIGN KEY ("telegramUpdateId") REFERENCES "TelegramUpdate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
