import { ConfigService } from '@nestjs/config';
import type { BillingAccessService } from './billing-access.service';
import { PermanentBillingEventError } from './billing.errors';
import { BillingService } from './billing.service';
import type { EntitlementService } from './entitlement.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { QuotaService } from '../quota/quota.service';
import type { TelegramApiService } from '../telegram/telegram-api.service';
import type { TelegramPreCheckoutQuery } from '../telegram/telegram.types';

const query: TelegramPreCheckoutQuery = {
  id: 'pre_checkout_1',
  from: { id: 501 },
  currency: 'XTR',
  total_amount: 250,
  invoice_payload: 'checkout_1',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function setup() {
  const prisma = {
    billingCheckout: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    subscription: {
      findMany: jest.fn(),
    },
  };
  const quota = {
    withTenantLock: jest.fn(),
  };
  const access = {
    assertOwner: jest.fn(),
  };
  const entitlements = {};
  const telegram = {
    answerPreCheckoutQuery: jest.fn().mockResolvedValue(true),
  };
  const service = new BillingService(
    prisma as unknown as PrismaService,
    quota as unknown as QuotaService,
    access as unknown as BillingAccessService,
    entitlements as unknown as EntitlementService,
    telegram as unknown as TelegramApiService,
    new ConfigService({
      BILLING_CHECKOUT_TTL_SECONDS: 900,
      BILLING_PRO_PRICE_STARS: 250,
      BILLING_PRIVACY_URL: 'https://example.test/privacy',
      BILLING_TERMS_URL: 'https://example.test/terms',
      PAY_SUPPORT_CONTACT: '@support',
      TELEGRAM_BOT_API_TEST_MODE: true,
      TELEGRAM_WEBHOOK_SECRET: 'webhook-secret',
    }),
  );
  return { prisma, quota, service, telegram };
}

describe('BillingService pre-checkout deadlines', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('rejects and answers Telegram when the checkout lookup exceeds its budget', async () => {
    const { prisma, quota, service, telegram } = setup();
    const lookup = deferred<{ tenantId: string } | null>();
    prisma.billingCheckout.findUnique.mockReturnValue(lookup.promise);

    const result = expect(
      service.handlePreCheckout(query),
    ).rejects.toMatchObject<PermanentBillingEventError>({
      summary: 'pre-checkout deadline exceeded',
    });
    await jest.advanceTimersByTimeAsync(500);
    await result;

    expect(quota.withTenantLock).not.toHaveBeenCalled();
    expect(telegram.answerPreCheckoutQuery).toHaveBeenCalledWith(
      {
        id: query.id,
        ok: false,
        errorMessage: 'Checkout verification took too long. Please try again.',
      },
      { timeoutMs: 4000 },
    );

    lookup.resolve({ tenantId: 'tenant-1' });
    await Promise.resolve();
    expect(quota.withTenantLock).not.toHaveBeenCalled();
  });

  it('bounds connection wait, row locking, transaction work, and the reply', async () => {
    const { prisma, quota, service, telegram } = setup();
    prisma.billingCheckout.findUnique.mockResolvedValue({
      tenantId: 'tenant-1',
    });
    quota.withTenantLock.mockReturnValue(new Promise(() => undefined));

    const result = expect(
      service.handlePreCheckout(query),
    ).rejects.toMatchObject<PermanentBillingEventError>({
      summary: 'pre-checkout deadline exceeded',
    });
    await jest.advanceTimersByTimeAsync(0);

    expect(quota.withTenantLock).toHaveBeenCalledWith(
      'tenant-1',
      expect.any(Function),
      {
        lockTimeoutMs: 1250,
        maxWaitMs: 250,
        timeoutMs: 1750,
      },
    );

    await jest.advanceTimersByTimeAsync(2250);
    await result;
    expect(telegram.answerPreCheckoutQuery).toHaveBeenCalledWith(
      expect.objectContaining({ id: query.id, ok: false }),
      { timeoutMs: 4000 },
    );
  });
});

describe('BillingService maintenance selection', () => {
  const selectionTime = new Date('2026-07-15T08:00:00.000Z');

  beforeEach(() => jest.useFakeTimers({ now: selectionTime }));
  afterEach(() => jest.useRealTimers());

  it('selects only expired active periods and due grace periods', async () => {
    const { prisma, service } = setup();
    prisma.subscription.findMany.mockResolvedValue([]);

    await expect(
      service.expire({ dryRun: true, limit: 25 }),
    ).resolves.toMatchObject({ incomplete: false, processed: 0 });

    expect(prisma.subscription.findMany).toHaveBeenCalledWith({
      include: { tenant: { select: { slug: true } } },
      orderBy: [{ currentPeriodEnd: 'asc' }, { id: 'asc' }],
      take: 26,
      where: {
        OR: [
          {
            currentPeriodEnd: { lte: selectionTime },
            status: 'ACTIVE',
          },
          {
            OR: [
              { graceEndsAt: null },
              { graceEndsAt: { lte: selectionTime } },
            ],
            status: 'GRACE',
          },
        ],
      },
    });
  });
});
