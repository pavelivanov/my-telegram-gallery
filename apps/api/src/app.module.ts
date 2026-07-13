import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AlbumsModule } from './albums/albums.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PhotosModule } from './photos/photos.module';
import { PrismaModule } from './prisma/prisma.module';
import { validateEnv } from './config/env';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AlbumsModule,
    PhotosModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
