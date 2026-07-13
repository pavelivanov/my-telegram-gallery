import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import sharp from 'sharp';
import { TenantPlan } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { validateEnv } from '../src/config/env';
import { PrismaService } from '../src/prisma/prisma.service';
import { getPlanPolicy } from '../src/plans/plan-policy';
import { PhotosService } from '../src/photos/photos.service';
import { UsageService } from '../src/usage/usage.service';
import { createTelegramInitData } from './helpers/telegram-init-data';

interface AlbumResponseBody {
  id: string;
}

interface UploadIntentResponseBody {
  uploadId: string;
  uploadMethod: string;
  uploadUrl: string;
}

interface PhotoResponseBody {
  id: string;
  height: number;
  mimeType: string;
  size: number;
  thumbUrl: string;
  url: string;
  width: number;
}

interface AlbumDetailResponseBody {
  photos: Array<Record<string, unknown>>;
}

describe('Application (e2e)', () => {
  let app: INestApplication<App>;
  let authorization: string;
  let defaultAlbum: AlbumResponseBody;
  let defaultPhotoId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    authorization = `tma ${createTelegramInitData({
      botToken: process.env.TELEGRAM_BOT_TOKEN!,
      user: { id: 1, first_name: 'Admin' },
    })}`;
  });

  it('serves liveness and dependency-aware readiness endpoints', async () => {
    await request(app.getHttpServer())
      .get('/api/health/live')
      .expect(200)
      .expect('X-Content-Type-Options', 'nosniff')
      .expect({ status: 'ok' });
    await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(200)
      .expect({ status: 'ready' });
  });

  it('serves gallery and admin assets without swallowing API 404s', async () => {
    await request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('X-Content-Type-Options', 'nosniff')
      .expect(/gallery-static/);
    await request(app.getHttpServer())
      .get('/admin/')
      .expect(200)
      .expect(/admin-static/);
    await request(app.getHttpServer())
      .get('/api/not-found')
      .expect(404)
      .expect('Content-Type', /json/)
      .expect((response) => {
        expect(response.text).not.toContain('gallery-static');
      });
  });

  it('returns an exact allowlist of non-secret public configuration', () => {
    return request(app.getHttpServer())
      .get('/api/config/public')
      .expect(200)
      .expect({
        botUsername: process.env.TELEGRAM_BOT_USERNAME,
        adminAppShortName: process.env.TELEGRAM_ADMIN_APP_SHORT_NAME,
        galleryAppShortName: process.env.TELEGRAM_GALLERY_APP_SHORT_NAME,
        tenancyMode: 'single',
        uploadMaxBytes: Number(process.env.UPLOAD_MAX_BYTES),
      });
  });

  it('rejects a missing Telegram authorization header', () => {
    return request(app.getHttpServer()).get('/api/albums').expect(401);
  });

  it('rejects non-whitelisted DTO fields through the production pipe', () => {
    return request(app.getHttpServer())
      .post('/api/albums')
      .set('Authorization', authorization)
      .send({ name: 'Valid name', unexpected: true })
      .expect(400);
  });

  it('uploads, confirms, serializes, and streams an image through proxy mode', async () => {
    const albumResponse = await request(app.getHttpServer())
      .post('/api/albums')
      .set('Authorization', authorization)
      .send({ name: 'Proxy upload' })
      .expect(201);
    const albumBody = albumResponse.body as AlbumResponseBody;
    defaultAlbum = albumBody;
    const image = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: '#336699',
      },
    })
      .png()
      .toBuffer();
    const intentResponse = await request(app.getHttpServer())
      .post('/api/photos/upload')
      .set('Authorization', authorization)
      .send({
        albumId: albumBody.id,
        contentType: 'image/png',
        size: image.length,
      })
      .expect(201);
    const intentBody = intentResponse.body as UploadIntentResponseBody;

    expect(intentBody.uploadMethod).toBe('PUT');
    expect(intentBody.uploadUrl).toMatch(
      /^\/api\/photos\/uploads\/.+\/content$/,
    );
    expect(intentBody).not.toHaveProperty('key');
    await request(app.getHttpServer())
      .put(intentBody.uploadUrl)
      .set('Authorization', authorization)
      .set('Content-Type', 'image/png')
      .send(image)
      .expect(200);
    const confirmResponse = await request(app.getHttpServer())
      .post('/api/photos/confirm')
      .set('Authorization', authorization)
      .send({ uploadId: intentBody.uploadId })
      .expect(201);
    const confirmBody = confirmResponse.body as PhotoResponseBody;
    defaultPhotoId = confirmBody.id;

    expect(confirmBody.mimeType).toBe('image/png');
    expect(confirmBody.size).toBe(image.length);
    expect(confirmBody.width).toBe(2);
    expect(confirmBody.height).toBe(2);
    expect(confirmBody.url).toMatch(/^\/api\/media\/tenants\//);
    expect(confirmBody.thumbUrl).toMatch(/^\/api\/media\/tenants\//);
    expect(JSON.stringify(confirmBody)).not.toContain('photos/album');

    const album = await request(app.getHttpServer())
      .get(`/api/albums/${albumBody.id}`)
      .set('Authorization', authorization)
      .expect(200);
    const albumDetail = album.body as AlbumDetailResponseBody;
    expect(albumDetail.photos).toHaveLength(1);
    expect(albumDetail.photos[0]).not.toHaveProperty('key');

    const signedUrl = new URL(confirmBody.url, 'http://localhost');
    const mediaResponse = await request(app.getHttpServer())
      .get(`${signedUrl.pathname}${signedUrl.search}`)
      .expect(200);
    expect(mediaResponse.headers['content-type']).toMatch(/^image\/png/);
    expect(mediaResponse.headers['content-length']).toBe(String(image.length));
    expect(mediaResponse.headers['x-content-type-options']).toBe('nosniff');
    expect(mediaResponse.body as Buffer).toEqual(image);

    await request(app.getHttpServer())
      .post('/api/photos/confirm')
      .set('Authorization', authorization)
      .send({ uploadId: intentBody.uploadId })
      .expect(201)
      .expect((response) => {
        expect((response.body as PhotoResponseBody).id).toBe(confirmBody.id);
      });
  });

  it('rejects declared image data that Sharp cannot decode', async () => {
    const albumBody = defaultAlbum;
    const bytes = Buffer.from('not an image');
    const intent = await request(app.getHttpServer())
      .post('/api/photos/upload')
      .set('Authorization', authorization)
      .send({
        albumId: albumBody.id,
        contentType: 'image/png',
        size: bytes.length,
      })
      .expect(201);
    const intentBody = intent.body as UploadIntentResponseBody;
    await request(app.getHttpServer())
      .put(intentBody.uploadUrl)
      .set('Authorization', authorization)
      .set('Content-Type', 'image/png')
      .send(bytes)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/photos/confirm')
      .set('Authorization', authorization)
      .send({ uploadId: intentBody.uploadId })
      .expect(415);

    const albumAfter = await request(app.getHttpServer())
      .get(`/api/albums/${albumBody.id}`)
      .set('Authorization', authorization)
      .expect(200);
    expect(
      (albumAfter.body as AlbumDetailResponseBody).photos.map(({ id }) => id),
    ).toEqual([defaultPhotoId]);
  });

  it('rejects an upload larger than the configured maximum', () => {
    const generatedLargeFile = Buffer.alloc(
      Number(process.env.UPLOAD_MAX_BYTES) + 1,
    );
    return request(app.getHttpServer())
      .post('/api/photos/upload')
      .set('Authorization', authorization)
      .send({
        albumId: 'not-reached',
        contentType: 'image/png',
        size: generatedLargeFile.length,
      })
      .expect(413);
  });

  afterAll(async () => {
    await app.close();
  });
});

