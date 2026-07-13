import {
  BadGatewayException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingCheckoutStatus,
  BillingRefundStatus,
  OperatorAuditAction,
  Prisma,
  SubscriptionStatus,
  TenantPlan,
  TenantStatus,
  type BillingCheckout,
} from '../../generated/prisma/client';
import { PAID_PLAN_GRACE_DAYS, getPlanPolicy } from '../plans/plan-policy';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from '../quota/quota.service';
import {
  TelegramApiError,
  TelegramApiService,
} from '../telegram/telegram-api.service';
import type {
  TelegramMessage,
  TelegramPreCheckoutQuery,
} from '../telegram/telegram.types';
import type { TenantContext } from '../tenants/tenant-context';
import { BillingAccessService } from './billing-access.service';
import {
  BillingException,
  PermanentBillingEventError,
  RetryableBillingEventError,
} from './billing.errors';
import { EntitlementService } from './entitlement.service';

const DAY_MS = 24 * 60 * 60 * 1000;
// Telegram allows 10 seconds from query creation. Keep the app-side worst case
// below 6.75 seconds so inbound webhook and scheduling latency have headroom.
const PRECHECKOUT_LOOKUP_TIMEOUT_MS = 500;
const PRECHECKOUT_LOCK_TIMEOUT_MS = 1250;
const PRECHECKOUT_TRANSACTION_MAX_WAIT_MS = 250;
const PRECHECKOUT_TRANSACTION_TIMEOUT_MS = 1750;
const PRECHECKOUT_TRANSACTION_WATCHDOG_MS = 2250;
const PRECHECKOUT_TELEGRAM_TIMEOUT_MS = 4000;

class PreCheckoutDeadlineError extends Error {
  constructor() {
    super('pre-checkout deadline exceeded');
    this.name = 'PreCheckoutDeadlineError';
  }
}

async function withPreCheckoutDeadline<T>(
  work: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new PreCheckoutDeadlineError()),
      timeoutMs,
    );
    timeout.unref?.();
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

interface BillingRuntimeConfig {
  priceStars: number;
  privacyUrl: string;
  supportContact: string;
  termsUrl: string;
}

interface ExpiryOptions {
  dryRun: boolean;
  limit: number;
  tenantSlug?: string;
}

function asTelegramUserId(value: unknown): bigint {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new PermanentBillingEventError('invalid Telegram payer ID');
  }
  return BigInt(value);
}

function boundedString(
  value: unknown,
  label: string,
  maximumBytes: number,
): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Buffer.byteLength(value, 'utf8') > maximumBytes
  ) {
    throw new PermanentBillingEventError(`invalid ${label}`);
  }
  return value;
}

function unixDate(value: unknown, label: string): Date {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new PermanentBillingEventError(`invalid ${label}`);
  }
  const date = new Date(value * 1000);
  if (!Number.isFinite(date.getTime())) {
    throw new PermanentBillingEventError(`invalid ${label}`);
  }
  return date;
}

function assertPaymentMatchesCheckout(
  checkout: BillingCheckout,
  input: {
    amountStars: number;
    currency: string;
    payerTgUserId: bigint;
  },
): void {
  if (
    checkout.plan !== TenantPlan.PRO ||
    checkout.expectedStars !== input.amountStars ||
    input.currency !== 'XTR' ||
    checkout.payerTgUserId !== input.payerTgUserId
  ) {
    throw new PermanentBillingEventError('payment authority mismatch');
  }
}

