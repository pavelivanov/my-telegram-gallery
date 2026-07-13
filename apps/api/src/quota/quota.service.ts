import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Tenant } from '../../generated/prisma/client';
import { getPlanPolicy } from '../plans/plan-policy';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaException } from './quota.errors';

type QuotaTransaction = Prisma.TransactionClient;

interface TenantLockOptions {
  lockTimeoutMs?: number;
  maxWaitMs?: number;
  timeoutMs?: number;
}

@Injectable()
export class QuotaService {
  constructor(private readonly prisma: PrismaService) {}

  async withTenantLock<T>(
    tenantId: string,
    work: (transaction: QuotaTransaction, tenant: Tenant) => Promise<T>,
    options: TenantLockOptions = {},
  ): Promise<T> {
    return this.prisma.$transaction(
      async (transaction) => {
        if (options.lockTimeoutMs !== undefined) {
          await transaction.$queryRaw<Array<{ set_config: string }>>(
            Prisma.sql`SELECT set_config('lock_timeout', ${`${options.lockTimeoutMs}ms`}, true)`,
          );
        }
        const locked = await transaction.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`,
        );
        if (locked.length !== 1)
          throw new NotFoundException('Tenant not found');
        const tenant = await transaction.tenant.findUnique({
          where: { id: tenantId },
        });
        if (!tenant) throw new NotFoundException('Tenant not found');
        return work(transaction, tenant);
      },
      {
        maxWait: options.maxWaitMs,
        timeout: options.timeoutMs ?? 5000,
      },
    );
  }

  async withOwnerLock<T>(
    tgUserId: bigint,
    work: (transaction: QuotaTransaction) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`tenant-owner:${tgUserId}`}, 0))`,
      );
      return work(transaction);
    });
  }

  assertMutable(tenant: Pick<Tenant, 'status'>): void {
    if (tenant.status !== 'ACTIVE') {
      throw new QuotaException('TENANT_SUSPENDED');
    }
  }

  assertAlbumCapacity(tenant: Tenant): void {
    if (tenant.albumCount >= getPlanPolicy(tenant.plan).maxAlbums) {
      throw new QuotaException('QUOTA_ALBUMS');
    }
  }

  assertPhotoCapacity(tenant: Tenant): void {
    if (tenant.photoCount >= getPlanPolicy(tenant.plan).maxPhotos) {
      throw new QuotaException('QUOTA_PHOTOS');
    }
  }

  assertUploadCapacity(tenant: Tenant, bytes: bigint): void {
    const policy = getPlanPolicy(tenant.plan);
    if (bytes > BigInt(policy.maxUploadBytes)) {
      throw new QuotaException('QUOTA_UPLOAD_BYTES', 413);
    }
    if (
      tenant.storageUsedBytes + tenant.storageReservedBytes + bytes >
      policy.maxStorageBytes
    ) {
      throw new QuotaException('QUOTA_STORAGE');
    }
  }

  assertConfirmationCapacity(
    tenant: Tenant,
    reservationBytes: bigint,
    actualStoredBytes: bigint,
  ): void {
    const policy = getPlanPolicy(tenant.plan);
    if (
      tenant.storageUsedBytes +
        tenant.storageReservedBytes -
        reservationBytes +
        actualStoredBytes >
      policy.maxStorageBytes
    ) {
      throw new QuotaException('QUOTA_STORAGE');
    }
  }
}
