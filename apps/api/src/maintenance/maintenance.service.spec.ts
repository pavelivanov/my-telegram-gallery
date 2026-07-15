import { ConfigService } from '@nestjs/config';
import type { BillingService } from '../billing/billing.service';
import type { PhotosService } from '../photos/photos.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { UsageService } from '../usage/usage.service';
import { MaintenanceService } from './maintenance.service';

function setup(acquired = true) {
  const transaction = {
    $queryRaw: jest.fn().mockResolvedValue([{ acquired }]),
  };
  const prisma = {
    $transaction: jest.fn(
      async (work: (client: typeof transaction) => Promise<unknown>) =>
        work(transaction),
    ),
    tenant: { findMany: jest.fn() },
  };
  const photos = { cleanupExpiredUploads: jest.fn() };
  const usage = { reconcileTenant: jest.fn() };
  const billing = { expire: jest.fn(), reconcile: jest.fn() };
  const service = new MaintenanceService(
    prisma as unknown as PrismaService,
    photos as unknown as PhotosService,
    usage as unknown as UsageService,
    billing as unknown as BillingService,
    new ConfigService({ TENANCY_MODE: 'multi' }),
  );
  return { billing, photos, prisma, service, transaction, usage };
}

describe('MaintenanceService', () => {
  it('skips a cycle when another process holds the PostgreSQL lock', async () => {
    const { billing, photos, prisma, service, usage } = setup(false);

    await expect(service.run('hourly', 500)).resolves.toEqual({
      kind: 'hourly',
      reason: 'already_running',
      status: 'skipped',
    });
    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
    expect(photos.cleanupExpiredUploads).not.toHaveBeenCalled();
    expect(usage.reconcileTenant).not.toHaveBeenCalled();
    expect(billing.expire).not.toHaveBeenCalled();
  });

  it('applies bounded upload cleanup across the selected tenants', async () => {
    const { photos, prisma, service } = setup();
    prisma.tenant.findMany.mockResolvedValue([
      {
        id: 'tenant-1',
        name: 'One',
        slug: 'one',
        status: 'ACTIVE',
        theme: 'NOCTURNE',
      },
      {
        id: 'tenant-2',
        name: 'Two',
        slug: 'two',
        status: 'ACTIVE',
        theme: 'PAPER',
      },
    ]);
    photos.cleanupExpiredUploads
      .mockResolvedValueOnce({ processed: 2, expired: 2, failed: 0 })
      .mockResolvedValueOnce({ processed: 1, expired: 0, failed: 1 });

    await expect(service.run('uploads', 25)).resolves.toMatchObject({
      attentionRequired: true,
      kind: 'uploads',
      result: {
        expired: 2,
        failed: 1,
        processed: 3,
        processedTenants: 2,
        tenantScanIncomplete: false,
      },
      status: 'completed',
    });
    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 26 }),
    );
    expect(photos.cleanupExpiredUploads).toHaveBeenCalledTimes(2);
    expect(photos.cleanupExpiredUploads).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tenant-1', mode: 'multi' }),
      { dryRun: false, limit: 25 },
    );
  });

  it('runs hourly billing maintenance and read-only usage checks', async () => {
    const { billing, prisma, service, usage } = setup();
    prisma.tenant.findMany.mockResolvedValue([
      { id: 'tenant-1' },
      { id: 'tenant-2' },
    ]);
    billing.expire.mockResolvedValue({
      applied: 1,
      incomplete: false,
      processed: 1,
      results: [],
    });
    billing.reconcile.mockResolvedValue({
      discrepancies: 0,
      incomplete: false,
      processed: 1,
      results: [],
    });
    usage.reconcileTenant
      .mockResolvedValueOnce({ drift: false, incomplete: false })
      .mockResolvedValueOnce({ drift: true, incomplete: true });

    await expect(service.run('hourly', 100)).resolves.toMatchObject({
      attentionRequired: true,
      kind: 'hourly',
      result: {
        billingExpiry: { applied: 1 },
        billingReconciliation: { discrepancies: 0 },
        usage: {
          driftedTenants: 1,
          incompleteTenants: 1,
          processedTenants: 2,
          tenantScanIncomplete: false,
        },
      },
      status: 'completed',
    });
    expect(billing.expire).toHaveBeenCalledWith({
      dryRun: false,
      limit: 100,
    });
    expect(billing.reconcile).toHaveBeenCalledWith(100);
    expect(usage.reconcileTenant).toHaveBeenCalledWith('tenant-1', {
      apply: false,
      limit: 100,
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 5000,
      timeout: 3_000_000,
    });
  });

  it('reports tenant scan truncation instead of silently skipping work', async () => {
    const { photos, prisma, service } = setup();
    prisma.tenant.findMany.mockResolvedValue([
      { id: 'tenant-1' },
      { id: 'tenant-2' },
    ]);
    photos.cleanupExpiredUploads.mockResolvedValue({
      expired: 0,
      failed: 0,
      processed: 0,
    });

    await expect(service.run('uploads', 1)).resolves.toMatchObject({
      attentionRequired: true,
      result: {
        processedTenants: 1,
        tenantScanIncomplete: true,
      },
    });
    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2 }),
    );
    expect(photos.cleanupExpiredUploads).toHaveBeenCalledTimes(1);
  });
});
