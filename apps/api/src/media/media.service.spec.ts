import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Photo } from '../../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { InMemoryStorage } from '../storage/testing/in-memory.storage';
import { MediaUrlSigner } from './media-url.signer';
import { MediaService } from './media.service';

const photo: Photo = {
  id: 'photo-1',
  albumId: 'album-1',
  key: 'photos/album-1/photo-1/original',
  thumbKey: 'photos/album-1/photo-1/original.thumb.webp',
  previewKey: 'photos/album-1/photo-1/original.preview.webp',
  mimeType: 'image/png',
  size: 5,
  width: 1,
  height: 1,
  position: 1,
  createdAt: new Date(),
};

function setup(direct = false) {
  const config = new ConfigService({
    MEDIA_URL_SIGNING_SECRET: 'test-media-signing-secret-32-bytes-long',
    MEDIA_URL_TTL_SECONDS: 3600,
    STORAGE_TRANSFER_MODE: direct ? 'direct' : 'proxy',
  });
  const storage = new InMemoryStorage(direct);
  const prisma = {
    photo: { findUnique: jest.fn().mockResolvedValue(photo) },
  };
  const signer = new MediaUrlSigner(config);
  const service = new MediaService(
    prisma as unknown as PrismaService,
    storage,
    signer,
    config,
  );
  return { prisma, service, signer, storage };
}

describe('MediaService', () => {
  it('serializes proxy URLs without exposing storage keys', async () => {
    const { service } = setup();

    const result = await service.serializePhoto(photo);

    expect(result.url).toMatch(/^\/api\/media\/photos\/photo-1\/original\?/);
    expect(result.thumbUrl).toMatch(/^\/api\/media\/photos\/photo-1\/thumb\?/);
    expect(result).not.toHaveProperty('key');
    expect(result).not.toHaveProperty('thumbKey');
    expect(JSON.stringify(result)).not.toContain(photo.key);
  });

  it('keeps direct presigned S3-compatible delivery available', async () => {
    const { service } = setup(true);

    await expect(service.urlForVariant(photo, 'original')).resolves.toMatch(
      /^https:\/\/storage\.test\/get\//,
    );
  });

  it('verifies the signature before database and storage access', async () => {
    const { prisma, service, storage } = setup();
    const getSpy = jest.spyOn(storage, 'get');

    await expect(
      service.resolveSignedMedia('photo-1', 'original', '9999999999', 'bad'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.photo.findUnique).not.toHaveBeenCalled();
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('streams a valid signed variant from storage', async () => {
    const { service, signer, storage } = setup();
    await storage.put(photo.key, Buffer.from('image'), {
      contentLength: 5,
      contentType: 'image/png',
    });
    const expires = Math.floor(Date.now() / 1000) + 60;
    const signature = signer.sign(photo.id, 'original', expires);

    await expect(
      service.resolveSignedMedia(
        photo.id,
        'original',
        String(expires),
        signature,
      ),
    ).resolves.toMatchObject({
      expires,
      object: { contentLength: 5, contentType: 'image/png' },
    });
  });

  it('returns not found for a missing photo after signature validation', async () => {
    const { prisma, service, signer } = setup();
    prisma.photo.findUnique.mockResolvedValue(null);
    const expires = Math.floor(Date.now() / 1000) + 60;

    await expect(
      service.resolveSignedMedia(
        'missing',
        'thumb',
        String(expires),
        signer.sign('missing', 'thumb', expires),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
