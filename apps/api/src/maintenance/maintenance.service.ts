import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import { BillingService } from '../billing/billing.service';
import type { TenancyMode } from '../config/env';
import { PhotosService } from '../photos/photos.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  type TenantUsageReconciliation,
  UsageService,
} from '../usage/usage.service';
import type { MaintenanceKind } from './maintenance-options';

export const SCHEDULED_MAINTENANCE_LOCK_NAME =
  'my-telegram-gallery:scheduled-maintenance:v1';
const MAINTENANCE_TIMEOUT_MS = 50 * 60 * 1000;

interface UploadMaintenanceResult {
  expired: number;
  failed: number;
  processed: number;
  processedTenants: number;
  tenantScanIncomplete: boolean;
}

interface HourlyMaintenanceResult {
  billingExpiry: Awaited<ReturnType<BillingService['expire']>>;
  billingReconciliation: Awaited<ReturnType<BillingService['reconcile']>>;
  usage: {
    attention: TenantUsageReconciliation[];
    driftedTenants: number;
    incompleteTenants: number;
    processedTenants: number;
    tenantScanIncomplete: boolean;
  };
}

export type MaintenanceRunResult =
  | {
      attentionRequired: boolean;
      finishedAt: string;
      kind: MaintenanceKind;
      result: HourlyMaintenanceResult | UploadMaintenanceResult;
      startedAt: string;
      status: 'completed';
    }
  | {
      kind: MaintenanceKind;
      reason: 'already_running';
      status: 'skipped';
    };

@Injectable()
export class MaintenanceService {
  private readonly mode: TenancyMode;

  constructor(
    private readonly prisma: PrismaService,
    private readonly photos: PhotosService,
    private readonly usage: UsageService,
    private readonly billing: BillingService,
    config: ConfigService,
  ) {
    this.mode = config.getOrThrow<TenancyMode>('TENANCY_MODE');
  }

  async run(
    kind: MaintenanceKind,
    limit: number,
  ): Promise<MaintenanceRunResult> {
    // The outer transaction pins one PostgreSQL connection while the work uses
    // normal service transactions. Its only purpose is to hold a crash-safe,
    // cross-process advisory lock for the complete scheduled cycle.
    return this.prisma.$transaction(
      async (transaction) => {
        const rows = await transaction.$queryRaw<Array<{ acquired: boolean }>>(
          Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${SCHEDULED_MAINTENANCE_LOCK_NAME}, 0)) AS acquired`,
        );
        if (rows[0]?.acquired !== true) {
          return { kind, reason: 'already_running', status: 'skipped' };
        }

        const startedAt = new Date().toISOString();
        const outcome =
          kind === 'uploads'
            ? await this.cleanupUploads(limit)
            : await this.runHourly(limit);
        return {
          attentionRequired: outcome.attentionRequired,
          finishedAt: new Date().toISOString(),
          kind,
          result: outcome.result,
          startedAt,
          status: 'completed',
        };
      },
      { maxWait: 5000, timeout: MAINTENANCE_TIMEOUT_MS },
    );
  }

  private async cleanupUploads(limit: number) {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { id: 'asc' },
      take: limit + 1,
      select: { id: true, name: true, slug: true, status: true, theme: true },
    });
    const tenantScanIncomplete = tenants.length > limit;
    const boundedTenants = tenants.slice(0, limit);
    const result: UploadMaintenanceResult = {
      expired: 0,
      failed: 0,
      processed: 0,
      processedTenants: boundedTenants.length,
      tenantScanIncomplete,
    };
    for (const tenant of boundedTenants) {
      const tenantResult = await this.photos.cleanupExpiredUploads(
        { ...tenant, bot: null, mode: this.mode },
        { dryRun: false, limit },
      );
      result.processed += tenantResult.processed;
      result.expired += tenantResult.expired;
      result.failed += tenantResult.failed;
    }
    return {
      attentionRequired: result.failed > 0 || result.tenantScanIncomplete,
      result,
    };
  }

  private async runHourly(limit: number) {
    const billingExpiry = await this.billing.expire({
      dryRun: false,
      limit,
    });
    const billingReconciliation = await this.billing.reconcile(limit);
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { id: 'asc' },
      take: limit + 1,
      select: { id: true },
    });
    const tenantScanIncomplete = tenants.length > limit;
    const boundedTenants = tenants.slice(0, limit);
    const usageResults: TenantUsageReconciliation[] = [];
    for (const tenant of boundedTenants) {
      usageResults.push(
        await this.usage.reconcileTenant(tenant.id, {
          apply: false,
          limit,
        }),
      );
    }
    const usage = {
      attention: usageResults.filter(
        (result) => result.drift || result.incomplete,
      ),
      driftedTenants: usageResults.filter((result) => result.drift).length,
      incompleteTenants: usageResults.filter((result) => result.incomplete)
        .length,
      processedTenants: usageResults.length,
      tenantScanIncomplete,
    };
    return {
      attentionRequired:
        billingExpiry.incomplete ||
        billingReconciliation.discrepancies > 0 ||
        billingReconciliation.incomplete ||
        usage.driftedTenants > 0 ||
        usage.incompleteTenants > 0 ||
        usage.tenantScanIncomplete,
      result: { billingExpiry, billingReconciliation, usage },
    };
  }
}
