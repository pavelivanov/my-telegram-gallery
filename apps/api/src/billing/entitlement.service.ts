import { Injectable } from '@nestjs/common';
import {
  SubscriptionStatus,
  TenantPlan,
  type Prisma,
} from '../../generated/prisma/client';

@Injectable()
export class EntitlementService {
  async grantPro(
    transaction: Prisma.TransactionClient,
    input: {
      tenantId: string;
      payerTgUserId: bigint;
      primaryChargeId: string;
      paidAt: Date;
      periodEnd: Date;
      preserveCancelAtPeriodEnd: boolean;
    },
  ) {
    const existing = await transaction.subscription.findUnique({
      where: { tenantId: input.tenantId },
    });
    const currentPeriodEnd =
      existing && existing.currentPeriodEnd > input.periodEnd
        ? existing.currentPeriodEnd
        : input.periodEnd;
    const subscription = existing
      ? await transaction.subscription.update({
          where: { id: existing.id },
          data: {
            payerTgUserId: input.payerTgUserId,
            plan: TenantPlan.PRO,
            status: SubscriptionStatus.ACTIVE,
            telegramPaymentChargeId: input.preserveCancelAtPeriodEnd
              ? (existing.telegramPaymentChargeId ?? input.primaryChargeId)
              : input.primaryChargeId,
            currentPeriodEnd,
            graceEndsAt: null,
            cancelAtPeriodEnd: input.preserveCancelAtPeriodEnd
              ? existing.cancelAtPeriodEnd
              : false,
            lastPaymentAt:
              existing.lastPaymentAt > input.paidAt
                ? existing.lastPaymentAt
                : input.paidAt,
          },
        })
      : await transaction.subscription.create({
          data: {
            tenantId: input.tenantId,
            payerTgUserId: input.payerTgUserId,
            plan: TenantPlan.PRO,
            telegramPaymentChargeId: input.primaryChargeId,
            currentPeriodEnd,
            lastPaymentAt: input.paidAt,
          },
        });
    await transaction.tenant.update({
      where: { id: input.tenantId },
      data: { plan: TenantPlan.PRO },
    });
    return subscription;
  }

  async enterGrace(
    transaction: Prisma.TransactionClient,
    subscriptionId: string,
    tenantId: string,
    graceEndsAt: Date,
  ) {
    await transaction.subscription.update({
      where: { id: subscriptionId },
      data: { status: SubscriptionStatus.GRACE, graceEndsAt },
    });
    await transaction.tenant.update({
      where: { id: tenantId },
      data: { plan: TenantPlan.PRO },
    });
  }

  async downgrade(
    transaction: Prisma.TransactionClient,
    subscriptionId: string,
    tenantId: string,
    options: { cancelAtPeriodEnd?: boolean } = {},
  ) {
    await transaction.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: SubscriptionStatus.EXPIRED,
        graceEndsAt: null,
        ...(options.cancelAtPeriodEnd === undefined
          ? {}
          : { cancelAtPeriodEnd: options.cancelAtPeriodEnd }),
      },
    });
    await transaction.tenant.update({
      where: { id: tenantId },
      data: { plan: TenantPlan.FREE },
    });
  }
}
