import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { createTelegramInitData } from './helpers/telegram-init-data';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('serves the production-prefixed health endpoint', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('rejects a missing Telegram authorization header', () => {
    return request(app.getHttpServer()).get('/api/albums').expect(401);
  });

  it('rejects non-whitelisted DTO fields through the production pipe', () => {
    const initData = createTelegramInitData({
      botToken: process.env.TELEGRAM_BOT_TOKEN!,
      user: { id: 1, first_name: 'Admin' },
    });

    return request(app.getHttpServer())
      .post('/api/albums')
      .set('Authorization', `tma ${initData}`)
      .send({ name: 'Valid name', unexpected: true })
      .expect(400);
  });

  afterAll(async () => {
    await app.close();
  });
});
