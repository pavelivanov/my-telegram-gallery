import {
  BadRequestException,
  GoneException,
  Logger,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import {
  TenantPlan,
  TenantStatus,
  UploadIntentStatus,
  type Photo,
  type UploadIntent,
} from '../../generated/prisma/client';
import type { MediaService } from '../media/media.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { QuotaService } from '../quota/quota.service';
import { InMemoryStorage } from '../storage/testing/in-memory.storage';
import type { TenantContext } from '../tenants/tenant-context';
import { PhotosService } from './photos.service';

const now = new Date();
const tenant: TenantContext = {
  bot: null,
  id: 'tenant-1',
  mode: 'multi',
  name: 'Tenant one',
  slug: 'tenant_one',
  status: 'ACTIVE',
  theme: 'NOCTURNE',
};
const baseIntent: UploadIntent = {
  id: 'upload-1',
  key: 'tenants/tenant-1/photos/album-1/upload-1/original',
  albumId: 'album-1',
  tenantId: tenant.id,
  expectedMimeType: 'image/png',
  expectedSize: 5,
  reservedBytes: 5n,
  reservationReleasedAt: null,
  status: UploadIntentStatus.PENDING,
  expiresAt: new Date(Date.now() + 60_000),
  photoId: null,
  createdAt: now,
  updatedAt: now,
};
const photo: Photo = {
  id: 'photo-1',
  albumId: 'album-1',
  tenantId: tenant.id,
  key: baseIntent.key,
  thumbKey: `${baseIntent.key}.thumb.webp`,
  previewKey: `${baseIntent.key}.preview.webp`,
  mimeType: 'image/png',
  size: 5,
  storedBytes: 5n,
  width: 1,
  height: 1,
  position: 1,
  createdAt: now,
};

function setup(options: { direct?: boolean; storage?: InMemoryStorage } = {}) {
  const storage =
    options.storage ?? new InMemoryStorage(Boolean(options.direct));
  let uploadIntentCreateInput: unknown;
  const prisma = {
    album: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'album-1', tenantId: tenant.id }),
    },
    uploadIntent: {
      create: jest.fn((input: unknown) => {
        uploadIntentCreateInput = input;
        return Promise.resolve(baseIntent);
      }),
      findFirst: jest.fn().mockResolvedValue(baseIntent),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    photo: {
      aggregate: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    tenant: {
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const media = {
    serializePhoto: jest.fn().mockResolvedValue({
      id: photo.id,
      url: '/api/media/signed',
      thumbUrl: '/api/media/thumb-signed',
    }),
  };
  const tenantRow = {
    id: tenant.id,
    slug: tenant.slug,
    name: 'Tenant one',
    status: TenantStatus.ACTIVE,
    plan: TenantPlan.FREE,
    storageUsedBytes: 0n,
    storageReservedBytes: 0n,
    albumCount: 1,
    photoCount: 0,
    theme: 'NOCTURNE' as const,
    createdAt: now,
    updatedAt: now,
  };
  const quota = {
    withTenantLock: jest.fn(
      (
        _tenantId: string,
        work: (transaction: unknown, row: unknown) => unknown,
      ) => work(prisma, tenantRow),
    ),
    assertMutable: jest.fn(),
    assertAlbumCapacity: jest.fn(),
    assertPhotoCapacity: jest.fn(),
    assertUploadCapacity: jest.fn(),
    assertConfirmationCapacity: jest.fn(),
  };
  const service = new PhotosService(
    prisma as unknown as PrismaService,
    storage,
    media as unknown as MediaService,
    quota as unknown as QuotaService,
    new ConfigService({
      STORAGE_TRANSFER_MODE: options.direct ? 'direct' : 'proxy',
      UPLOAD_INTENT_TTL_SECONDS: 600,
      UPLOAD_MAX_BYTES: 1024,
    }),
  );
  return {
    getUploadIntentCreateInput: () => uploadIntentCreateInput,
    media,
    prisma,
    quota,
    service,
    storage,
  };
}

describe('PhotosService upload intents', () => {
  it('creates a proxy intent with a server-owned key', async () => {
    const { getUploadIntentCreateInput, service } = setup();

    const result = await service.createUpload(tenant, {
      albumId: 'album-1',
      contentType: 'image/png',
      size: 5,
    });

    expect(result.uploadMethod).toBe('PUT');
    expect(result.uploadUrl).toMatch(/^\/api\/photos\/uploads\/.+\/content$/);
    expect(result).not.toHaveProperty('key');
    const createInput = getUploadIntentCreateInput() as
      | { data: { albumId: string; key: string } }
      | undefined;
    expect(createInput?.data.albumId).toBe('album-1');
    expect(createInput?.data.key).toMatch(
      /^tenants\/tenant-1\/photos\/album-1\/.+\/original$/,
    );
  });

  it('creates a direct intent using the storage capability', async () => {
    const { service } = setup({ direct: true });

    const result = await service.createUpload(tenant, {
      albumId: 'album-1',
      contentType: 'image/png',
      size: 5,
    });

    expect(result.uploadMethod).toBe('PUT');
    expect(result.uploadUrl).toMatch(/^https:\/\/storage\.test\/put\//);
  });

  it('rejects oversized intent creation before persistence', async () => {
    const { prisma, service } = setup();

    await expect(
      service.createUpload(tenant, {
        albumId: 'album-1',
        contentType: 'image/png',
        size: 1025,
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(prisma.uploadIntent.create).not.toHaveBeenCalled();
  });

  it('enforces proxy stream length and cleans partial uploads', async () => {
    const { service, storage } = setup();
    const deleteSpy = jest.spyOn(storage, 'delete');

    await expect(
      service.uploadContent(
        tenant,
        baseIntent.id,
        Readable.from([Buffer.alloc(6)]),
        'image/png',
        undefined,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deleteSpy).toHaveBeenCalledWith(baseIntent.key);
    expect(storage.objects.has(baseIntent.key)).toBe(false);
  });

  it('expires stale intents and removes their known objects', async () => {
    const { prisma, service, storage } = setup();
    prisma.uploadIntent.findFirst.mockResolvedValue({
      ...baseIntent,
      expiresAt: new Date(Date.now() - 1000),
    });
    const deleteSpy = jest.spyOn(storage, 'delete');

    await expect(
      service.confirmUpload(tenant, baseIntent.id),
    ).rejects.toBeInstanceOf(GoneException);
    expect(deleteSpy).toHaveBeenCalledTimes(3);
  });

  it('rejects an authoritative size mismatch without creating a photo', async () => {
    const { prisma, service, storage } = setup();
    await storage.put(baseIntent.key, Buffer.from('wrong!'), {
      contentLength: 6,
      contentType: 'image/png',
    });

    await expect(service.confirmUpload(tenant, baseIntent.id)).rejects.toThrow(
      'size does not match',
    );
    expect(prisma.photo.create).not.toHaveBeenCalled();
    expect(storage.objects.has(baseIntent.key)).toBe(false);
  });

  it('rejects undecodable image bytes without creating a photo', async () => {
    const { prisma, service, storage } = setup();
    await storage.put(baseIntent.key, Buffer.from('image'), {
      contentLength: 5,
      contentType: 'image/png',
    });

    await expect(
      service.confirmUpload(tenant, baseIntent.id),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    expect(prisma.photo.create).not.toHaveBeenCalled();
    expect(storage.objects.has(baseIntent.key)).toBe(false);
  });

  it('returns the existing photo for repeated confirmation', async () => {
    const { media, prisma, service, storage } = setup();
    prisma.uploadIntent.findFirst.mockResolvedValue({
      ...baseIntent,
      status: UploadIntentStatus.CONFIRMED,
      photoId: photo.id,
    });
    prisma.photo.findFirst.mockResolvedValue(photo);
    const statSpy = jest.spyOn(storage, 'stat');

    await expect(
      service.confirmUpload(tenant, baseIntent.id),
    ).resolves.toMatchObject({ id: photo.id });
    expect(media.serializePhoto).toHaveBeenCalledWith(photo);
    expect(statSpy).not.toHaveBeenCalled();
  });

  it('cleans stale intents idempotently', async () => {
    const { prisma, service } = setup();
    prisma.uploadIntent.findMany
      .mockResolvedValueOnce([baseIntent])
      .mockResolvedValueOnce([]);

    await expect(service.cleanupExpiredUploads(tenant)).resolves.toEqual({
      processed: 1,
      expired: 1,
      failed: 0,
      candidates: [],
    });
    await expect(service.cleanupExpiredUploads(tenant)).resolves.toEqual({
      processed: 0,
      expired: 0,
      failed: 0,
      candidates: [],
    });
  });

  it('retains failed cleanup state and succeeds when retried', async () => {
    const { prisma, service, storage } = setup();
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    prisma.uploadIntent.findMany.mockResolvedValue([baseIntent]);
    jest
      .spyOn(storage, 'delete')
      .mockRejectedValueOnce(new Error('temporary filesystem error'));

    await expect(service.cleanupExpiredUploads(tenant)).resolves.toEqual({
      processed: 1,
      expired: 0,
      failed: 1,
      candidates: [],
    });
    await expect(service.cleanupExpiredUploads(tenant)).resolves.toEqual({
      processed: 1,
      expired: 1,
      failed: 0,
      candidates: [],
    });
    expect(prisma.uploadIntent.update).toHaveBeenCalled();
    logger.mockRestore();
  });

  it('does not decrement usage until storage deletion succeeds', async () => {
    const { prisma, service, storage } = setup();
    prisma.photo.findFirst.mockResolvedValue(photo);
    jest
      .spyOn(storage, 'delete')
      .mockRejectedValueOnce(new Error('temporary storage failure'));

    await expect(service.remove(tenant, photo.id)).rejects.toThrow(
      'temporary storage failure',
    );
    expect(prisma.photo.deleteMany).not.toHaveBeenCalled();
    expect(prisma.tenant.update).not.toHaveBeenCalled();

    await expect(service.remove(tenant, photo.id)).resolves.toBeUndefined();
    expect(prisma.photo.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.tenant.update).toHaveBeenCalledTimes(1);
  });
});
