import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantRole, type Prisma } from '../../generated/prisma/client';
import type { TenancyMode } from '../config/env';
import { DEFAULT_TENANT_ID } from '../tenants/tenant.constants';

@Injectable()
export class BillingAccessService {
  private readonly adminIds: readonly string[];
  private readonly mode: TenancyMode;

  constructor(config: ConfigService) {
    this.adminIds = config.getOrThrow<readonly string[]>('ADMIN_TG_IDS');
    this.mode = config.getOrThrow<TenancyMode>('TENANCY_MODE');
  }

  async assertOwner(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    payerTgUserId: bigint,
  ): Promise<void> {
    if (this.mode === 'single') {
      if (
        tenantId !== DEFAULT_TENANT_ID ||
        !this.adminIds.includes(payerTgUserId.toString())
      ) {
        throw new ForbiddenException('Tenant owner access required');
      }
      return;
    }

    const membership = await transaction.tenantMembership.findUnique({
      where: {
        tenantId_tgUserId: { tenantId, tgUserId: payerTgUserId },
      },
      select: { role: true },
    });
    if (!membership || membership.role !== TenantRole.OWNER) {
      throw new ForbiddenException('Tenant owner access required');
    }
  }

  async assertOwnerExists(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    payerTgUserId: bigint,
  ): Promise<void> {
    const tenant = await transaction.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    await this.assertOwner(transaction, tenantId, payerTgUserId);
  }
}
