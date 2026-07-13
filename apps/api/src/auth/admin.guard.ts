import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantRole } from '../../generated/prisma/client';
import type { TenancyMode } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaException } from '../quota/quota.errors';
import type { TgRequest } from './request-context';

/** Uses the env allowlist in single mode and admin memberships in multi mode. */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly adminIds: readonly string[];
  private readonly mode: TenancyMode;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.adminIds = config.getOrThrow<readonly string[]>('ADMIN_TG_IDS');
    this.mode = config.getOrThrow<TenancyMode>('TENANCY_MODE');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<TgRequest>();
    const tgUser = req.tgAuth?.user ?? req.tgUser;
    if (!tgUser) {
      throw new ForbiddenException('Admin only');
    }

    if (this.mode === 'single') {
      if (!this.adminIds.includes(String(tgUser.id))) {
        throw new ForbiddenException('Admin only');
      }
      return true;
    }

    const tenant = req.tenantContext;
    if (!tenant) throw new ForbiddenException('Select a tenant');
    const membership = await this.prisma.tenantMembership.findUnique({
      where: {
        tenantId_tgUserId: {
          tenantId: tenant.id,
          tgUserId: BigInt(tgUser.id),
        },
      },
    });
    if (
      !membership ||
      ![TenantRole.OWNER, TenantRole.ADMIN].includes(membership.role)
    ) {
      throw new ForbiddenException('Tenant administrator access required');
    }
    if (tenant.status !== 'ACTIVE') {
      throw new QuotaException('TENANT_SUSPENDED');
    }
    return true;
  }
}