interface TenantResponseBody {
  id: string;
  name: string;
  plan: string;
  slug: string;
  status: string;
  usage: {
    albumCount: number;
    albumLimit: number;
    photoCount: number;
    photoLimit: number;
    storageLimitBytes: string;
    storageReservedBytes: string;
    storageUsedBytes: string;
  };
}

describe('Tenant isolation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let alpha: TenantResponseBody;
  let beta: TenantResponseBody;
  let alphaAlbum: AlbumResponseBody;
  let betaAlbum: AlbumResponseBody;
  let alphaPhoto: PhotoResponseBody;

  function authorization(userId: number, startParam?: string): string {
    return `tma ${createTelegramInitData({
      botToken: process.env.TELEGRAM_BOT_TOKEN!,
      startParam,
      user: { id: userId, first_name: `User ${userId}` },
    })}`;
  }

  beforeAll(async () => {
    const multiEnvironment = validateEnv({
      ...process.env,
      ADMIN_TG_ID: '',
      ADMIN_TG_IDS: '',
      TENANCY_MODE: 'multi',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService(multiEnvironment))
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  it('onboards independent owners without serializing Telegram BigInts', async () => {
    const alphaResponse = await request(app.getHttpServer())
      .post('/api/tenants')
      .set('Authorization', authorization(101))
      .send({ name: 'Alpha Gallery', slug: 'alpha_gallery' })
      .expect(201);
    alpha = alphaResponse.body as TenantResponseBody;

    const betaResponse = await request(app.getHttpServer())
      .post('/api/tenants')
      .set('Authorization', authorization(202))
      .send({ name: 'Beta Gallery', slug: 'beta_gallery' })
      .expect(201);
    beta = betaResponse.body as TenantResponseBody;

    expect(alpha).toMatchObject({
      name: 'Alpha Gallery',
      plan: 'free',
      slug: 'alpha_gallery',
      status: 'active',
    });
    expect(JSON.stringify(alphaResponse.body)).not.toContain('101');

    await request(app.getHttpServer())
      .post('/api/tenants')
      .set('Authorization', authorization(202))
      .send({ name: 'Duplicate', slug: 'alpha_gallery' })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/tenants')
      .set('Authorization', authorization(101))
      .send({ name: 'Reserved', slug: 'admin' })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/tenants')
      .set('Authorization', authorization(101))
      .send({ name: 'Second gallery', slug: 'alpha_second' })
      .expect(409)
      .expect((response) => {
        expect(response.body).toMatchObject({ code: 'QUOTA_TENANTS' });
      });

    await request(app.getHttpServer())
      .get('/api/tenants')
      .set('Authorization', authorization(101))
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([
          expect.objectContaining({ id: alpha.id }),
        ]);
      });

    await request(app.getHttpServer())
      .get('/api/albums')
      .set('Authorization', authorization(303))
      .expect(404);
  });

  it('keeps selectors separate from owner authorization and scopes albums', async () => {
    const alphaAlbumResponse = await request(app.getHttpServer())
      .post('/api/albums')
      .set('Authorization', authorization(101))
      .set('X-Tenant-Slug', alpha.slug)
      .send({ name: 'Alpha album' })
      .expect(201);
    alphaAlbum = alphaAlbumResponse.body as AlbumResponseBody;
    await request(app.getHttpServer())
      .post('/api/albums')
      .set('Authorization', authorization(101))
      .set('X-Tenant-Slug', alpha.slug)
      .send({ name: 'Over the Free limit' })
      .expect(409)
      .expect((response) => {
        expect(response.body).toMatchObject({ code: 'QUOTA_ALBUMS' });
      });

    await request(app.getHttpServer())
      .post('/api/albums')
      .set('Authorization', authorization(202))
      .set('X-Tenant-Slug', alpha.slug)
      .send({ name: 'Unauthorized album' })
      .expect(403);

    const betaAlbumResponse = await request(app.getHttpServer())
      .post('/api/albums')
      .set('Authorization', authorization(202))
      .set('X-Tenant-Slug', beta.slug)
      .send({ name: 'Beta album' })
      .expect(201);
    betaAlbum = betaAlbumResponse.body as AlbumResponseBody;

    await request(app.getHttpServer())
      .get('/api/albums')
      .set('Authorization', authorization(303))
      .set('X-Tenant-Slug', alpha.slug)
      .expect(200)
      .expect((response) => {
        const ids = (response.body as AlbumResponseBody[]).map(({ id }) => id);
        expect(ids).toContain(alphaAlbum.id);
        expect(ids).not.toContain(betaAlbum.id);
      });

    await request(app.getHttpServer())
      .get(`/api/albums/${alphaAlbum.id}`)
      .set('Authorization', authorization(303))
      .set('X-Tenant-Slug', beta.slug)
      .expect(404);

    await request(app.getHttpServer())
      .post('/api/photos/upload')
      .set('Authorization', authorization(202))
      .set('X-Tenant-Slug', beta.slug)
      .send({
        albumId: alphaAlbum.id,
        contentType: 'image/png',
        size: 100,
      })
      .expect(404);

    await request(app.getHttpServer())
      .post('/api/albums')
      .set('Authorization', authorization(202, `tenant_${alpha.slug}`))
      .send({ name: 'Start param is not authorization' })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/albums/${alphaAlbum.id}`)
      .set('Authorization', authorization(303, `album_${alphaAlbum.id}`))
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: alphaAlbum.id,
          tenantSlug: alpha.slug,
        });
      });
  });

  it('isolates object keys, upload flows, signed media, deletes, and constraints', async () => {
    const image = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: '#aa5500',
      },
    })
      .png()
      .toBuffer();

    const alphaIntentResponse = await request(app.getHttpServer())
      .post('/api/photos/upload')
      .set('Authorization', authorization(101))
      .set('X-Tenant-Slug', alpha.slug)
      .send({
        albumId: alphaAlbum.id,
        contentType: 'image/png',
        size: image.length,
      })
      .expect(201);
    const alphaIntent = alphaIntentResponse.body as UploadIntentResponseBody;
    const storedIntent = await prisma.uploadIntent.findUnique({
      where: { id: alphaIntent.uploadId },
    });
    expect(storedIntent?.key).toMatch(
      new RegExp(`^tenants/${alpha.id}/photos/${alphaAlbum.id}/`),
    );

    await request(app.getHttpServer())
      .put(alphaIntent.uploadUrl)
      .set('Authorization', authorization(101))
      .set('X-Tenant-Slug', alpha.slug)
      .set('Content-Type', 'image/png')
      .send(image)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/photos/confirm')
      .set('Authorization', authorization(202))
      .set('X-Tenant-Slug', beta.slug)
      .send({ uploadId: alphaIntent.uploadId })
      .expect(404);

    const confirmedResponse = await request(app.getHttpServer())
      .post('/api/photos/confirm')
      .set('Authorization', authorization(101))
      .set('X-Tenant-Slug', alpha.slug)
      .send({ uploadId: alphaIntent.uploadId })
      .expect(201);
    const confirmed = confirmedResponse.body as PhotoResponseBody;
    alphaPhoto = confirmed;
    const confirmedRecord = await prisma.photo.findUnique({
      where: { id: confirmed.id },
    });
    const alphaAfterConfirm = await prisma.tenant.findUnique({
      where: { id: alpha.id },
    });
    expect(confirmedRecord?.storedBytes).toBeGreaterThan(BigInt(image.length));
    expect(alphaAfterConfirm).toMatchObject({
      photoCount: 1,
      storageReservedBytes: 0n,
      storageUsedBytes: confirmedRecord?.storedBytes,
    });
    const signedUrl = new URL(confirmed.url, 'http://localhost');
    await request(app.getHttpServer())
      .get(`${signedUrl.pathname}${signedUrl.search}`)
      .expect(200);

    const tamperedPath = signedUrl.pathname.replace(alpha.id, beta.id);
    await request(app.getHttpServer())
      .get(`${tamperedPath}${signedUrl.search}`)
      .expect(403);

    const betaIntentResponse = await request(app.getHttpServer())
      .post('/api/photos/upload')
      .set('Authorization', authorization(202))
      .set('X-Tenant-Slug', beta.slug)
      .send({
        albumId: betaAlbum.id,
        contentType: 'image/png',
        size: image.length,
      })
      .expect(201);
    const betaIntent = betaIntentResponse.body as UploadIntentResponseBody;
    expect(
      (
        await prisma.uploadIntent.findUnique({
          where: { id: betaIntent.uploadId },
        })
      )?.key,
    ).toMatch(new RegExp(`^tenants/${beta.id}/photos/${betaAlbum.id}/`));
    await request(app.getHttpServer())
      .put(betaIntent.uploadUrl)
      .set('Authorization', authorization(202))
      .set('X-Tenant-Slug', beta.slug)
      .set('Content-Type', 'image/png')
      .send(image)
      .expect(200);
    const betaConfirmedResponse = await request(app.getHttpServer())
      .post('/api/photos/confirm')
      .set('Authorization', authorization(202))
      .set('X-Tenant-Slug', beta.slug)
      .send({ uploadId: betaIntent.uploadId })
      .expect(201);
    const betaConfirmed = betaConfirmedResponse.body as PhotoResponseBody;

    await request(app.getHttpServer())
      .get('/api/photos')
      .set('Authorization', authorization(303))
      .set('X-Tenant-Slug', alpha.slug)
      .expect(200)
      .expect((response) => {
        const ids = (response.body as PhotoResponseBody[]).map(({ id }) => id);
        expect(ids).toContain(confirmed.id);
        expect(ids).not.toContain(betaConfirmed.id);
      });
    await request(app.getHttpServer())
      .get('/api/photos')
      .set('Authorization', authorization(303))
      .set('X-Tenant-Slug', beta.slug)
      .expect(200)
      .expect((response) => {
        const ids = (response.body as PhotoResponseBody[]).map(({ id }) => id);
        expect(ids).toContain(betaConfirmed.id);
        expect(ids).not.toContain(confirmed.id);
      });

    await request(app.getHttpServer())
      .put(`/api/albums/${alphaAlbum.id}/order`)
      .set('Authorization', authorization(202))
      .set('X-Tenant-Slug', beta.slug)
      .send({ photoIds: [confirmed.id] })
      .expect(404);
    await request(app.getHttpServer())
      .put(`/api/albums/${alphaAlbum.id}/order`)
      .set('Authorization', authorization(101))
      .set('X-Tenant-Slug', alpha.slug)
      .send({ photoIds: [confirmed.id] })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/photos/${confirmed.id}`)
      .set('Authorization', authorization(202))
      .set('X-Tenant-Slug', beta.slug)
      .expect(404);

    await expect(
      prisma.photo.create({
        data: {
          albumId: alphaAlbum.id,
          tenantId: beta.id,
          key: 'tenants/constraint-test/cross-tenant-original',
          mimeType: 'image/png',
          size: 1,
        },
      }),
    ).rejects.toBeDefined();
  });

  it('serializes last-byte reservations and keeps deletion accounting exact', async () => {
    const beforeDelete = await prisma.tenant.findUniqueOrThrow({
      where: { id: alpha.id },
    });
    const photoRecord = await prisma.photo.findUniqueOrThrow({
      where: { id: alphaPhoto.id },
    });
    await request(app.getHttpServer())
      .delete(`/api/photos/${alphaPhoto.id}`)
      .set('Authorization', authorization(101))
      .set('X-Tenant-Slug', alpha.slug)
      .expect(200);
    const afterDelete = await prisma.tenant.findUniqueOrThrow({
      where: { id: alpha.id },
    });
    expect(afterDelete.photoCount).toBe(beforeDelete.photoCount - 1);
    expect(afterDelete.storageUsedBytes).toBe(
      beforeDelete.storageUsedBytes - photoRecord.storedBytes,
    );

    const reservationBytes = 512;
    const storageLimit = getPlanPolicy(TenantPlan.FREE).maxStorageBytes;
    await prisma.tenant.update({
      where: { id: alpha.id },
      data: {
        photoCount: 0,
        storageUsedBytes: storageLimit - BigInt(reservationBytes),
        storageReservedBytes: 0,
      },
    });
    const attempts = await Promise.all([
      request(app.getHttpServer())
        .post('/api/photos/upload')
        .set('Authorization', authorization(101))
        .set('X-Tenant-Slug', alpha.slug)
        .send({
          albumId: alphaAlbum.id,
          contentType: 'image/png',
          size: reservationBytes,
        }),
      request(app.getHttpServer())
        .post('/api/photos/upload')
        .set('Authorization', authorization(101))
        .set('X-Tenant-Slug', alpha.slug)
        .send({
          albumId: alphaAlbum.id,
          contentType: 'image/png',
          size: reservationBytes,
        }),
    ]);
    expect(attempts.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(attempts.find(({ status }) => status === 409)?.body).toMatchObject({
      code: 'QUOTA_STORAGE',
    });
    const admitted = attempts.find(({ status }) => status === 201)?.body as
      | UploadIntentResponseBody
      | undefined;
    expect(admitted?.uploadId).toBeDefined();
    expect(
      await prisma.tenant.findUniqueOrThrow({ where: { id: alpha.id } }),
    ).toMatchObject({ storageReservedBytes: BigInt(reservationBytes) });

    await prisma.$transaction([
      prisma.uploadIntent.delete({ where: { id: admitted!.uploadId } }),
      prisma.tenant.update({
        where: { id: alpha.id },
        data: { storageUsedBytes: 0, storageReservedBytes: 0 },
      }),
    ]);

    await prisma.tenant.update({
      where: { id: alpha.id },
      data: { photoCount: 100 },
    });
    await request(app.getHttpServer())
      .post('/api/photos/upload')
      .set('Authorization', authorization(101))
      .set('X-Tenant-Slug', alpha.slug)
      .send({
        albumId: alphaAlbum.id,
        contentType: 'image/png',
        size: 1,
      })
      .expect(409)
      .expect((response) => {
        expect(response.body).toMatchObject({ code: 'QUOTA_PHOTOS' });
      });
    await prisma.tenant.update({
      where: { id: alpha.id },
      data: { photoCount: 0 },
    });

    const usage = app.get(UsageService);
    await prisma.tenant.update({
      where: { id: alpha.id },
      data: { albumCount: 0 },
    });
    await expect(
      usage.reconcileTenant(alpha.id, { apply: false, limit: 100 }),
    ).resolves.toMatchObject({ applied: false, drift: true });
    await expect(
      usage.reconcileTenant(alpha.id, { apply: true, limit: 100 }),
    ).resolves.toMatchObject({ applied: true, drift: true });
    await expect(
      usage.reconcileTenant(alpha.id, { apply: true, limit: 100 }),
    ).resolves.toMatchObject({
      applied: false,
      drift: false,
      incomplete: false,
      issues: [],
    });

    const staleId = 'stale_quota_intent';
    await prisma.$transaction([
      prisma.uploadIntent.create({
        data: {
          id: staleId,
          key: `tenants/${alpha.id}/photos/${alphaAlbum.id}/${staleId}/original`,
          tenantId: alpha.id,
          albumId: alphaAlbum.id,
          expectedMimeType: 'image/png',
          expectedSize: 10,
          reservedBytes: 10,
          expiresAt: new Date(Date.now() - 60_000),
        },
      }),
      prisma.tenant.update({
        where: { id: alpha.id },
        data: { storageReservedBytes: { increment: 10 } },
      }),
    ]);
    const photos = app.get(PhotosService);
    const tenantContext = {
      id: alpha.id,
      mode: 'multi' as const,
      slug: alpha.slug,
      status: 'ACTIVE' as const,
    };
    await expect(
      photos.cleanupExpiredUploads(tenantContext, {
        dryRun: true,
        limit: 1,
      }),
    ).resolves.toMatchObject({ candidates: [staleId], expired: 0 });
    await expect(
      photos.cleanupExpiredUploads(tenantContext, { limit: 1 }),
    ).resolves.toMatchObject({ expired: 1, failed: 0 });
    await expect(
      photos.cleanupExpiredUploads(tenantContext, { limit: 1 }),
    ).resolves.toMatchObject({ processed: 0 });
    expect(
      await prisma.tenant.findUniqueOrThrow({ where: { id: alpha.id } }),
    ).toMatchObject({ storageReservedBytes: 0n });
  });

  it('hides suspended galleries while giving their owner a clear denial', async () => {
    await prisma.tenant.update({
      where: { id: alpha.id },
      data: { status: 'SUSPENDED' },
    });

    await request(app.getHttpServer())
      .get('/api/albums')
      .set('Authorization', authorization(303))
      .set('X-Tenant-Slug', alpha.slug)
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/albums')
      .set('Authorization', authorization(101))
      .set('X-Tenant-Slug', alpha.slug)
      .send({ name: 'Suspended write' })
      .expect(409)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'TENANT_SUSPENDED',
          message: 'This gallery is suspended and is read-only.',
        });
      });

    await prisma.tenant.update({
      where: { id: alpha.id },
      data: { status: 'ACTIVE' },
    });
  });

  afterAll(async () => {
    await app?.close();
  });
});
