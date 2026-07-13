import type { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from './quota.service';

describe('QuotaService tenant locking', () => {
  it('applies bounded connection, transaction, and PostgreSQL lock waits', async () => {
    const tenant = { id: 'tenant-1' };
    const transaction = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ set_config: '1250ms' }])
        .mockResolvedValueOnce([{ id: tenant.id }]),
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
    };
    const prisma = {
      $transaction: jest.fn(
        async (work: (client: typeof transaction) => Promise<unknown>) =>
          work(transaction),
      ),
    };
    const work = jest.fn().mockResolvedValue('done');

    await expect(
      new QuotaService(prisma as unknown as PrismaService).withTenantLock(
        tenant.id,
        work,
        { lockTimeoutMs: 1250, maxWaitMs: 250, timeoutMs: 1750 },
      ),
    ).resolves.toBe('done');

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 250,
      timeout: 1750,
    });
    expect(work).toHaveBeenCalledWith(transaction, tenant);
  });
});
