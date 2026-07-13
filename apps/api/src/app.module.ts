import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
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
