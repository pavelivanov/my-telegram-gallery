import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { App } from 'supertest/types';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
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

    expect(confirmBody.mimeType).toBe('image/png');
    expect(confirmBody.size).toBe(image.length);
    expect(confirmBody.width).toBe(2);
    expect(confirmBody.height).toBe(2);
    expect(confirmBody.url).toMatch(/^\/api\/media\/photos\//);
    expect(confirmBody.thumbUrl).toMatch(/^\/api\/media\/photos\//);
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
    const album = await request(app.getHttpServer())
      .post('/api/albums')
      .set('Authorization', authorization)
      .send({ name: 'Invalid image' })
      .expect(201);
    const albumBody = album.body as AlbumResponseBody;
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
    expect((albumAfter.body as AlbumDetailResponseBody).photos).toEqual([]);
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
