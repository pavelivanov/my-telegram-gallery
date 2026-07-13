import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'node:path';
import { AlbumsModule } from './albums/albums.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PhotosModule } from './photos/photos.module';
import { PrismaModule } from './prisma/prisma.module';
import { validateEnv } from './config/env';
import { StorageModule } from './storage/storage.module';
import { PublicConfigModule } from './public-config/public-config.module';
import { HealthModule } from './health/health.module';
import { TenantsModule } from './tenants/tenants.module';
import { QuotaModule } from './quota/quota.module';
import { UsageModule } from './usage/usage.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { createRateLimitOptions } from './security/rate-limit';
import { RateLimitModule } from './security/rate-limit.module';
import { ReportsModule } from './reports/reports.module';
import { OpsModule } from './ops/ops.module';
import { TelegramModule } from './telegram/telegram.module';
import { BillingModule } from './billing/billing.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { PublicGalleriesModule } from './public-galleries/public-galleries.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createRateLimitOptions,
    }),
    RateLimitModule,
    ServeStaticModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const staticRoot = config.get<string>('STATIC_ROOT');
        if (!staticRoot) return [];

        return [
          {
            rootPath: join(staticRoot, 'admin'),
            serveRoot: '/admin',
            renderPath: '/{*path}',
            exclude: ['/api', '/api/{*path}'],
          },
          {
            rootPath: join(staticRoot, 'gallery'),
            renderPath: '/{*path}',
            exclude: ['/api', '/api/{*path}', '/admin', '/admin/{*path}'],
          },
        ];
      },
    }),
    PrismaModule,
    QuotaModule,
    UsageModule,
    TelegramModule,
    BillingModule,
    WebhooksModule,
    ReportsModule,
    PublicGalleriesModule,
    OpsModule,
    StorageModule,
    TenantsModule,
    AlbumsModule,
    PhotosModule,
    PublicConfigModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