@Injectable()
export class BillingService {
  private readonly checkoutTtlSeconds: number;
  private readonly priceStars?: number;
  private readonly privacyUrl?: string;
  private readonly supportContact?: string;
  private readonly termsUrl?: string;
  private readonly testMode: boolean;
  private readonly webhookConfigured: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
    private readonly access: BillingAccessService,
    private readonly entitlements: EntitlementService,
    private readonly telegram: TelegramApiService,
    config: ConfigService,
  ) {
    this.checkoutTtlSeconds = config.getOrThrow<number>(
      'BILLING_CHECKOUT_TTL_SECONDS',
    );
    this.priceStars = config.get<number>('BILLING_PRO_PRICE_STARS');
    this.privacyUrl = config.get<string>('BILLING_PRIVACY_URL');
    this.supportContact = config.get<string>('PAY_SUPPORT_CONTACT');
    this.termsUrl = config.get<string>('BILLING_TERMS_URL');
    this.testMode = config.getOrThrow<boolean>('TELEGRAM_BOT_API_TEST_MODE');
    this.webhookConfigured = Boolean(
      config.get<string>('TELEGRAM_WEBHOOK_SECRET'),
    );
  }

  async getState(context: TenantContext, payerId: number) {
    const payerTgUserId = asTelegramUserId(payerId);
    const result = await this.prisma.$transaction(async (transaction) => {
      await this.access.assertOwnerExists(
        transaction,
        context.id,
        payerTgUserId,
      );
      const tenant = await transaction.tenant.findUniqueOrThrow({
        where: { id: context.id },
      });
      const subscription = await transaction.subscription.findUnique({
        where: { tenantId: context.id },
      });
      return { subscription, tenant };
    });
    return this.serializeState(result.tenant, result.subscription);
  }

  async createCheckout(context: TenantContext, payerId: number) {
    const config = this.requireConfigured();
    const payerTgUserId = asTelegramUserId(payerId);
    const now = new Date();
    const prepared = await this.quota.withTenantLock(
      context.id,
      async (transaction, tenant) => {
        await this.access.assertOwner(transaction, tenant.id, payerTgUserId);
        if (tenant.status !== TenantStatus.ACTIVE) {
          throw new ForbiddenException('Active tenant required');
        }
        const subscription = await transaction.subscription.findUnique({
          where: { tenantId: tenant.id },
        });
        if (subscription && this.subscriptionStillEntitled(subscription, now)) {
          return { current: this.serializeState(tenant, subscription) };
        }
        if (
          subscription &&
          subscription.status !== SubscriptionStatus.EXPIRED
        ) {
          await this.entitlements.downgrade(
            transaction,
            subscription.id,
            tenant.id,
          );
        }
        const approvedCheckout = await transaction.billingCheckout.findFirst({
          where: {
            tenantId: tenant.id,
            status: BillingCheckoutStatus.PRECHECKOUT_APPROVED,
            expiresAt: { gt: now },
          },
          select: { id: true },
        });
        if (approvedCheckout) {
          throw new BillingException('BILLING_CHECKOUT_IN_PROGRESS');
        }
        await transaction.billingCheckout.updateMany({
          where: {
            tenantId: tenant.id,
            status: BillingCheckoutStatus.PENDING,
          },
          data: { status: BillingCheckoutStatus.REJECTED },
        });
        await transaction.billingCheckout.updateMany({
          where: {
            tenantId: tenant.id,
            status: BillingCheckoutStatus.PRECHECKOUT_APPROVED,
            expiresAt: { lte: now },
          },
          data: { status: BillingCheckoutStatus.EXPIRED },
        });
        const checkout = await transaction.billingCheckout.create({
          data: {
            tenantId: tenant.id,
            payerTgUserId,
            plan: TenantPlan.PRO,
            expectedStars: config.priceStars,
            expiresAt: new Date(now.getTime() + this.checkoutTtlSeconds * 1000),
          },
        });
        return { checkout };
      },
    );

    if ('current' in prepared) {
      return { invoiceUrl: null, expiresAt: null, billing: prepared.current };
    }

    try {
      const invoiceUrl = await this.telegram.createInvoiceLink({
        amountStars: prepared.checkout.expectedStars,
        payload: prepared.checkout.id,
      });
      return {
        invoiceUrl,
        expiresAt: prepared.checkout.expiresAt,
        billing: null,
      };
    } catch (error) {
      await this.prisma.billingCheckout.updateMany({
        where: {
          id: prepared.checkout.id,
          status: BillingCheckoutStatus.PENDING,
        },
        data: { status: BillingCheckoutStatus.REJECTED },
      });
      if (error instanceof TelegramApiError) {
        throw new BadGatewayException('Telegram could not create the invoice');
      }
      throw error;
    }
  }

  async handlePreCheckout(query: TelegramPreCheckoutQuery): Promise<void> {
    const queryId = boundedString(query?.id, 'pre-checkout query ID', 256);
    let rejection: PermanentBillingEventError | undefined;

    try {
      const payerTgUserId = asTelegramUserId(query?.from?.id);
      const payload = boundedString(
        query?.invoice_payload,
        'invoice payload',
        128,
      );
      if (
        typeof query?.currency !== 'string' ||
        typeof query?.total_amount !== 'number' ||
        !Number.isSafeInteger(query.total_amount)
      ) {
        throw new PermanentBillingEventError('invalid pre-checkout amount');
      }
      const located = await withPreCheckoutDeadline(
        this.prisma.billingCheckout.findUnique({
          where: { id: payload },
          select: { tenantId: true },
        }),
        PRECHECKOUT_LOOKUP_TIMEOUT_MS,
      );
      if (!located) {
        throw new PermanentBillingEventError('checkout not found');
      }
      await withPreCheckoutDeadline(
        this.quota.withTenantLock(
          located.tenantId,
          async (transaction, tenant) => {
            const loaded = await transaction.billingCheckout.findUnique({
              where: { id: payload },
            });
            if (!loaded) {
              throw new PermanentBillingEventError('checkout not found');
            }
            if (
              (loaded.status !== BillingCheckoutStatus.PENDING &&
                loaded.status !== BillingCheckoutStatus.PRECHECKOUT_APPROVED) ||
              loaded.expiresAt <= new Date() ||
              (loaded.preCheckoutQueryId !== null &&
                loaded.preCheckoutQueryId !== queryId)
            ) {
              throw new PermanentBillingEventError(
                'checkout expired or closed',
              );
            }
            assertPaymentMatchesCheckout(loaded, {
              amountStars: query.total_amount,
              currency: query.currency,
              payerTgUserId,
            });
            if (tenant.status !== TenantStatus.ACTIVE) {
              throw new PermanentBillingEventError('tenant is not active');
            }
            try {
              await this.access.assertOwner(
                transaction,
                tenant.id,
                payerTgUserId,
              );
            } catch {
              throw new PermanentBillingEventError('payer is not tenant owner');
            }
            const subscription = await transaction.subscription.findUnique({
              where: { tenantId: tenant.id },
            });
            if (
              subscription &&
              this.subscriptionStillEntitled(subscription, new Date())
            ) {
              throw new PermanentBillingEventError(
                'tenant already has active subscription',
              );
            }
            return transaction.billingCheckout.update({
              where: { id: loaded.id },
              data: {
                status: BillingCheckoutStatus.PRECHECKOUT_APPROVED,
                preCheckoutQueryId: queryId,
                preCheckoutApprovedAt: new Date(),
              },
            });
          },
          {
            lockTimeoutMs: PRECHECKOUT_LOCK_TIMEOUT_MS,
            maxWaitMs: PRECHECKOUT_TRANSACTION_MAX_WAIT_MS,
            timeoutMs: PRECHECKOUT_TRANSACTION_TIMEOUT_MS,
          },
        ),
        PRECHECKOUT_TRANSACTION_WATCHDOG_MS,
      );
    } catch (error) {
      rejection =
        error instanceof PermanentBillingEventError
          ? error
          : error instanceof PreCheckoutDeadlineError
            ? new PermanentBillingEventError(
                error.message,
                'Checkout verification took too long. Please try again.',
              )
            : new PermanentBillingEventError('invalid pre-checkout event');
    }

    try {
      await this.telegram.answerPreCheckoutQuery(
        {
          id: queryId,
          ok: !rejection,
          errorMessage: rejection?.userMessage,
        },
        { timeoutMs: PRECHECKOUT_TELEGRAM_TIMEOUT_MS },
      );
    } catch (error) {
      if (error instanceof TelegramApiError && !error.retryable) {
        if (!rejection && typeof query?.invoice_payload === 'string') {
          await this.prisma.billingCheckout.updateMany({
            where: {
              id: query.invoice_payload,
              preCheckoutQueryId: queryId,
              status: BillingCheckoutStatus.PRECHECKOUT_APPROVED,
            },
            data: { status: BillingCheckoutStatus.REJECTED },
          });
        }
        throw new PermanentBillingEventError(
          'Telegram rejected the pre-checkout answer',
        );
      }
      throw new RetryableBillingEventError(
        error instanceof TelegramApiError && error.retryable
          ? 'Telegram pre-checkout answer failed transiently'
          : 'Telegram pre-checkout answer failed',
      );
    }

    if (rejection) throw rejection;
  }

  async applySuccessfulPayment(
    message: TelegramMessage,
    telegramUpdateRecordId: string,
  ) {
    const payment = message?.successful_payment;
    if (!payment) {
      throw new PermanentBillingEventError('successful payment missing');
    }
    const payerTgUserId = asTelegramUserId(message?.from?.id);
    const checkoutId = boundedString(
      payment.invoice_payload,
      'invoice payload',
      128,
    );
    const chargeId = boundedString(
      payment.telegram_payment_charge_id,
      'Telegram charge ID',
      256,
    );
    if (
      payment.currency !== 'XTR' ||
      typeof payment.total_amount !== 'number' ||
      !Number.isSafeInteger(payment.total_amount) ||
      payment.is_recurring !== true
    ) {
      throw new PermanentBillingEventError('invalid recurring payment fields');
    }
    const periodEnd = unixDate(
      payment.subscription_expiration_date,
      'subscription expiration',
    );
    const paidAt = unixDate(message.date, 'payment date');
    if (periodEnd <= paidAt) {
      throw new PermanentBillingEventError(
        'subscription expiration is not after payment',
      );
    }
    const checkout = await this.prisma.billingCheckout.findUnique({
      where: { id: checkoutId },
      select: { tenantId: true },
    });
    if (!checkout) throw new PermanentBillingEventError('checkout not found');

    try {
      return await this.quota.withTenantLock(
        checkout.tenantId,
        async (transaction, tenant) => {
          const authoritativeCheckout =
            await transaction.billingCheckout.findUnique({
              where: { id: checkoutId },
            });
          if (!authoritativeCheckout) {
            throw new PermanentBillingEventError('checkout not found');
          }
          const verifiedInitialCheckout =
            (authoritativeCheckout.status ===
              BillingCheckoutStatus.PRECHECKOUT_APPROVED ||
              authoritativeCheckout.status === BillingCheckoutStatus.EXPIRED) &&
            authoritativeCheckout.preCheckoutQueryId !== null &&
            authoritativeCheckout.preCheckoutApprovedAt !== null;
          if (
            authoritativeCheckout.status !== BillingCheckoutStatus.PAID &&
            !verifiedInitialCheckout
          ) {
            throw new PermanentBillingEventError('checkout expired or closed');
          }
          assertPaymentMatchesCheckout(authoritativeCheckout, {
            amountStars: payment.total_amount,
            currency: payment.currency,
            payerTgUserId,
          });
          if (tenant.status !== TenantStatus.ACTIVE) {
            throw new PermanentBillingEventError('tenant is not active');
          }
          try {
            await this.access.assertOwner(
              transaction,
              tenant.id,
              payerTgUserId,
            );
          } catch {
            throw new PermanentBillingEventError('payer is not tenant owner');
          }

          const existingPayment = await transaction.billingPayment.findUnique({
            where: { telegramPaymentChargeId: chargeId },
          });
          if (existingPayment) {
            if (
              existingPayment.tenantId !== tenant.id ||
              existingPayment.checkoutId !== checkoutId ||
              existingPayment.payerTgUserId !== payerTgUserId ||
              existingPayment.amountStars !== payment.total_amount ||
              existingPayment.periodEnd.getTime() !== periodEnd.getTime()
            ) {
              throw new PermanentBillingEventError(
                'duplicate charge conflicts with stored payment',
              );
            }
            return { duplicate: true, paymentId: existingPayment.id };
          }

          const isFirstPayment =
            authoritativeCheckout.status !== BillingCheckoutStatus.PAID;
          if ((payment.is_first_recurring === true) !== isFirstPayment) {
            throw new PermanentBillingEventError(
              'recurring payment sequence mismatch',
            );
          }

          const existingSubscription =
            await transaction.subscription.findUnique({
              where: { tenantId: tenant.id },
            });
          const subscription = await this.entitlements.grantPro(transaction, {
            tenantId: tenant.id,
            payerTgUserId,
            primaryChargeId: chargeId,
            paidAt,
            periodEnd,
            preserveCancelAtPeriodEnd:
              authoritativeCheckout.status === BillingCheckoutStatus.PAID,
          });
          const storedPayment = await transaction.billingPayment.create({
            data: {
              telegramPaymentChargeId: chargeId,
              tenantId: tenant.id,
              checkoutId,
              subscriptionId: subscription.id,
              telegramUpdateId: telegramUpdateRecordId,
              payerTgUserId,
              plan: TenantPlan.PRO,
              amountStars: payment.total_amount,
              currency: payment.currency,
              isRecurring: true,
              isFirstRecurring: payment.is_first_recurring === true,
              paidAt,
              periodEnd,
            },
          });
          await transaction.billingCheckout.update({
            where: { id: checkoutId },
            data: {
              status: BillingCheckoutStatus.PAID,
              paidAt: authoritativeCheckout.paidAt ?? paidAt,
            },
          });
          return {
            duplicate: false,
            paymentId: storedPayment.id,
            renewed: Boolean(existingSubscription),
          };
        },
      );
    } catch (error) {
      if (error instanceof PermanentBillingEventError) throw error;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new RetryableBillingEventError(
          'concurrent payment delivery should retry',
        );
      }
      throw error;
    }
  }

  async setCancellation(
    context: TenantContext,
    payerId: number,
    canceled: boolean,
  ) {
    const payerTgUserId = asTelegramUserId(payerId);
    const current = await this.loadOwnedSubscription(context.id, payerTgUserId);
    if (
      current.status === SubscriptionStatus.EXPIRED ||
      !current.telegramPaymentChargeId
    ) {
      throw new BillingException('BILLING_SUBSCRIPTION_INACTIVE');
    }
    if (current.cancelAtPeriodEnd === canceled) {
      return this.getState(context, payerId);
    }
    try {
      await this.telegram.editUserStarSubscription({
        payerTgUserId,
        telegramPaymentChargeId: current.telegramPaymentChargeId,
        canceled,
      });
    } catch (error) {
      if (error instanceof TelegramApiError) {
        throw new BadGatewayException(
          'Telegram could not update the subscription',
        );
      }
      throw error;
    }
    await this.quota.withTenantLock(context.id, async (transaction, tenant) => {
      await this.access.assertOwner(transaction, tenant.id, payerTgUserId);
      const locked = await transaction.subscription.findUnique({
        where: { tenantId: tenant.id },
      });
      if (
        !locked ||
        locked.telegramPaymentChargeId !== current.telegramPaymentChargeId ||
        locked.status === SubscriptionStatus.EXPIRED
      ) {
        throw new BillingException('BILLING_SUBSCRIPTION_INACTIVE');
      }
      await transaction.subscription.update({
        where: { id: locked.id },
        data: { cancelAtPeriodEnd: canceled },
      });
    });
    return this.getState(context, payerId);
  }

  async expire(options: ExpiryOptions) {
    const candidates = await this.prisma.subscription.findMany({
      where: {
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE] },
        currentPeriodEnd: { lte: new Date() },
        ...(options.tenantSlug ? { tenant: { slug: options.tenantSlug } } : {}),
      },
      orderBy: [{ currentPeriodEnd: 'asc' }, { id: 'asc' }],
      take: options.limit,
      include: { tenant: { select: { slug: true } } },
    });
    const results: Array<{
      action: 'downgrade' | 'enter_grace' | 'skipped';
      applied: boolean;
      subscriptionId: string;
      tenantSlug: string;
    }> = [];
    for (const candidate of candidates) {
      const now = new Date();
      const graceEndsAt = new Date(
        candidate.currentPeriodEnd.getTime() + PAID_PLAN_GRACE_DAYS * DAY_MS,
      );
      const proposed = now >= graceEndsAt ? 'downgrade' : 'enter_grace';
      if (options.dryRun) {
        results.push({
          action: proposed,
          applied: false,
          subscriptionId: candidate.id,
          tenantSlug: candidate.tenant.slug,
        });
        continue;
      }
      const result = await this.quota.withTenantLock(
        candidate.tenantId,
        async (transaction) => {
          const locked = await transaction.subscription.findUnique({
            where: { id: candidate.id },
            include: { tenant: { select: { slug: true } } },
          });
          const lockedNow = new Date();
          if (
            !locked ||
            locked.status === SubscriptionStatus.EXPIRED ||
            locked.currentPeriodEnd > lockedNow
          ) {
            return {
              action: 'skipped' as const,
              applied: false,
              subscriptionId: candidate.id,
              tenantSlug: candidate.tenant.slug,
            };
          }
          const lockedGraceEnd = new Date(
            locked.currentPeriodEnd.getTime() + PAID_PLAN_GRACE_DAYS * DAY_MS,
          );
          if (lockedNow >= lockedGraceEnd) {
            await this.entitlements.downgrade(
              transaction,
              locked.id,
              locked.tenantId,
            );
            return {
              action: 'downgrade' as const,
              applied: true,
              subscriptionId: locked.id,
              tenantSlug: locked.tenant.slug,
            };
          }
          if (
            locked.status !== SubscriptionStatus.GRACE ||
            locked.graceEndsAt?.getTime() !== lockedGraceEnd.getTime()
          ) {
            await this.entitlements.enterGrace(
              transaction,
              locked.id,
              locked.tenantId,
              lockedGraceEnd,
            );
            return {
              action: 'enter_grace' as const,
              applied: true,
              subscriptionId: locked.id,
              tenantSlug: locked.tenant.slug,
            };
          }
          return {
            action: 'skipped' as const,
            applied: false,
            subscriptionId: locked.id,
            tenantSlug: locked.tenant.slug,
          };
        },
      );
      results.push(result);
    }
    return {
      mode: options.dryRun ? 'dry-run' : 'apply',
      processed: candidates.length,
      applied: results.filter((result) => result.applied).length,
      results,
    };
  }

  async reconcile(limit: number, tenantSlug?: string) {
    const subscriptions = await this.prisma.subscription.findMany({
      where: tenantSlug ? { tenant: { slug: tenantSlug } } : undefined,
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit,
      include: {
        tenant: { select: { plan: true, slug: true } },
        payments: {
          where: { refundStatus: { not: BillingRefundStatus.REFUNDED } },
          orderBy: [{ periodEnd: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
    });
    const results = subscriptions.map((subscription) => {
      const issues: string[] = [];
      const latestPayment = subscription.payments[0];
      if (
        !latestPayment &&
        subscription.status !== SubscriptionStatus.EXPIRED
      ) {
        issues.push('no unrefunded payment');
      }
      if (
        latestPayment &&
        latestPayment.periodEnd > subscription.currentPeriodEnd
      ) {
        issues.push('subscription period trails latest payment');
      }
      const shouldBePro = subscription.status !== SubscriptionStatus.EXPIRED;
      if ((subscription.tenant.plan === TenantPlan.PRO) !== shouldBePro) {
        issues.push('tenant plan disagrees with subscription status');
      }
      if (!subscription.telegramPaymentChargeId) {
        issues.push('missing primary Telegram charge ID');
      }
      return {
        tenantSlug: subscription.tenant.slug,
        subscriptionId: subscription.id,
        issues,
        manualReview: issues.length > 0,
      };
    });
    return {
      processed: subscriptions.length,
      discrepancies: results.filter((result) => result.manualReview).length,
      results,
    };
  }

  async refundPayment(paymentId: string, actor: string, reason: string) {
    const initial = await this.prisma.billingPayment.findUnique({
      where: { id: paymentId },
      include: { subscription: true },
    });
    if (!initial) throw new NotFoundException('Payment not found');

    const claimed = await this.quota.withTenantLock(
      initial.tenantId,
      async (transaction) => {
        const payment = await transaction.billingPayment.findUniqueOrThrow({
          where: { id: paymentId },
          include: { subscription: true },
        });
        if (payment.refundStatus === BillingRefundStatus.REFUNDED) {
          return { duplicate: true as const, payment };
        }
        if (payment.refundStatus === BillingRefundStatus.PENDING) {
          throw new BillingException('BILLING_PAYMENT_CONFLICT');
        }
        const latest = await transaction.billingPayment.findFirst({
          where: {
            subscriptionId: payment.subscriptionId,
            refundStatus: { not: BillingRefundStatus.REFUNDED },
          },
          orderBy: [{ periodEnd: 'desc' }, { paidAt: 'desc' }, { id: 'desc' }],
          select: { id: true },
        });
        await transaction.billingPayment.update({
          where: { id: payment.id },
          data: {
            refundStatus: BillingRefundStatus.PENDING,
            refundReason: reason,
            refundErrorSummary: null,
          },
        });
        return {
          duplicate: false as const,
          payment,
          latestEntitlementPayment: latest?.id === payment.id,
        };
      },
    );
    if (claimed.duplicate) {
      return {
        paymentId,
        refundStatus: BillingRefundStatus.REFUNDED,
        duplicate: true,
      };
    }

    let cancellationAccepted = false;
    try {
      if (
        claimed.latestEntitlementPayment &&
        claimed.payment.subscription.telegramPaymentChargeId
      ) {
        await this.telegram.editUserStarSubscription({
          payerTgUserId: claimed.payment.subscription.payerTgUserId,
          telegramPaymentChargeId:
            claimed.payment.subscription.telegramPaymentChargeId,
          canceled: true,
        });
        cancellationAccepted = true;
      }
      await this.telegram.refundStarPayment({
        payerTgUserId: claimed.payment.payerTgUserId,
        telegramPaymentChargeId: claimed.payment.telegramPaymentChargeId,
      });
    } catch (error) {
      await this.quota.withTenantLock(
        claimed.payment.tenantId,
        async (transaction) => {
          await transaction.billingPayment.updateMany({
            where: {
              id: paymentId,
              refundStatus: BillingRefundStatus.PENDING,
            },
            data: {
              refundStatus: BillingRefundStatus.FAILED,
              refundErrorSummary:
                error instanceof TelegramApiError
                  ? `Telegram ${error.method} failed`
                  : 'Telegram refund failed',
            },
          });
          if (cancellationAccepted) {
            await transaction.subscription.update({
              where: { id: claimed.payment.subscriptionId },
              data: { cancelAtPeriodEnd: true },
            });
          }
        },
      );
      throw new BadGatewayException('Telegram could not complete the refund');
    }

    return this.quota.withTenantLock(
      claimed.payment.tenantId,
      async (transaction) => {
        const payment = await transaction.billingPayment.findUniqueOrThrow({
          where: { id: paymentId },
        });
        if (payment.refundStatus !== BillingRefundStatus.PENDING) {
          throw new BillingException('BILLING_PAYMENT_CONFLICT');
        }
        const newerPayment = await transaction.billingPayment.findFirst({
          where: {
            subscriptionId: payment.subscriptionId,
            id: { not: payment.id },
            refundStatus: { not: BillingRefundStatus.REFUNDED },
            periodEnd: { gte: payment.periodEnd },
          },
          orderBy: [{ periodEnd: 'desc' }, { paidAt: 'desc' }],
          select: { id: true },
        });
        await transaction.billingPayment.update({
          where: { id: payment.id },
          data: {
            refundStatus: BillingRefundStatus.REFUNDED,
            refundedAt: new Date(),
            refundErrorSummary: null,
          },
        });
        const downgraded = claimed.latestEntitlementPayment && !newerPayment;
        if (downgraded) {
          await this.entitlements.downgrade(
            transaction,
            payment.subscriptionId,
            payment.tenantId,
            { cancelAtPeriodEnd: cancellationAccepted },
          );
        } else if (cancellationAccepted) {
          await transaction.subscription.update({
            where: { id: payment.subscriptionId },
            data: { cancelAtPeriodEnd: true },
          });
        }
        const audit = await transaction.operatorAudit.create({
          data: {
            actor,
            action: OperatorAuditAction.PAYMENT_REFUNDED,
            tenantId: payment.tenantId,
            reason,
            metadata: { paymentId: payment.id, downgraded },
          },
        });
        return {
          paymentId: payment.id,
          refundStatus: BillingRefundStatus.REFUNDED,
          downgraded,
          auditId: audit.id,
          duplicate: false,
        };
      },
    );
  }

  private requireConfigured(): BillingRuntimeConfig {
    if (
      !this.priceStars ||
      !this.privacyUrl ||
      !this.supportContact ||
      !this.termsUrl ||
      !this.webhookConfigured
    ) {
      throw new BillingException(
        'BILLING_NOT_CONFIGURED',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return {
      priceStars: this.priceStars,
      privacyUrl: this.privacyUrl,
      supportContact: this.supportContact,
      termsUrl: this.termsUrl,
    };
  }

  private configuration() {
    const configured = Boolean(
      this.priceStars &&
      this.privacyUrl &&
      this.supportContact &&
      this.termsUrl &&
      this.webhookConfigured,
    );
    return {
      configured,
      testMode: this.testMode,
      priceStars: configured ? this.priceStars : null,
      supportContact: this.supportContact ?? null,
      termsUrl: this.termsUrl ?? null,
      privacyUrl: this.privacyUrl ?? null,
      graceDays: PAID_PLAN_GRACE_DAYS,
    };
  }

  private serializeState(
    tenant: {
      plan: TenantPlan;
    },
    subscription: {
      cancelAtPeriodEnd: boolean;
      currentPeriodEnd: Date;
      graceEndsAt: Date | null;
      status: SubscriptionStatus;
    } | null,
  ) {
    const policy = getPlanPolicy(tenant.plan);
    return {
      ...this.configuration(),
      plan: tenant.plan.toLowerCase(),
      subscription: subscription
        ? {
            status: subscription.status.toLowerCase(),
            currentPeriodEnd: subscription.currentPeriodEnd,
            graceEndsAt: subscription.graceEndsAt,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          }
        : null,
      limits: {
        albums: policy.maxAlbums,
        photos: policy.maxPhotos,
        storageBytes: policy.maxStorageBytes.toString(),
        uploadBytes: policy.maxUploadBytes,
      },
    };
  }

  private subscriptionStillEntitled(
    subscription: {
      currentPeriodEnd: Date;
      status: SubscriptionStatus;
    },
    now: Date,
  ): boolean {
    if (subscription.status === SubscriptionStatus.EXPIRED) return false;
    return (
      now.getTime() <
      subscription.currentPeriodEnd.getTime() + PAID_PLAN_GRACE_DAYS * DAY_MS
    );
  }

  private async loadOwnedSubscription(tenantId: string, payerTgUserId: bigint) {
    return this.prisma.$transaction(async (transaction) => {
      await this.access.assertOwnerExists(transaction, tenantId, payerTgUserId);
      const subscription = await transaction.subscription.findUnique({
        where: { tenantId },
      });
      if (!subscription) {
        throw new BillingException('BILLING_SUBSCRIPTION_INACTIVE');
      }
      return subscription;
    });
  }
}
