import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, UploadIntentStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from '../quota/quota.service';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/storage.types';

interface ReconcileTenantOptions {
  apply: boolean;
  limit: number;
}

interface PhotoUsage {
  actualBytes: bigint;
  id: string;
  storedBytes: bigint;
}

export interface TenantUsageReconciliation {
  applied: boolean;
  drift: boolean;
  incomplete: boolean;
  issues: string[];
  tenantId: string;
  tenantSlug: string;
  expected: {
    albumCount: number;
    photoCount: number;
    storageReservedBytes: string;
    storageUsedBytes: string;
  };
  recorded: {
    albumCount: number;
    photoCount: number;
    storageReservedBytes: string;
    storageUsedBytes: string;
  };
  photoByteDrift: Array<{
    actualBytes: string;
    id: string;
    storedBytes: string;
  }>;
}

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async reconcileTenant(
    tenantId: string,
    options: ReconcileTenantOptions,
  ): Promise<TenantUsageReconciliation> {
    if (options.apply) {
      return this.quota.withTenantLock(
        tenantId,
        (transaction, tenant) =>
          this.inspectAndMaybeApply(transaction, tenant, options),
        { timeoutMs: 120_000 },
      );
    }
    return this.prisma.$transaction(
      async (transaction) => {
        const tenant = await transaction.tenant.findUnique({
          where: { id: tenantId },
        });
        if (!tenant) throw new NotFoundException('Tenant not found');
        return this.inspectAndMaybeApply(transaction, tenant, options);
      },
      { timeout: 120_000 },
    );
  }

  private async inspectAndMaybeApply(
    transaction: Prisma.TransactionClient,
    tenant: {
      albumCount: number;
      id: string;
      photoCount: number;
      slug: string;
      storageReservedBytes: bigint;
      storageUsedBytes: bigint;
    },
    options: ReconcileTenantOptions,
  ): Promise<TenantUsageReconciliation> {
    const [albumCount, photoCount, photos, reservations] = await Promise.all([
      transaction.album.count({ where: { tenantId: tenant.id } }),
      transaction.photo.count({ where: { tenantId: tenant.id } }),
      transaction.photo.findMany({
        where: { tenantId: tenant.id },
        orderBy: { id: 'asc' },
        take: options.limit + 1,
        select: {
          id: true,
          key: true,
          previewKey: true,
          storedBytes: true,
          thumbKey: true,
        },
      }),
      transaction.uploadIntent.aggregate({
        where: {
          tenantId: tenant.id,
          reservationReleasedAt: null,
          status: {
            in: [
              UploadIntentStatus.PENDING,
              UploadIntentStatus.UPLOADED,
              UploadIntentStatus.FAILED,
            ],
          },
        },
        _sum: { reservedBytes: true },
      }),
    ]);
    const incomplete = photos.length > options.limit;
    const boundedPhotos = photos.slice(0, options.limit);
    const issues: string[] = [];
    const photoUsage: PhotoUsage[] = [];

    for (const photo of boundedPhotos) {
      const keys = [photo.key, photo.thumbKey, photo.previewKey].filter(
        (key): key is string => Boolean(key),
      );
      const metadata = await Promise.all(
        keys.map(async (key) => ({ key, stat: await this.storage.stat(key) })),
      );
      const missing = metadata.filter(({ stat }) => !stat);
      if (missing.length > 0) {
        issues.push(`PHOTO_OBJECT_MISSING:${photo.id}`);
        continue;
      }
      photoUsage.push({
        id: photo.id,
        storedBytes: photo.storedBytes,
        actualBytes: metadata.reduce(
          (total, { stat }) => total + BigInt(stat!.contentLength),
          0n,
        ),
      });
    }

    if (incomplete) issues.push('TENANT_PHOTO_SCAN_INCOMPLETE');
    const expectedUsedBytes = photoUsage.reduce(
      (total, photo) => total + photo.actualBytes,
      0n,
    );
    const expectedReservedBytes = reservations._sum.reservedBytes ?? 0n;
    const photoByteDrift = photoUsage
      .filter((photo) => photo.actualBytes !== photo.storedBytes)
      .map((photo) => ({
        id: photo.id,
        storedBytes: photo.storedBytes.toString(),
        actualBytes: photo.actualBytes.toString(),
      }));
    const countersDrift =
      albumCount !== tenant.albumCount ||
      photoCount !== tenant.photoCount ||
      expectedUsedBytes !== tenant.storageUsedBytes ||
      expectedReservedBytes !== tenant.storageReservedBytes;
    const drift =
      countersDrift || photoByteDrift.length > 0 || issues.length > 0;
    let applied = false;

    if (options.apply && issues.length === 0 && drift) {
      for (const photo of photoUsage) {
        if (photo.actualBytes !== photo.storedBytes) {
          await transaction.photo.update({
            where: { id: photo.id },
            data: { storedBytes: photo.actualBytes },
          });
        }
      }
      await transaction.tenant.update({
        where: { id: tenant.id },
        data: {
          albumCount,
          photoCount,
          storageReservedBytes: expectedReservedBytes,
          storageUsedBytes: expectedUsedBytes,
        },
      });
      applied = true;
    }

    if (drift) {
      this.logger.warn(
        JSON.stringify({
          event: 'tenant_usage_drift',
          tenantId: tenant.id,
          issueTypes: issues,
          photoByteDriftCount: photoByteDrift.length,
          countersDrift,
          applied,
        }),
      );
    }

    return {
      applied,
      drift,
      incomplete,
      issues,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      expected: {
        albumCount,
        photoCount,
        storageReservedBytes: expectedReservedBytes.toString(),
        storageUsedBytes: expectedUsedBytes.toString(),
      },
      recorded: {
        albumCount: tenant.albumCount,
        photoCount: tenant.photoCount,
        storageReservedBytes: tenant.storageReservedBytes.toString(),
        storageUsedBytes: tenant.storageUsedBytes.toString(),
      },
      photoByteDrift,
    };
  }
}
